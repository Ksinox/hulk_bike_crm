import { cn } from "@/lib/utils";
import { DateRangeFilter } from "@/pages/clients/DateRangeFilter";

// v0.6.50: вынесли массив табов наружу — переиспользуем в RentalsFiltersChips
// (раскрытом блоке без поиска), который рендерится прямо в общем блоке Аренд.

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
  // v0.5.4: 'issue' оставлен в типе для совместимости со старыми
  // URL/localStorage. На UI вкладки больше нет (статуса 'problem' нет).
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
  /** v0.6.15: ISO YYYY-MM-DD — нижняя граница endPlanned. */
  endDateFrom?: string | null;
  /** v0.6.15: ISO YYYY-MM-DD — верхняя граница endPlanned. */
  endDateTo?: string | null;
};

// v0.4.47: убран таб «Все» — он дублировал «Активные». «Активные»
// теперь означают ВСЕ живые аренды (включая просрочки/возвраты).
// Если оператор хотел «всё подряд» — это и есть активные.
// v0.5.4: убраны вкладки «Заявки/Проблемные». Статусов new_request/
// problem больше нет в БД — фильтр был мёртвый.
const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "active", label: "Активные" },
  { id: "overdue", label: "Просрочка" },
  { id: "return_today", label: "Возврат сегодня" },
  { id: "new_request", label: "Выданы сегодня" },
  { id: "completed", label: "Завершены" },
  { id: "archived", label: "Архив" },
];

/**
 * v0.6.51: RentalsFilters раскрывается в основном блоке Аренд по клику
 * на иконку-фильтр. Статусные чипы (Активные/Просрочка/...) выведены
 * отдельно в RentalsFiltersChips и всегда видны — здесь оставлены ТОЛЬКО
 * дополнительные фильтры (диапазоны дат «Дата выдачи» / «Завершаются»).
 * Это убирает дубль чипов между основным блоком и поповером.
 */
/**
 * v0.6.53: при кликe на иконку-фильтр раскрывается ВСЕ доп. фильтры:
 * чипы статусов + диапазоны дат. По умолчанию (filtersOpen=false) ничего
 * не видно — чище интерфейс «по умолчанию».
 */
export function RentalsFilters({
  value,
  onChange,
}: {
  value: FiltersState;
  onChange: (next: FiltersState) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[12px] bg-surface-soft/60 p-2.5">
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
          Статус
        </div>
        <RentalsFiltersChips value={value} onChange={onChange} />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
          По датам
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter
            from={value.dateFrom}
            to={value.dateTo}
            onChange={(r) =>
              onChange({ ...value, dateFrom: r.from, dateTo: r.to })
            }
          />
          <DateRangeFilter
            from={value.endDateFrom ?? null}
            to={value.endDateTo ?? null}
            onChange={(r) =>
              onChange({ ...value, endDateFrom: r.from, endDateTo: r.to })
            }
            placeholder="Завершаются"
            titleApplied="Изменить диапазон дат завершения аренды"
            titleNotApplied="Фильтр по дате завершения аренды (endPlanned)"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * v0.6.50: компактный ряд таб-чипов БЕЗ поиска и пресетов дат —
 * предназначен для вставки прямо в общий белый блок страницы аренд
 * (Rentals.tsx). Поиск + кнопка фильтра + плюс уже есть в шапке этого
 * блока, дробить визуально не нужно.
 */
export function RentalsFiltersChips({
  value,
  onChange,
}: {
  value: FiltersState;
  onChange: (next: FiltersState) => void;
}) {
  return (
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
  );
}
