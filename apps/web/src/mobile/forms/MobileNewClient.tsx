import { useMemo, useState } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { clientStore } from "@/pages/clients/clientStore";
import type { Client, ClientSource } from "@/lib/mock/clients";
import {
  useConvertApplication,
  type ConvertApplicationInput,
} from "@/lib/api/clientApplications";
import { toast, confirmDialog } from "@/lib/toast";
import { MobileFormScreen, Field, TextInput, SegmentToggle, ChipSelect } from "../forms";

/** Предзаполнение формы (например из принимаемой заявки). */
export type MobileClientInitial = {
  name?: string;
  phone?: string;
  phone2?: string;
  birth?: string;
  isForeigner?: boolean;
  passportRaw?: string;
  passSer?: string;
  passNum?: string;
  source?: ClientSource | null;
};

const SOURCE_OPTIONS: { id: ClientSource; label: string }[] = [
  { id: "avito", label: "Авито" },
  { id: "repeat", label: "Повторный" },
  { id: "ref", label: "Рекомендация" },
  { id: "maps", label: "Карты" },
  { id: "other", label: "Другой" },
];

/* — валидаторы (зеркало AddClientModal, локальные) — */
function validateName(v: string): string | null {
  const parts = v.trim().split(/\s+/);
  if (parts.length < 2 || !parts[0] || !parts[1]) return "Нужно минимум Имя и Фамилия";
  return null;
}
function validatePhone(v: string): string | null {
  if (v.replace(/\D/g, "").length !== 11) return "Введите 11 цифр телефона";
  return null;
}
function validateBirth(v: string): string | null {
  const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "Формат ДД.ММ.ГГГГ";
  return null;
}
function validateSeries(v: string): string | null {
  if (!/^\d{4}$/.test(v.trim())) return "4 цифры";
  return null;
}
function validateNumber(v: string): string | null {
  if (!/^\d{6}$/.test(v.trim())) return "6 цифр";
  return null;
}

/** DD.MM.YYYY → YYYY-MM-DD (для birthDate в API). */
function birthToIso(v: string): string | null {
  const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Сегодня в формате DD.MM.YY для поля added. */
function todayShort(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`;
}

export function MobileNewClient({
  onClose,
  onCreated,
  applicationId,
  initial,
}: {
  onClose: () => void;
  onCreated?: (client: Client) => void;
  /** Если задан — форма оформляет клиента из заявки (convert). */
  applicationId?: number;
  initial?: MobileClientInitial;
}) {
  const isConvert = applicationId != null;
  const convertMut = useConvertApplication();

  // v1.0.4: черновик формы переживает случайный refresh. Ключ — по заявке
  // (или "new"), чтобы черновики разных заявок не смешивались. Файлов нет —
  // поля текстовые. clearDraft() на успехе и при подтверждённом закрытии.
  const dk = `mnc:${applicationId ?? "new"}`;
  const [name, setName, cName] = usePersistedState(`${dk}:name`, initial?.name ?? "");
  const [phone, setPhone, cPhone] = usePersistedState(`${dk}:phone`, initial?.phone ?? "");
  const [phone2, setPhone2, cPhone2] = usePersistedState(
    `${dk}:phone2`,
    initial?.phone2 ?? "",
  );
  const [birth, setBirth, cBirth] = usePersistedState(`${dk}:birth`, initial?.birth ?? "");
  const [foreigner, setForeigner, cForeigner] = usePersistedState<"rf" | "foreign">(
    `${dk}:foreigner`,
    initial?.isForeigner ? "foreign" : "rf",
  );
  const [passSer, setPassSer, cPassSer] = usePersistedState(
    `${dk}:passSer`,
    initial?.passSer ?? "",
  );
  const [passNum, setPassNum, cPassNum] = usePersistedState(
    `${dk}:passNum`,
    initial?.passNum ?? "",
  );
  const [passportRaw, setPassportRaw, cPassportRaw] = usePersistedState(
    `${dk}:passportRaw`,
    initial?.passportRaw ?? "",
  );
  const [source, setSource, cSource] = usePersistedState<ClientSource | null>(
    `${dk}:source`,
    initial?.source ?? null,
  );
  const clearDraft = () => {
    cName();
    cPhone();
    cPhone2();
    cBirth();
    cForeigner();
    cPassSer();
    cPassNum();
    cPassportRaw();
    cSource();
  };
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const isForeigner = foreigner === "foreign";

  const errors = useMemo(
    () => ({
      name: validateName(name),
      phone: validatePhone(phone),
      birth: validateBirth(birth),
      passSer: isForeigner ? null : validateSeries(passSer),
      passNum: isForeigner ? null : validateNumber(passNum),
      passportRaw: isForeigner && passportRaw.trim().length === 0 ? "Опишите документ" : null,
      source: !source ? "Выберите источник" : null,
    }),
    [name, phone, birth, isForeigner, passSer, passNum, passportRaw, source],
  );

  const canSave = Object.values(errors).every((e) => e === null);
  const err = (k: keyof typeof errors) => (touched ? errors[k] : null);

  // F7 (паритет): закрытие при заполненных полях — с подтверждением, чтобы
  // случайным тапом по «назад» не потерять введённое. Сравниваем с initial.
  const dirty =
    name !== (initial?.name ?? "") ||
    phone !== (initial?.phone ?? "") ||
    phone2 !== (initial?.phone2 ?? "") ||
    birth !== (initial?.birth ?? "") ||
    passSer !== (initial?.passSer ?? "") ||
    passNum !== (initial?.passNum ?? "") ||
    passportRaw !== (initial?.passportRaw ?? "") ||
    source !== (initial?.source ?? null);

  const handleClose = () => {
    if (!dirty) {
      clearDraft();
      onClose();
      return;
    }
    void confirmDialog({
      title: "Закрыть без сохранения?",
      message: "В форме есть несохранённые данные — они будут потеряны.",
      confirmText: "Закрыть",
      cancelText: "Остаться",
      danger: true,
    }).then((ok) => {
      if (ok) {
        clearDraft();
        onClose();
      }
    });
  };

  const handleSave = async () => {
    setTouched(true);
    if (!canSave || !source) return;
    setSaving(true);
    try {
      const passportFields = isForeigner
        ? { passportRaw: passportRaw.trim() || null }
        : {
            passportSeries: passSer.trim() || null,
            passportNumber: passNum.trim() || null,
          };

      // Режим «оформить из заявки» — convert (создаёт клиента и закрывает
      // заявку на бэкенде, переносит её файлы в документы клиента).
      if (isConvert) {
        const input: ConvertApplicationInput = {
          name: name.trim(),
          phone,
          extraPhone: phone2.trim() || null,
          source,
          isForeigner,
          birthDate: birthToIso(birth),
          ...passportFields,
        };
        const created = await convertMut.mutateAsync({
          id: applicationId!,
          input,
        });
        toast.success("Клиент оформлен", name.trim());
        // Чейним к оформлению аренды (как на десктопе). Раньше в convert-ветке
        // onCreated не вызывался — мобильный флоу обрывался на «закрыть».
        clearDraft();
        onCreated?.({ ...(created as unknown as Client) });
        onClose();
        return;
      }

      const created = await clientStore.addClientAsync({
        name: name.trim(),
        phone,
        extraPhone: phone2.trim() || null,
        // поле rating устарело (убирается из проекта) — 0 как заглушка
        // до чистки типов, в UI рейтинг нигде не показывается.
        rating: 0,
        rents: 0,
        debt: 0,
        source,
        added: todayShort(),
        isForeigner,
        birthDate: birthToIso(birth),
        ...passportFields,
      });
      if (phone2.trim()) clientStore.setExtraPhone(created.id, phone2.trim());
      toast.success("Клиент создан", name.trim());
      clearDraft();
      onCreated?.(created);
      onClose();
    } catch (e) {
      toast.error("Не удалось создать клиента", (e as Error).message ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileFormScreen
      title={isConvert ? "Оформить клиента" : "Новый клиент"}
      onClose={handleClose}
      onSubmit={handleSave}
      submitLabel={isConvert ? "Оформить из заявки" : "Создать клиента"}
      canSubmit={canSave}
      submitting={saving}
    >
      <Field label="ФИО" required error={err("name")}>
        <TextInput value={name} onChange={setName} placeholder="Иванов Иван Иванович" invalid={!!err("name")} />
      </Field>

      <Field label="Телефон" required error={err("phone")}>
        <TextInput value={phone} onChange={setPhone} placeholder="+7 (___) ___-__-__" inputMode="tel" invalid={!!err("phone")} />
      </Field>

      <Field label="Доп. телефон">
        <TextInput value={phone2} onChange={setPhone2} placeholder="необязательно" inputMode="tel" />
      </Field>

      <Field label="Дата рождения" required error={err("birth")}>
        <TextInput value={birth} onChange={setBirth} placeholder="ДД.ММ.ГГГГ" inputMode="numeric" invalid={!!err("birth")} maxLength={10} />
      </Field>

      <Field label="Гражданство">
        <SegmentToggle
          options={[
            { id: "rf", label: "РФ" },
            { id: "foreign", label: "Иностранец" },
          ]}
          value={foreigner}
          onChange={setForeigner}
        />
      </Field>

      {isForeigner ? (
        <Field label="Документ" required error={err("passportRaw")}>
          <TextInput value={passportRaw} onChange={setPassportRaw} placeholder="Тип, серия/номер документа" invalid={!!err("passportRaw")} />
        </Field>
      ) : (
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Серия" required error={err("passSer")}>
              <TextInput value={passSer} onChange={setPassSer} placeholder="0000" inputMode="numeric" invalid={!!err("passSer")} maxLength={4} />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Номер" required error={err("passNum")}>
              <TextInput value={passNum} onChange={setPassNum} placeholder="000000" inputMode="numeric" invalid={!!err("passNum")} maxLength={6} />
            </Field>
          </div>
        </div>
      )}

      <Field label="Источник" required error={err("source")}>
        <ChipSelect options={SOURCE_OPTIONS} value={source} onChange={setSource} />
      </Field>

      <p className="mt-2 text-center text-[12px] text-muted-2">
        Фото, водительское удостоверение и чёрный список — на компьютере
      </p>
    </MobileFormScreen>
  );
}
