import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  getClientDetails,
  SOURCE_LABEL,
  type Client,
  type ClientSource,
} from "@/lib/mock/clients";
import { useApiClients, clientsKeys } from "@/lib/api/clients";
import { applicationsKeys } from "@/lib/api/clientApplications";
import { api } from "@/lib/api";
import {
  DocUpload,
  DocUploadMulti,
  type UploadedFile,
} from "./DocUpload";
import { clientStore } from "./clientStore";
import { toast } from "@/lib/toast";
import type { ApplicationFormInit } from "./applicationConvert";

const SOURCE_OPTIONS: { id: ClientSource; label: string }[] = [
  { id: "avito", label: SOURCE_LABEL.avito },
  { id: "repeat", label: SOURCE_LABEL.repeat },
  { id: "ref", label: SOURCE_LABEL.ref },
  { id: "maps", label: SOURCE_LABEL.maps },
  { id: "other", label: SOURCE_LABEL.other },
];

/**
 * Спец-значение источника для выбора «свой вариант» — UI откроет
 * текстовое поле для произвольного источника. В DB сохраним как
 * source='other' + sourceCustom='<текст>'.
 */
type SourceChoice = ClientSource | "" | "custom";

type Form = {
  name: string;
  phone: string;
  phone2: string;
  birth: string;
  source: SourceChoice;
  sourceCustom: string;
  /** Гражданство: РФ → строгая форма паспорта; иностранец → свободная. */
  isForeigner: boolean;
  /** Произвольное описание паспорта для иностранца. */
  passportRaw: string;

  passSer: string;
  passNum: string;
  passIssuer: string;
  passDate: string;
  passCode: string;

  regAddr: string;
  sameAddr: boolean;
  liveAddr: string;

  photoFile: UploadedFile | null;
  passportMainFile: UploadedFile | null;
  passportRegFile: UploadedFile | null;
  licenseFile: UploadedFile | null;
  contractFile: UploadedFile | null;
  otherDocs: UploadedFile[];

  blacklisted: boolean;
  blReason: string;
};

const EMPTY: Form = {
  name: "",
  phone: "",
  phone2: "",
  birth: "",
  source: "",
  sourceCustom: "",
  isForeigner: false,
  passportRaw: "",
  passSer: "",
  passNum: "",
  passIssuer: "",
  passDate: "",
  passCode: "",
  regAddr: "",
  sameAddr: true,
  liveAddr: "",
  photoFile: null,
  passportMainFile: null,
  passportRegFile: null,
  licenseFile: null,
  contractFile: null,
  otherDocs: [],
  blacklisted: false,
  blReason: "",
};

function validateName(v: string): string | null {
  const parts = v.trim().split(/\s+/);
  if (parts.length < 2 || !parts[0] || !parts[1])
    return "Нужно минимум Имя и Фамилия";
  return null;
}

function validatePhone(v: string): string | null {
  const digits = v.replace(/\D/g, "");
  if (digits.length !== 11) return "Введите 11 цифр телефона";
  return null;
}

function validateBirth(v: string): string | null {
  const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "Формат ДД.ММ.ГГГГ";
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  const today = new Date();
  const age = today.getFullYear() - date.getFullYear();
  if (age < 18) return "Клиент должен быть 18+";
  if (age > 100) return "Проверьте дату рождения";
  return null;
}

function validateSeries(v: string): string | null {
  if (!/^\d{4}$/.test(v)) return "4 цифры";
  return null;
}

function validateNumber(v: string): string | null {
  if (!/^\d{6}$/.test(v)) return "6 цифр";
  return null;
}

function findDuplicateIn(phone: string, pool: { id: number; name: string; phone: string }[]): { id: number; name: string; phone: string } | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return pool.find((c) => c.phone.replace(/\D/g, "") === digits) ?? null;
}

/**
 * ДД.ММ.ГГГГ → ISO YYYY-MM-DD для столбцов date в Postgres.
 * Если строка пустая или невалидная — возвращаем null,
 * Drizzle/Zod примет это как «поле не заполнено».
 */
function dateRuToIso(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo}-${d}`;
}

/** Trim + null если пусто — чтобы не отправлять "" в API. */
function nullableTrim(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

/**
 * Автоформат даты ДД.ММ.ГГГГ — точки расставляются автоматически
 * по мере ввода. Принимает любую строку, оставляет только цифры
 * и расставляет точки после 2 и 4 цифр.
 */
function formatDateRu(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

/**
 * Автоформат кода подразделения паспорта XXX-XXX —
 * тире после 3 цифр.
 */
function formatDivisionCode(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 6);
  if (d.length <= 3) return d;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
}

function formatPhone(v: string): string {
  const digits = v.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  const d = digits.startsWith("8") || digits.startsWith("7") ? digits : "7" + digits;
  const p = d.slice(0, 11);
  const parts = [
    "+7",
    p.slice(1, 4) && ` (${p.slice(1, 4)}`,
    p.slice(4, 7) && `) ${p.slice(4, 7)}`,
    p.slice(7, 9) && `-${p.slice(7, 9)}`,
    p.slice(9, 11) && `-${p.slice(9, 11)}`,
  ].filter(Boolean);
  return parts.join("");
}

function docToUploaded(
  doc: { name: string; date: string } | null,
): UploadedFile | null {
  if (!doc) return null;
  return { name: doc.name, label: `загружено ${doc.date}`, existing: true };
}

function initialForm(editing: Client | null): Form {
  if (!editing) return EMPTY;
  // Лог удобен на проде в DevTools, чтобы увидеть какие поля реально
  // прилетели из API в форму редактирования. Если editing.passport*
  // пустые — значит adaptClient/useApiClients не пробросил их (или
  // user смотрит старый bundle до hard-reload).
  // eslint-disable-next-line no-console
  console.info("[initialForm] editing:", editing);
  const d = getClientDetails(editing);
  // eslint-disable-next-line no-console
  console.info("[initialForm] details:", d);
  const sameAddr =
    d.liveAddr === "совпадает с регистрацией" || d.liveAddr === d.regAddr;
  return {
    name: editing.name,
    phone: editing.phone,
    phone2: editing.extraPhone ?? clientStore.getExtraPhone(editing.id) ?? "",
    birth: d.birth === "—" ? "" : d.birth,
    source: editing.source,
    sourceCustom: "",
    // Без этих двух строк форма редактирования теряла признак иностранца:
    // открыли карточку, переключили в «Иностранный гражданин», заполнили
    // паспорт текстом, сохранили → API записал is_foreigner=true. На
    // повторном открытии initialForm возвращал isForeigner:false /
    // passportRaw:"" — UI показывал «Гражданин РФ» с пустыми полями,
    // данные «исчезали».
    isForeigner: !!editing.isForeigner,
    passportRaw: editing.passportRaw ?? "",
    passSer: d.passport.ser === "—" ? "" : d.passport.ser,
    passNum:
      d.passport.num === "—" ? "" : d.passport.num.replace(/\s/g, ""),
    passIssuer: d.passport.issuer === "—" ? "" : d.passport.issuer,
    passDate: d.passport.date === "—" ? "" : d.passport.date,
    passCode: d.passport.code === "—" ? "" : d.passport.code,
    regAddr: d.regAddr === "—" ? "" : d.regAddr,
    sameAddr,
    liveAddr: sameAddr ? "" : d.liveAddr,
    photoFile: clientStore.getPhoto(editing.id),
    passportMainFile: docToUploaded(d.docs.passport_main),
    passportRegFile: docToUploaded(d.docs.passport_reg),
    licenseFile: docToUploaded(d.docs.license),
    contractFile: null,
    otherDocs: [],
    blacklisted: !!editing.blacklisted,
    blReason: d.blReason || "",
  };
}

export function AddClientModal({
  editing,
  onClose,
  onCreated,
  applicationId,
  initialData,
}: {
  editing?: Client | null;
  onClose: () => void;
  onCreated?: (client: Client) => void;
  /** Если задан — после save вызвать convert API и удалить заявку. */
  applicationId?: number;
  /** Предзаполненные поля из публичной заявки (мерджатся в EMPTY). */
  initialData?: ApplicationFormInit;
}) {
  const isEdit = !!editing;
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(() => {
    const base = initialForm(editing ?? null);
    if (!editing && initialData) {
      return {
        ...base,
        name: initialData.name || base.name,
        phone: initialData.phone || base.phone,
        phone2: initialData.phone2 || base.phone2,
        birth: initialData.birth || base.birth,
        isForeigner: initialData.isForeigner,
        passportRaw: initialData.passportRaw || base.passportRaw,
        passSer: initialData.passSer || base.passSer,
        passNum: initialData.passNum || base.passNum,
        passIssuer: initialData.passIssuer || base.passIssuer,
        passDate: initialData.passDate || base.passDate,
        passCode: initialData.passCode || base.passCode,
        regAddr: initialData.regAddr || base.regAddr,
        sameAddr: initialData.sameAddr,
        liveAddr: initialData.liveAddr || base.liveAddr,
      };
    }
    return base;
  });
  const [closing, setClosing] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>(() =>
    isEdit
      ? ({
          name: true,
          phone: true,
          birth: true,
          passSer: true,
          passNum: true,
        } as Record<string, boolean>)
      : ({} as Record<string, boolean>),
  );

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errors = useMemo(
    () => ({
      name: validateName(f.name),
      phone: validatePhone(f.phone),
      birth: validateBirth(f.birth),
      // Для иностранца паспорт в свободной форме — структурные поля не валидируем.
      passSer: f.isForeigner ? null : validateSeries(f.passSer),
      passNum: f.isForeigner ? null : validateNumber(f.passNum),
      passportRaw:
        f.isForeigner && f.passportRaw.trim().length === 0
          ? "Опишите документ"
          : null,
      source:
        !f.source
          ? "Выберите источник"
          : null,
      sourceCustom:
        f.source === "custom" && f.sourceCustom.trim().length === 0
          ? "Укажите свой вариант"
          : null,
      blReason:
        f.blacklisted && f.blReason.trim().length === 0
          ? "Укажите причину"
          : null,
    }),
    [f],
  );

  const { data: apiClients } = useApiClients();
  const duplicate = useMemo(() => {
    const pool = (apiClients ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
    }));
    const d = findDuplicateIn(f.phone, pool);
    if (d && editing && d.id === editing.id) return null;
    return d;
  }, [f.phone, editing, apiClients]);

  const required = [
    errors.name,
    errors.phone,
    errors.birth,
    errors.passSer,
    errors.passNum,
    errors.passportRaw,
    errors.source,
    errors.sourceCustom,
  ];
  const ok = required.filter((e) => e === null).length;
  const total = required.length;
  const progress = Math.round((ok / total) * 100);
  const canSave = required.every((e) => e === null) && !errors.blReason;

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  const showErr = (key: string) =>
    (touched[key] && errors[key as keyof typeof errors]) || null;

  const markTouched = (key: string) =>
    setTouched((prev) => ({ ...prev, [key]: true }));

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/50 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
    >
      <div
        className={cn(
          "w-full max-w-[720px] overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative border-b border-border bg-surface-soft px-6 py-4">
          <button
            type="button"
            onClick={requestClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-border hover:text-ink"
            title="Закрыть (Esc)"
          >
            <X size={16} />
          </button>
          <h2 className="font-display text-[22px] font-extrabold text-ink">
            {isEdit ? `Редактировать: ${editing!.name}` : "Новый клиент"}
          </h2>
          <p className="mt-0.5 text-[12px] text-muted">
            {isEdit ? (
              <>id #{String(editing!.id).padStart(4, "0")}</>
            ) : (
              <>
                Заполните данные —{" "}
                <span className="text-red-ink">*</span> обязательные поля
              </>
            )}
          </p>
        </div>

        {/* Body */}
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto px-6 py-5">
          {/* Photo (optional) */}
          <div className="mb-6 flex items-center gap-4">
            <PhotoSlot
              file={f.photoFile}
              onChange={(v) => set("photoFile", v)}
              fallback={f.name || (editing?.name ?? "")}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink">
                Фото клиента
              </div>
              <div className="mt-0.5 text-[12px] text-muted">
                Необязательно — но помогает узнать клиента в лицо. Для{" "}
                проблемных клиентов особенно полезно.
              </div>
            </div>
          </div>

          {/* Section 1 — Основные */}
          <Section num={1} title="Основные" badge="обязательно">
            <Field
              label="ФИО"
              required
              error={showErr("name")}
              htmlFor="f-name"
            >
              <input
                id="f-name"
                type="text"
                value={f.name}
                placeholder="Например: Иванов Иван Иванович"
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => markTouched("name")}
                className={inputClass(showErr("name"))}
              />
            </Field>

            <Field
              label="Телефон"
              required
              error={showErr("phone")}
              hint="Формат +7 (XXX) XXX-XX-XX"
              htmlFor="f-phone"
            >
              <input
                id="f-phone"
                type="tel"
                value={f.phone}
                placeholder="+7 (___) ___-__-__"
                onChange={(e) => set("phone", formatPhone(e.target.value))}
                onBlur={() => markTouched("phone")}
                className={inputClass(showErr("phone"))}
              />
              {/* Подсказку об уже существующем клиенте не показываем
                  во время заполнения — это новый клиент по определению.
                  Дубль ловим на сохранении и блокируем со стилизованной
                  ошибкой, чтобы не было случайных дублей. */}
            </Field>

            <Field
              label="Доп. контакт"
              hint="Родственник, жена, водитель — тот кто ответит если основной недоступен"
              htmlFor="f-phone2"
            >
              <input
                id="f-phone2"
                type="tel"
                value={f.phone2}
                placeholder="+7 (___) ___-__-__"
                onChange={(e) => set("phone2", formatPhone(e.target.value))}
                className={inputClass(null)}
              />
            </Field>

            <Row>
              <Field
                label="Дата рождения"
                required
                error={showErr("birth")}
                htmlFor="f-birth"
              >
                <input
                  id="f-birth"
                  type="text"
                  inputMode="numeric"
                  value={f.birth}
                  placeholder="ДД.ММ.ГГГГ"
                  maxLength={10}
                  onChange={(e) => set("birth", formatDateRu(e.target.value))}
                  onBlur={() => markTouched("birth")}
                  className={inputClass(showErr("birth"))}
                />
              </Field>
              <Field
                label="Источник"
                required
                error={showErr("source")}
                htmlFor="f-source"
              >
                <select
                  id="f-source"
                  value={f.source}
                  onChange={(e) =>
                    set("source", e.target.value as SourceChoice)
                  }
                  className={inputClass(showErr("source"))}
                >
                  <option value="" disabled>
                    Выберите источник…
                  </option>
                  {SOURCE_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                  <option value="custom">Свой вариант…</option>
                </select>
                {f.source === "custom" && (
                  <input
                    type="text"
                    value={f.sourceCustom}
                    onChange={(e) => set("sourceCustom", e.target.value)}
                    placeholder="Откуда узнал о нас"
                    className={cn(
                      inputClass(showErr("sourceCustom")),
                      "mt-1.5",
                    )}
                  />
                )}
              </Field>
            </Row>
          </Section>

          {/* Section 2 — Паспорт */}
          <Section num={2} title="Паспортные данные" badge="для договора">
            <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-border bg-surface-soft p-2">
              <button
                type="button"
                onClick={() => set("isForeigner", false)}
                className={cn(
                  "flex-1 rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  !f.isForeigner
                    ? "bg-blue-600 text-white"
                    : "text-muted hover:text-ink",
                )}
              >
                Гражданин РФ
              </button>
              <button
                type="button"
                onClick={() => set("isForeigner", true)}
                className={cn(
                  "flex-1 rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  f.isForeigner
                    ? "bg-blue-600 text-white"
                    : "text-muted hover:text-ink",
                )}
              >
                Иностранный гражданин
              </button>
            </div>

            {f.isForeigner ? (
              <Field
                label="Документ удостоверяющий личность"
                hint={
                  <span className="text-[10px] text-muted-2">
                    в свободной форме — серия/номер паспорта, гражданство, кем
                    выдан, дата
                  </span>
                }
                htmlFor="f-praw"
              >
                <textarea
                  id="f-praw"
                  rows={4}
                  value={f.passportRaw}
                  onChange={(e) => set("passportRaw", e.target.value)}
                  placeholder="Например: Паспорт гражданина Узбекистана AB1234567, выдан МВД Респ. Узбекистан 12.03.2019, действителен до 12.03.2029"
                  className="w-full resize-y rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-blue-600"
                />
              </Field>
            ) : (
            <>
            <Row>
              <Field
                label="Серия"
                required
                error={showErr("passSer")}
                htmlFor="f-pser"
              >
                <input
                  id="f-pser"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={f.passSer}
                  placeholder="0000"
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                    set("passSer", v);
                    // v0.3.7: автопереход на следующее поле, когда серия заполнена
                    if (v.length === 4) {
                      document.getElementById("f-pnum")?.focus();
                    }
                  }}
                  onBlur={() => markTouched("passSer")}
                  className={inputClass(showErr("passSer"))}
                />
              </Field>
              <Field
                label="Номер"
                required
                error={showErr("passNum")}
                htmlFor="f-pnum"
              >
                <input
                  id="f-pnum"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={f.passNum}
                  placeholder="000000"
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                    set("passNum", v);
                    // v0.3.7: автопереход на «Кем выдан», когда номер заполнен
                    if (v.length === 6) {
                      document.getElementById("f-pissuer")?.focus();
                    }
                  }}
                  onBlur={() => markTouched("passNum")}
                  className={inputClass(showErr("passNum"))}
                />
              </Field>
            </Row>
            <Field label="Кем выдан" htmlFor="f-pissuer">
              <input
                id="f-pissuer"
                type="text"
                value={f.passIssuer}
                placeholder="ОВД района…"
                onChange={(e) => set("passIssuer", e.target.value)}
                className={inputClass(null)}
              />
            </Field>
            <Row>
              <Field label="Дата выдачи" htmlFor="f-pdate">
                <input
                  id="f-pdate"
                  type="text"
                  inputMode="numeric"
                  value={f.passDate}
                  placeholder="ДД.ММ.ГГГГ"
                  maxLength={10}
                  onChange={(e) => {
                    const v = formatDateRu(e.target.value);
                    set("passDate", v);
                    // v0.4.46: автопереход на «Код подразделения», когда
                    // дата заполнена полностью (DD.MM.YYYY = 10 символов).
                    if (v.length === 10) {
                      document.getElementById("f-pcode")?.focus();
                    }
                  }}
                  className={inputClass(null)}
                />
              </Field>
              <Field label="Код подразделения" htmlFor="f-pcode">
                <input
                  id="f-pcode"
                  type="text"
                  inputMode="numeric"
                  value={f.passCode}
                  placeholder="000-000"
                  maxLength={7}
                  onChange={(e) => {
                    const v = formatDivisionCode(e.target.value);
                    set("passCode", v);
                    // v0.4.46: автопереход на «Адрес регистрации» когда
                    // код подразделения заполнен (000-000 = 7 символов).
                    if (v.length === 7) {
                      document.getElementById("f-regaddr")?.focus();
                    }
                  }}
                  className={inputClass(null)}
                />
              </Field>
            </Row>
            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <DocUpload
                label="Скан паспорта (основной разворот)"
                hint="JPG или PDF"
                file={f.passportMainFile}
                onChange={(v) => set("passportMainFile", v)}
              />
              <DocUpload
                label="Скан паспорта (прописка)"
                hint="JPG или PDF"
                file={f.passportRegFile}
                onChange={(v) => set("passportRegFile", v)}
              />
            </div>
            </>
            )}
          </Section>

          {/* Section 3 — Адрес */}
          <Section num={3} title="Адрес" badge="регистрация и проживание">
            <Field
              label="Адрес регистрации (по паспорту)"
              htmlFor="f-regaddr"
              hint="Как указано в паспорте на странице «прописка»"
            >
              <textarea
                id="f-regaddr"
                value={f.regAddr}
                placeholder="Индекс, регион, город, улица, дом, кв."
                onChange={(e) => set("regAddr", e.target.value)}
                className={cn(inputClass(null), "min-h-[56px] resize-y")}
              />
            </Field>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={f.sameAddr}
                onChange={(e) => set("sameAddr", e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              Фактический адрес совпадает с регистрацией
            </label>
            {!f.sameAddr && (
              <Field label="Фактический адрес" htmlFor="f-liveaddr">
                <textarea
                  id="f-liveaddr"
                  value={f.liveAddr}
                  placeholder="Индекс, регион, город, улица, дом, кв."
                  onChange={(e) => set("liveAddr", e.target.value)}
                  className={cn(inputClass(null), "min-h-[56px] resize-y")}
                />
              </Field>
            )}
          </Section>

          {/* Section 4 — Водительское */}
          <Section num={4} title="Водительское" badge="если есть">
            <DocUpload
              label="Скан водительского"
              hint="обе стороны одним файлом или PDF. Если ВУ нет — оставьте пустым (клиент сможет взять только скутеры до 50 куб.см)"
              file={f.licenseFile}
              onChange={(v) => set("licenseFile", v)}
            />
          </Section>

          {/* Section 5 — Доп. документы (паспорт, ВУ — выше; здесь
              остальное: справки, расписки и т.п.). Договоры в карточку
              клиента НЕ загружаем — они хранятся при сделке (аренде/
              рассрочке/выкупе), там и видны. Раньше тут был «Скан
              подписанного договора» — убран, чтобы не возникало
              двух разных мест для одного и того же файла. */}
          <Section num={5} title="Прочие документы" badge="опционально">
            <DocUploadMulti
              label="Справки, расписки и прочее"
              hint="акты, расписки, чеки — можно несколько файлов"
              files={f.otherDocs}
              onChange={(v) => set("otherDocs", v)}
            />
          </Section>

          {/* Section 6 — Статус */}
          <Section num={6} title="Статус">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border border-border p-3">
              <div>
                <div className="text-[13px] font-semibold text-ink">
                  Чёрный список
                </div>
                <div className="text-[11px] text-muted">
                  Клиенту будет запрещена аренда
                </div>
              </div>
              <input
                type="checkbox"
                checked={f.blacklisted}
                onChange={(e) => set("blacklisted", e.target.checked)}
                className="h-4 w-4 accent-red"
              />
            </label>
            {f.blacklisted && (
              <Field
                label="Причина"
                required
                error={showErr("blReason")}
                htmlFor="f-blreason"
              >
                <textarea
                  id="f-blreason"
                  value={f.blReason}
                  placeholder="Например: повредил скутер #12, не оплатил ремонт"
                  onChange={(e) => set("blReason", e.target.value)}
                  onBlur={() => markTouched("blReason")}
                  className={cn(
                    inputClass(showErr("blReason")),
                    "min-h-[56px] resize-y",
                  )}
                />
              </Field>
            )}
          </Section>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-[11px] font-semibold text-muted-2">
              {ok} / {total} обязательных
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-soft">
              <div
                className={cn(
                  "h-full transition-all",
                  progress === 100 ? "bg-green-ink" : "bg-blue-600",
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold tabular-nums text-muted-2">
              {progress}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-2">
              Esc — закрыть · Ctrl+Enter — сохранить
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-full border border-border px-4 py-1.5 text-[12px] font-semibold text-muted hover:bg-surface-soft"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={async () => {
                  if (!editing && duplicate) {
                    toast.error(
                      "Такой клиент уже есть",
                      `«${duplicate.name}» с этим номером уже в базе. Откройте его карточку, не создавайте дубль.`,
                    );
                    return;
                  }
                  // Если выбран «свой вариант» — отправляем
                  // source='other' + sourceCustom='<текст>'.
                  const finalSource: ClientSource =
                    f.source === "custom" || f.source === ""
                      ? "other"
                      : (f.source as ClientSource);
                  const finalSourceCustom =
                    f.source === "custom" ? f.sourceCustom.trim() : null;
                  // Паспорт + адрес + дата рождения — общие для CREATE и PATCH.
                  // Для иностранца паспортные поля не строгие (форма скрывает
                  // их и заполняется passportRaw), поэтому отправляем null.
                  const passportFields = f.isForeigner
                    ? {
                        birthDate: dateRuToIso(f.birth),
                        passportSeries: null,
                        passportNumber: null,
                        passportIssuedOn: null,
                        passportIssuer: null,
                        passportDivisionCode: null,
                        passportRegistration: nullableTrim(f.regAddr),
                      }
                    : {
                        birthDate: dateRuToIso(f.birth),
                        passportSeries: nullableTrim(f.passSer),
                        passportNumber: nullableTrim(f.passNum),
                        passportIssuedOn: dateRuToIso(f.passDate),
                        passportIssuer: nullableTrim(f.passIssuer),
                        passportDivisionCode: nullableTrim(f.passCode),
                        passportRegistration: nullableTrim(f.regAddr),
                      };

                  if (editing) {
                    try {
                      await clientStore.patchClientAsync(editing.id, {
                        name: f.name.trim(),
                        phone: f.phone,
                        extraPhone: nullableTrim(f.phone2),
                        source: finalSource,
                        sourceCustom: finalSourceCustom,
                        isForeigner: f.isForeigner,
                        passportRaw: f.isForeigner
                          ? nullableTrim(f.passportRaw)
                          : null,
                        blacklisted: f.blacklisted,
                        blacklistReason: f.blacklisted
                          ? nullableTrim(f.blReason)
                          : null,
                        ...passportFields,
                      });
                      clientStore.setPhoto(editing.id, f.photoFile);
                      clientStore.setExtraPhone(
                        editing.id,
                        f.phone2 || null,
                      );
                      // Список заполненных полей — короткий чек, что
                      // реально ушло в API. Без этого пользователь
                      // не уверен, прошло ли сохранение.
                      const filled: string[] = [];
                      if (passportFields.passportSeries) filled.push("серия");
                      if (passportFields.passportNumber) filled.push("номер");
                      if (passportFields.passportIssuedOn)
                        filled.push("дата выдачи");
                      if (passportFields.passportIssuer)
                        filled.push("кем выдан");
                      if (passportFields.passportDivisionCode)
                        filled.push("код подр.");
                      if (passportFields.passportRegistration)
                        filled.push("адрес рег.");
                      if (passportFields.birthDate)
                        filled.push("дата рожд.");
                      toast.success(
                        "Клиент сохранён",
                        filled.length > 0
                          ? `Обновлено: ${filled.join(", ")}.`
                          : "Изменения переданы на сервер.",
                      );
                      requestClose();
                    } catch (e) {
                      toast.error(
                        "Не удалось сохранить клиента",
                        (e as Error).message ?? "",
                      );
                    }
                    return;
                  }
                  // Если открыты из заявки — идём через convert API:
                  // он создаёт клиента + переносит файлы из заявки в client_documents
                  // + удаляет саму заявку. Один атомарный запрос.
                  if (applicationId) {
                    try {
                      const created = await api.post<{ id: number; name: string; phone: string }>(
                        `/api/client-applications/${applicationId}/convert`,
                        {
                          name: f.name.trim(),
                          phone: f.phone,
                          extraPhone: nullableTrim(f.phone2),
                          source: finalSource,
                          sourceCustom: finalSourceCustom,
                          isForeigner: f.isForeigner,
                          passportRaw: f.isForeigner
                            ? nullableTrim(f.passportRaw)
                            : null,
                          blacklisted: f.blacklisted,
                          blacklistReason: f.blacklisted
                            ? nullableTrim(f.blReason)
                            : null,
                          ...passportFields,
                        },
                      );
                      qc.invalidateQueries({ queryKey: clientsKeys.all });
                      qc.invalidateQueries({ queryKey: applicationsKeys.all });
                      onCreated?.({
                        ...(created as unknown as Client),
                      });
                      requestClose();
                    } catch (e) {
                      toast.error(
                        "Не удалось оформить клиента из заявки",
                        (e as Error).message ?? "",
                      );
                    }
                    return;
                  }
                  try {
                    // Async: ждём реальный id из API. Иначе onCreated
                    // получит stub-id, и если консьюмер сразу шлёт его
                    // в API (например, привязывает к новой аренде) —
                    // получим 400 «client not found».
                    const created = await clientStore.addClientAsync({
                      name: f.name.trim(),
                      phone: f.phone,
                      extraPhone: nullableTrim(f.phone2),
                      rating: 68,
                      rents: 0,
                      debt: 0,
                      source: finalSource,
                      sourceCustom: finalSourceCustom,
                      isForeigner: f.isForeigner,
                      passportRaw: f.isForeigner
                        ? f.passportRaw.trim() || null
                        : null,
                      added: "13.10.26",
                      blacklisted: f.blacklisted || undefined,
                      blacklistReason: f.blacklisted
                        ? nullableTrim(f.blReason)
                        : null,
                      comment: f.blReason || undefined,
                      ...passportFields,
                    });
                    if (f.photoFile) clientStore.setPhoto(created.id, f.photoFile);
                    if (f.phone2) clientStore.setExtraPhone(created.id, f.phone2);
                    onCreated?.(created);
                    requestClose();
                  } catch (e) {
                    toast.error(
                      "Не удалось создать клиента",
                      (e as Error).message ?? "",
                    );
                  }
                }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors",
                  canSave
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "cursor-not-allowed bg-surface-soft text-muted-2",
                )}
              >
                {isEdit
                  ? "Сохранить изменения"
                  : "Сохранить и открыть карточку →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =================== Helpers =================== */

function Section({
  num,
  title,
  badge,
  children,
}: {
  num: number;
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 last:mb-0">
      <header className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">
          {num}
        </span>
        <h3 className="font-display text-[18px] font-extrabold text-ink">
          {title}
        </h3>
        {badge && (
          <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {badge}
          </span>
        )}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  required,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-[12px] font-semibold text-ink"
      >
        {label}
        {required && <span className="ml-0.5 text-red-ink">*</span>}
      </label>
      {children}
      {error ? (
        <div className="mt-1 text-[11px] text-red-ink">{error}</div>
      ) : hint ? (
        <div className="mt-1 text-[11px] text-muted-2">{hint}</div>
      ) : null}
    </div>
  );
}

function inputClass(error: string | null) {
  return cn(
    "h-9 w-full rounded-[10px] border bg-surface px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-muted-2",
    error
      ? "border-red focus:border-red"
      : "border-border focus:border-blue-600",
  );
}

function PhotoSlot({
  file,
  fallback,
  onChange,
}: {
  file: UploadedFile | null;
  fallback: string;
  onChange: (next: UploadedFile | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) return;
    const uf: UploadedFile = {
      name: f.name,
      size: f.size,
      thumbUrl: URL.createObjectURL(f),
    };
    onChange(uf);
  };

  const initials = fallback
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase();

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-surface-soft text-[20px] font-bold text-muted transition-colors hover:border-blue-600"
        title={file ? "Заменить фото" : "Загрузить фото"}
      >
        {file?.thumbUrl ? (
          <img
            src={file.thumbUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span>{initials || "?"}</span>
        )}
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-ink/60 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
          {file ? "заменить" : "загрузить"}
        </span>
      </button>
      {file && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red text-white shadow-card transition-colors hover:bg-red-ink"
          title="Убрать фото"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
