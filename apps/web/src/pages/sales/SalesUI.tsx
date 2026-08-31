import { useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AVATAR_CLASS,
  initials,
  isoDate,
  presetRange,
  type PeriodPreset,
  type Range,
} from "./salesUtils";

/** Мелкие переиспользуемые элементы блока «Продажи». */

export function ManagerAvatar({
  name,
  color,
  size = 32,
}: {
  name: string;
  color?: string | null;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold",
        AVATAR_CLASS[color ?? "blue"] ?? AVATAR_CLASS.blue,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name) || "?"}
    </span>
  );
}

/** KPI-плитка: крупное число, подпись и дельта к прошлому периоду. */
export function StatTile({
  label,
  value,
  suffix,
  hint,
  delta,
  accent,
  icon,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint?: string;
  /** Изменение к прошлому периоду, %. null — сравнивать не с чем. */
  delta?: number | null;
  accent?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-2xl p-4",
        accent
          ? "bg-emerald-600 text-white shadow-card"
          : "bg-surface shadow-card-sm",
      )}
    >
      <div className="flex items-center gap-2">
        {icon && (
          <span className={accent ? "text-white/70" : "text-muted-2"}>{icon}</span>
        )}
        <span
          className={cn(
            // Без truncate: на телефоне подписи вроде «Ожидаемая прибыль»
            // обрезались в «ОЖИДАЕМАЯ ПРИБ…». Пусть переносятся.
            "text-[11px] font-bold uppercase leading-tight tracking-wider",
            accent ? "text-white/70" : "text-muted-2",
          )}
        >
          {label}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span
          className={cn(
            "font-display text-[26px] font-extrabold leading-none tabular-nums",
            accent ? "text-white" : "text-ink",
          )}
        >
          {value}
        </span>
        {suffix && (
          <span
            className={cn(
              "text-[13px] font-semibold",
              accent ? "text-white/80" : "text-muted",
            )}
          >
            {suffix}
          </span>
        )}
        {delta != null && delta !== 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
              accent
                ? "bg-white/15 text-white"
                : delta >= 0
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-soft text-red-ink",
            )}
            title="к прошлому периоду"
          >
            {delta >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {delta > 0 ? "+" : ""}
            {delta}%
          </span>
        )}
      </div>
      {hint && (
        <div
          className={cn(
            "truncate text-[11.5px]",
            accent ? "text-white/70" : "text-muted-2",
          )}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: "today", label: "Сегодня" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "year", label: "Год" },
];

/**
 * Переключатель периода: пресеты + произвольный диапазон. Диапазон
 * раскрывается по кнопке — в свёрнутом виде не занимает место.
 */
export function PeriodPicker({
  preset,
  custom,
  onChange,
}: {
  preset: PeriodPreset;
  custom: { from: string; to: string };
  onChange: (preset: PeriodPreset, custom: { from: string; to: string }) => void;
}) {
  const [open, setOpen] = useState(preset === "custom");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-full bg-surface p-1 shadow-card-sm">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setOpen(false);
              onChange(p.id, custom);
            }}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              preset === p.id ? "bg-ink text-white" : "text-muted hover:text-ink",
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next) {
              const r = presetRange("month");
              onChange("custom", {
                from: custom.from || isoDate(r.from),
                to: custom.to || isoDate(r.to),
              });
            } else {
              onChange("month", custom);
            }
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
            preset === "custom" ? "bg-ink text-white" : "text-muted hover:text-ink",
          )}
        >
          <CalendarRange size={13} /> Период
        </button>
      </div>
      {open && (
        <div className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 shadow-card-sm">
          <input
            type="date"
            value={custom.from}
            onChange={(e) => onChange("custom", { ...custom, from: e.target.value })}
            className="h-7 rounded-lg border border-border bg-surface px-2 text-[12.5px] tabular-nums outline-none focus:border-emerald-500"
          />
          <span className="text-[12px] text-muted-2">—</span>
          <input
            type="date"
            value={custom.to}
            onChange={(e) => onChange("custom", { ...custom, to: e.target.value })}
            className="h-7 rounded-lg border border-border bg-surface px-2 text-[12.5px] tabular-nums outline-none focus:border-emerald-500"
          />
        </div>
      )}
    </div>
  );
}

/** Заголовок блока с необязательным действием справа. */
export function SectionCard({
  title,
  hint,
  action,
  children,
  className,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-card-sm",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-bold text-ink">{title}</h2>
        {hint && <span className="text-[11.5px] text-muted-2">{hint}</span>}
        <div className="ml-auto flex items-center gap-2">{action}</div>
      </header>
      {children}
    </section>
  );
}

/** Полоса выполнения плана — три строки в одной компактной группе. */
export function PlanBar({
  label,
  fact,
  plan,
  unit,
}: {
  label: string;
  fact: number;
  plan: number;
  unit?: string;
}) {
  const pct = plan > 0 ? Math.round((fact / plan) * 100) : 0;
  const done = pct >= 100;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
          {label}
        </span>
        <span className="ml-auto text-[13px] font-bold tabular-nums text-ink">
          {fact.toLocaleString("ru-RU")}
          {unit ? ` ${unit}` : ""}
        </span>
        <span className="text-[11px] text-muted-2">
          {plan > 0 ? (
            <>
              из {plan.toLocaleString("ru-RU")}
              {unit ? ` ${unit}` : ""} ·{" "}
              <b className={done ? "text-emerald-700" : "text-ink-2"}>{pct}%</b>
            </>
          ) : (
            "плана нет"
          )}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-soft">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700",
            done ? "bg-emerald-500" : "bg-blue-600",
          )}
          style={{ width: `${plan > 0 ? Math.min(100, pct) : 0}%` }}
        />
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        {icon}
      </div>
      <div className="text-[15px] font-bold text-ink">{title}</div>
      <div className="max-w-[460px] text-[13px] leading-relaxed text-muted">
        {text}
      </div>
      {action}
    </div>
  );
}

export type { Range };
