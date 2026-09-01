import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "@/pages/clients/DateRangeFilter";
import {
  AVATAR_CLASS,
  initials,
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
/**
 * Ряд показателей. Не сетка, а «резиновая» строка: когда плиток пять, а в
 * ряд помещается три, последние две растягиваются на всю ширину — раньше
 * рядом с «Заработком» зияла пустая ячейка (фидбэк 01.09).
 */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    // 158px — минимум, при котором на телефоне (390px) в ряд встают две
    // плитки, а не одна: иначе пять показателей растягиваются на пол-экрана.
    <div className="flex flex-wrap gap-3 [&>*]:min-w-[158px] [&>*]:flex-1">
      {children}
    </div>
  );
}

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
            // Без truncate: подсказка вроде «ещё 45 000 ₽ к получению»
            // обрывалась на полуслове (правка 01.09).
            "text-[11.5px] leading-tight",
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
 * Переключатель периода: пресеты + произвольный диапазон.
 *
 * Правки 31.08: живёт в шапке «Динамики продаж», а не отдельной строкой
 * над показателями — рядом с табами раздела получался частокол
 * одинаковых переключателей. Стиль намеренно другой: полупрозрачное
 * «стекло» с тонкой рамкой вместо плотных пилюль, чтобы взгляд не путал
 * его с навигацией.
 *
 * Произвольный период выбирается тем же календарём, что в «Клиентах» и
 * «Арендах» (DateRangeFilter) — люди к нему привыкли.
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
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex gap-0.5 rounded-full border border-border/70 bg-surface-soft/50 p-0.5 backdrop-blur-sm">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id, { from: "", to: "" })}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
              preset === p.id
                ? "bg-surface text-ink shadow-card-sm"
                : "text-muted-2 hover:text-ink",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <DateRangeFilter
        from={custom.from || null}
        to={custom.to || null}
        placeholder="Период"
        titleApplied="Произвольный период продаж"
        titleNotApplied="Выбрать произвольный период"
        onChange={({ from, to }) => {
          if (from || to) {
            onChange("custom", { from: from ?? "", to: to ?? "" });
          } else {
            onChange("month", { from: "", to: "" });
          }
        }}
      />
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
