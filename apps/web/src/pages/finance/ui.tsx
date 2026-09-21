import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Общие кирпичики блока «Финансы».
 *
 * Правило блока: всё правится на месте. Поэтому поля сделаны одинаковыми и
 * крупными (высота 44px — палец), а ввод суммы поднимает на телефоне и
 * планшете родную цифровую клавиатуру: в финансах числа длинные, своя
 * клавиатура тут только мешала бы.
 */

export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", wide && "flex-1")}>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-2">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputBase =
  "h-11 w-full rounded-xl border border-border bg-white px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-muted-2 focus:border-ink";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputBase, props.className)} />;
}

/** Сумма в рублях: только цифры, пробелы для читаемости, родная клавиатура. */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
  onEnter,
  onBlurCommit,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onEnter?: () => void;
  /** Ушли из поля — самое время сохранить. */
  onBlurCommit?: () => void;
}) {
  const [text, setText] = useState(value ? String(value) : "");
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setText(value ? String(value) : "");
  }, [value]);
  return (
    <input
      inputMode="numeric"
      autoFocus={autoFocus}
      value={text ? Number(text).toLocaleString("ru-RU") : ""}
      placeholder={placeholder ?? "0"}
      onChange={(e) => {
        touched.current = true;
        const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
        setText(digits);
        onChange(digits ? Number(digits) : 0);
      }}
      onBlur={() => {
        touched.current = false;
        onBlurCommit?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) onEnter();
      }}
      className={cn(inputBase, "text-right font-semibold tabular-nums", className)}
    />
  );
}

export function DateInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="date" {...props} className={cn(inputBase, props.className)} />;
}

/**
 * Выбор статьи — плитками, а не выпадающим списком.
 *
 * Нативный `<select>` в CRM не используем: он рисуется системой и выбивается
 * из оформления, а на телефоне открывает колесо во весь экран. Плитки видно
 * целиком, попадать по ним пальцем удобно, а рядом живёт кнопка «своя
 * статья» — новую статью заводят прямо здесь, не уходя из формы.
 */
export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  onAdd,
  addLabel = "Своя статья",
}: {
  options: { id: T; label: string; hint?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  /** Заведение нового варианта прямо в форме. */
  onAdd?: (name: string) => void | Promise<void>;
  addLabel?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const commit = async () => {
    const name = draft.trim();
    if (!name || !onAdd) return;
    await onAdd(name);
    setDraft("");
    setAdding(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          title={o.hint}
          className={cn(
            "inline-flex h-10 items-center rounded-xl px-3 text-[13px] font-semibold transition-colors",
            value === o.id
              ? "bg-ink text-white"
              : "border border-border bg-white text-ink-2 hover:border-ink hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
      {onAdd &&
        (adding ? (
          <span className="inline-flex items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              placeholder="Название статьи"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commit();
                if (e.key === "Escape") setAdding(false);
              }}
              className={cn(inputBase, "h-10 w-44")}
            />
            <button
              type="button"
              onClick={() => void commit()}
              className="inline-flex h-10 items-center rounded-xl bg-ink px-3 text-[13px] font-semibold text-white"
            >
              Готово
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-10 items-center gap-1 rounded-xl border border-dashed border-border px-3 text-[13px] font-semibold text-muted hover:border-ink hover:text-ink"
          >
            + {addLabel}
          </button>
        ))}
    </div>
  );
}

/** Процент: короткое поле со знаком «%» — рядом видно, сколько это в деньгах. */
export function PercentInput({
  value,
  onCommit,
  className,
}: {
  value: number;
  onCommit: (v: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value || ""));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(value || ""));
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const n = Math.max(0, Math.min(100, Number(draft || 0)));
    if (n !== value) onCommit(n);
  };
  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <input
        inputMode="numeric"
        value={draft}
        placeholder="0"
        onChange={(e) => {
          setEditing(true);
          setDraft(e.target.value.replace(/\D/g, "").slice(0, 3));
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className={cn(inputBase, "pr-7 text-right font-semibold tabular-nums")}
      />
      <span className="pointer-events-none absolute right-3 text-[13px] font-semibold text-muted-2">
        %
      </span>
    </span>
  );
}

export function Btn({
  children,
  tone = "ghost",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold transition-colors disabled:opacity-40",
        tone === "primary" && "bg-ink text-white hover:bg-blue-600",
        tone === "ghost" && "border border-border bg-white text-ink-2 hover:border-ink hover:text-ink",
        tone === "danger" && "bg-red-soft text-red-ink hover:bg-red hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SectionCard({
  title,
  hint,
  right,
  children,
  className,
}: {
  title?: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl bg-surface p-4 shadow-card-sm sm:p-5", className)}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-[17px] font-bold leading-tight text-ink">{title}</h2>
            )}
            {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted">
      {text}
    </div>
  );
}

/**
 * Сумма, которая сохраняется сама — когда из поля ушли или нажали Enter.
 *
 * Отдельный компонент, потому что запрос на каждую набранную цифру — это и
 * лишняя нагрузка, и мигающие цифры на экране. Пока человек печатает, поле
 * живёт своим значением; уход из поля фиксирует результат.
 */
export function MoneyCell({
  value,
  onCommit,
  className,
}: {
  value: number;
  onCommit: (v: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };
  return (
    <MoneyInput
      value={editing ? draft : value}
      className={className}
      onChange={(v) => {
        setEditing(true);
        setDraft(v);
      }}
      onEnter={commit}
      onBlurCommit={commit}
    />
  );
}
