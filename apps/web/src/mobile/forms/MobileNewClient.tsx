import { useMemo, useState } from "react";
import { clientStore } from "@/pages/clients/clientStore";
import type { Client, ClientSource } from "@/lib/mock/clients";
import {
  useConvertApplication,
  type ConvertApplicationInput,
} from "@/lib/api/clientApplications";
import { toast } from "@/lib/toast";
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

  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [phone2, setPhone2] = useState(initial?.phone2 ?? "");
  const [birth, setBirth] = useState(initial?.birth ?? "");
  const [foreigner, setForeigner] = useState<"rf" | "foreign">(
    initial?.isForeigner ? "foreign" : "rf",
  );
  const [passSer, setPassSer] = useState(initial?.passSer ?? "");
  const [passNum, setPassNum] = useState(initial?.passNum ?? "");
  const [passportRaw, setPassportRaw] = useState(initial?.passportRaw ?? "");
  const [source, setSource] = useState<ClientSource | null>(initial?.source ?? null);
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
        await convertMut.mutateAsync({ id: applicationId!, input });
        toast.success("Клиент оформлен", name.trim());
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
      onClose={onClose}
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
