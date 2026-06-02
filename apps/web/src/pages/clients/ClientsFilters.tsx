import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "./DateRangeFilter";

export type StatusFilter =
  | "all"
  | "active"
  | "inactive"
  | "debt"
  | "issue"
  | "black"
  | "applications";

export type FiltersState = {
  search: string;
  status: StatusFilter;
  /** ISO `YYYY-MM-DD` — нижняя граница включительно. null = нет границы. */
  dateFrom: string | null;
  /** ISO `YYYY-MM-DD` — верхняя граница включительно. null = нет границы. */
  dateTo: string | null;
  /** v0.6.15: B1 — нижняя граница даты завершения аренды (endPlanned)
   *  у клиента. Если задано — показываем только тех клиентов, у кого
   *  есть аренда с endPlanned в этом диапазоне. */
  endDateFrom?: string | null;
  /** v0.6.15: B1 — верхняя граница даты завершения аренды. */
  endDateTo?: string | null;
};

const STATUS_TABS: { id: StatusFilter; label: string; hint?: string }[] = [
  { id: "all", label: "Все" },
  { id: "active", label: "Аренда", hint: "сейчас катают" },
  { id: "inactive", label: "Неактивные", hint: "без аренды и долгов" },
  { id: "debt", label: "С долгом" },
  { id: "issue", label: "Проблемные", hint: "долг, просрочка, не выходит на связь" },
  { id: "black", label: "Ч/С" },
  { id: "applications", label: "Заявки", hint: "новые и просмотренные заявки с сайта" },
];

export function ClientsFilters({
  value,
  onChange,
}: {
  value: FiltersState;
  onChange: (next: FiltersState) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 shadow-card-sm">
      <div className="relative min-w-[220px] flex-1">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
        />
        <input
          type="text"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder="Имя или телефон…"
          className="h-9 w-full rounded-full bg-surface-soft pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-muted-2 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
          Статус
        </span>
        <div className="inline-flex rounded-full bg-surface-soft p-0.5">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange({ ...value, status: t.id })}
              title={t.hint}
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
      </div>

      {/* Фильтр по дате добавления клиента — поповер с пресетами
          «Сегодня / Вчера / За неделю / За месяц» + Range-календарь
          для произвольного диапазона. */}
      <DateRangeFilter
        from={value.dateFrom}
        to={value.dateTo}
        onChange={(r) =>
          onChange({ ...value, dateFrom: r.from, dateTo: r.to })
        }
      />

      {/* v0.6.15: B1 — фильтр клиентов по дате завершения их аренды
          (endPlanned). Показываем только клиентов, у которых есть
          аренда с endPlanned в выбранном диапазоне. */}
      <DateRangeFilter
        from={value.endDateFrom ?? null}
        to={value.endDateTo ?? null}
        onChange={(r) =>
          onChange({ ...value, endDateFrom: r.from, endDateTo: r.to })
        }
        placeholder="Завершаются"
        titleApplied="Изменить диапазон дат завершения аренд клиентов"
        titleNotApplied="Клиенты с арендой, завершающейся в этом периоде"
      />
    </div>
  );
}
