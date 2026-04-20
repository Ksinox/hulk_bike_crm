import { useEffect, useMemo, useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CLIENTS,
  SOURCE_LABEL,
  type Client,
  type ClientSource,
} from "@/lib/mock/clients";

const SOURCE_OPTIONS: { id: ClientSource; label: string }[] = [
  { id: "avito", label: SOURCE_LABEL.avito },
  { id: "repeat", label: SOURCE_LABEL.repeat },
  { id: "ref", label: SOURCE_LABEL.ref },
  { id: "maps", label: SOURCE_LABEL.maps },
  { id: "other", label: SOURCE_LABEL.other },
];

type Form = {
  name: string;
  phone: string;
  birth: string;
  source: ClientSource;

  passSer: string;
  passNum: string;
  passIssuer: string;
  passDate: string;
  passCode: string;

  regAddr: string;
  sameAddr: boolean;
  liveAddr: string;

  noLicense: boolean;
  licenseSer: string;
  licenseNum: string;

  blacklisted: boolean;
  blReason: string;
};

const EMPTY: Form = {
  name: "",
  phone: "",
  birth: "",
  source: "avito",
  passSer: "",
  passNum: "",
  passIssuer: "",
  passDate: "",
  passCode: "",
  regAddr: "",
  sameAddr: true,
  liveAddr: "",
  noLicense: false,
  licenseSer: "",
  licenseNum: "",
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

function findDuplicate(phone: string): Client | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return (
    CLIENTS.find((c) => c.phone.replace(/\D/g, "") === digits) ?? null
  );
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

export function AddClientModal({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const errors = useMemo(
    () => ({
      name: validateName(f.name),
      phone: validatePhone(f.phone),
      birth: validateBirth(f.birth),
      passSer: validateSeries(f.passSer),
      passNum: validateNumber(f.passNum),
      blReason:
        f.blacklisted && f.blReason.trim().length === 0
          ? "Укажите причину"
          : null,
    }),
    [f],
  );

  const duplicate = useMemo(() => findDuplicate(f.phone), [f.phone]);

  const required = [
    errors.name,
    errors.phone,
    errors.birth,
    errors.passSer,
    errors.passNum,
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
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/50 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[720px] overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative border-b border-border bg-surface-soft px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-border hover:text-ink"
            title="Закрыть (Esc)"
          >
            <X size={16} />
          </button>
          <h2 className="font-display text-[22px] font-extrabold text-ink">
            Новый клиент
          </h2>
          <p className="mt-0.5 text-[12px] text-muted">
            Заполните данные — <span className="text-red-ink">*</span>{" "}
            обязательные поля
          </p>
        </div>

        {/* Body */}
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto px-6 py-5">
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
              {duplicate && (
                <div className="mt-2 flex items-center gap-2 rounded-[10px] bg-orange-soft/70 px-3 py-2 text-[12px] text-orange-ink">
                  <AlertTriangle size={14} />
                  <span>
                    Клиент с таким телефоном уже есть:{" "}
                    <b>{duplicate.name}</b>
                  </span>
                </div>
              )}
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
                  value={f.birth}
                  placeholder="ДД.ММ.ГГГГ"
                  maxLength={10}
                  onChange={(e) => set("birth", e.target.value)}
                  onBlur={() => markTouched("birth")}
                  className={inputClass(showErr("birth"))}
                />
              </Field>
              <Field label="Источник" htmlFor="f-source">
                <select
                  id="f-source"
                  value={f.source}
                  onChange={(e) => set("source", e.target.value as ClientSource)}
                  className={inputClass(null)}
                >
                  {SOURCE_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            </Row>
          </Section>

          {/* Section 2 — Паспорт */}
          <Section num={2} title="Паспортные данные" badge="для договора">
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
                  onChange={(e) =>
                    set("passSer", e.target.value.replace(/\D/g, ""))
                  }
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
                  onChange={(e) =>
                    set("passNum", e.target.value.replace(/\D/g, ""))
                  }
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
                  value={f.passDate}
                  placeholder="ДД.ММ.ГГГГ"
                  maxLength={10}
                  onChange={(e) => set("passDate", e.target.value)}
                  className={inputClass(null)}
                />
              </Field>
              <Field label="Код подразделения" htmlFor="f-pcode">
                <input
                  id="f-pcode"
                  type="text"
                  value={f.passCode}
                  placeholder="000-000"
                  maxLength={7}
                  onChange={(e) => set("passCode", e.target.value)}
                  className={inputClass(null)}
                />
              </Field>
            </Row>
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
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={f.noLicense}
                onChange={(e) => set("noLicense", e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              Клиент без водительского — только для скутеров до 50 куб.см
            </label>
            {!f.noLicense && (
              <Row>
                <Field label="Серия ВУ" htmlFor="f-lser">
                  <input
                    id="f-lser"
                    type="text"
                    value={f.licenseSer}
                    placeholder="00 00"
                    onChange={(e) => set("licenseSer", e.target.value)}
                    className={inputClass(null)}
                  />
                </Field>
                <Field label="Номер ВУ" htmlFor="f-lnum">
                  <input
                    id="f-lnum"
                    type="text"
                    value={f.licenseNum}
                    placeholder="000000"
                    onChange={(e) => set("licenseNum", e.target.value)}
                    className={inputClass(null)}
                  />
                </Field>
              </Row>
            )}
          </Section>

          {/* Section 5 — Статус */}
          <Section num={5} title="Статус">
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
                onClick={onClose}
                className="rounded-full border border-border px-4 py-1.5 text-[12px] font-semibold text-muted hover:bg-surface-soft"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={onClose}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors",
                  canSave
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "cursor-not-allowed bg-surface-soft text-muted-2",
                )}
              >
                Сохранить и открыть карточку →
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
  hint?: string;
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
