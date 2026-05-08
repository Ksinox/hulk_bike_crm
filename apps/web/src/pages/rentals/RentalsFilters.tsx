import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "@/pages/clients/DateRangeFilter";

export type StatusFilter =
  // v0.4.47: 'all' оставлен в типе для обратной совместимости со
  // старыми ссылками/URL — на UI больше не показывается. Логически
  // идентичен 'active' в новой схеме.
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
   * v0.4.0: фильтр расчётного периода (15→14). Старый select по
   * месяцам выпилен — теперь используются произвольные диапазоны через
   * DateRangeFilter (dateFrom / dateTo, ISO YYYY-MM-DD). Поле оставлено
   * для совместимости с сохранёнными состояниями: если оно прилетит из
   * URL/storage — Rentals.tsx преобразует его в dateFrom/dateTo.
   */
  periodStartIso?: string | null;
  /** ISO YYYY-MM-DD — нижняя граница даты выдачи аренды. */
  dateFrom: string | null;
  /** ISO YYYY-MM-DD — верхняя граница даты выдачи аренды. */
  dateTo: string | null;
};

// v0.4.47: убран таб «Все» — он дублировал «Активные». «Активные»
// теперь означают ВСЕ живые аренды (включая просрочки/возвраты).
// Если оператор хотел «всё подряд» — это и есть активные.
const STATUS_TABS: { id: StatusFilter; label: string }[] = [
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

      {/* Фильтр по дате выдачи аренды — поповер с пресетами «Сегодня /
          Вчера / За неделю / За месяц» + Range-календарь. Заменил
          старый select по биллинговым периодам (15→14): пользователь
          жаловался что неудобно, а пикером можно выбрать любой
          произвольный диапазон. */}
      <DateRangeFilter
        from={value.dateFrom}
        to={value.dateTo}
        onChange={(r) =>
          onChange({ ...value, dateFrom: r.from, dateTo: r.to })
        }
      />
    </div>
  );
}
