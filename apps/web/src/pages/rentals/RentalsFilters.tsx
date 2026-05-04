import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { listRecentBillingPeriods } from "@/lib/billingPeriod";

export type StatusFilter =
  | "all"
  | "active"
  | "overdue"
  | "return_today"
  | "new_request"
  | "completed"
  | "issue"
  | "archived";

export type FiltersState = {
  search: string;
  status: StatusFilter;
  /**
   * v0.4.0: фильтр расчётного периода (15→14). Хранится как ISO дата
   * начала периода или null = «все периоды». Применяется к дате выдачи
   * аренды (rental.start). Ограничивает список выводимых аренд.
   */
  periodStartIso?: string | null;
};

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "active", label: "Активные" },
  { id: "overdue", label: "Просрочка" },
  { id: "return_today", label: "Возврат сегодня" },
  { id: "new_request", label: "Выданы сегодня" },
  { id: "completed", label: "Завершены" },
  { id: "issue", label: "Проблемные" },
  { id: "archived", label: "Архив" },
];

export function RentalsFilters({
  value,
  onChange,
}: {
  value: FiltersState;
  onChange: (next: FiltersState) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 shadow-card-sm">
      <div className="relative min-w-[240px] flex-1">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
        />
        <input
          type="text"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder="Клиент, скутер или номер аренды…"
          className="h-9 w-full rounded-full bg-surface-soft pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-muted-2 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="inline-flex flex-wrap rounded-full bg-surface-soft p-0.5">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange({ ...value, status: t.id })}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
              value.status === t.id
                ? "bg-white text-ink shadow-card-sm"
                : "text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* v0.4.0: выпадающий фильтр расчётного периода (15→14) */}
      <PeriodFilter
        value={value.periodStartIso ?? null}
        onChange={(p) => onChange({ ...value, periodStartIso: p })}
      />
    </div>
  );
}

function PeriodFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const periods = listRecentBillingPeriods(12);
  return (
    <select
      value={value ?? "all"}
      onChange={(e) =>
        onChange(e.target.value === "all" ? null : e.target.value)
      }
      className="h-9 rounded-full border border-border bg-white px-3 text-[12px] font-semibold text-ink outline-none focus:border-blue-600"
      title="Период (15-е число прошлого по 14-е текущего)"
    >
      <option value="all">Все периоды</option>
      {periods.map((p) => (
        <option key={p.start.toISOString()} value={p.start.toISOString()}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
