/**
 * RentalsList — список аренд в двух режимах (v0.7.22):
 *   • "tiles"  — сетка компактных карточек-плиток (аватар, ФИО, скутер,
 *     даты, бейдж дней, долг, статус). Адаптивная: число колонок зависит
 *     от ширины колонки списка (auto-fill).
 *   • "list"   — плотная таблица по столбцам (Клиент / Скутер / Выдан /
 *     Возврат / Дней / Сумма / Статус) с сортировкой по клику на заголовок.
 *
 * Выбранная строка/плитка подсвечивается; есть долг/просрочка — красная
 * подсветка. Клик → onSelect(id) (открывает карточку аренды).
 *
 * Данные (клиенты / скутеры / долги) грузятся ОДИН раз на уровне списка и
 * прокидываются в строки — это нужно и для сортировки таблицы по столбцам.
 */
import { useMemo, useState } from "react";
import { ChevronRight, SearchX, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Rental } from "@/lib/mock/rentals";
import { effectiveRentalStatus } from "@/lib/rentalStatus";
import { initialsOf } from "@/lib/mock/clients";
import { useClientPhoto } from "@/pages/clients/clientStore";
import { useApiClients } from "@/lib/api/clients";
import { useApiScooters } from "@/lib/api/scooters";
import { useDebtAggregate } from "@/lib/api/debt";
import type { RentalsViewMode } from "./rentalsViewMode";

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

/** Цвет аватарки клиента — детерминирован от id для стабильности. */
function clientColor(id: number): string {
  const palette = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
  return palette[((id - 1) % palette.length + palette.length) % palette.length]!;
}

/** Дней просрочки или дней до планового возврата (со знаком). */
function daysToEnd(endPlannedRu: string): number {
  const [d, m, y] = endPlannedRu.split(".").map(Number);
  if (!d || !m || !y) return 0;
  const end = new Date(y, m - 1, d).getTime();
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((end - today) / 86400000);
}

/** DD.MM.YYYY → число для сравнения (y*10000+m*100+d). */
function dateKey(ru: string): number {
  const [d, m, y] = ru.split(".").map(Number);
  if (!d || !m || !y) return 0;
  return y * 10000 + m * 100 + d;
}

const STATUS_LABEL: Record<string, string> = {
  active: "активна",
  overdue: "просрочка",
  returning: "возврат",
  completed: "завершена",
  completed_damage: "с ущербом",
  problem: "проблемная",
  cancelled: "отменена",
  police: "в полиции",
  court: "суд",
  meeting: "встреча",
  new_request: "заявка",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-green-soft text-green-ink",
  overdue: "bg-red-soft text-red-ink",
  returning: "bg-orange-soft text-orange-ink",
  completed: "bg-surface-soft text-muted",
  completed_damage: "bg-red-soft text-red-ink",
  problem: "bg-red-soft text-red-ink",
  cancelled: "bg-surface-soft text-muted",
  police: "bg-red-soft text-red-ink",
  court: "bg-red-soft text-red-ink",
  meeting: "bg-blue-50 text-blue-700",
  new_request: "bg-blue-50 text-blue-700",
};

/** Производная строка с готовыми к отображению/сортировке полями. */
type Row = {
  rental: Rental;
  clientId: number;
  clientName: string;
  scooterLabel: string;
  mileage: number | null;
  startKey: number;
  endKey: number;
  delta: number;
  badgeText: string;
  badgeTone: string;
  effStatus: string;
  hasDebt: boolean;
  rightSum: number;
  pendingRent: number;
  danger: boolean;
};

type SortCol =
  | "client"
  | "scooter"
  | "start"
  | "end"
  | "days"
  | "sum"
  | "status";

export function RentalsList({
  items,
  selectedId,
  onSelect,
  viewMode,
}: {
  items: Rental[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  viewMode: RentalsViewMode;
}) {
  const { data: apiClients } = useApiClients();
  const { data: apiScooters = [] } = useApiScooters();
  const { data: debtAgg } = useDebtAggregate();

  // Локальная сортировка только для табличного режима. null → исходный
  // порядок (по статусу, как пришёл из Rentals).
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" } | null>(
    null,
  );

  const rows = useMemo<Row[]>(() => {
    return items.map((r) => {
      const c = apiClients?.find((x) => x.id === r.clientId);
      const myDebt = debtAgg?.find((d) => d.rentalId === r.id);
      const realDebt = myDebt
        ? myDebt.overdueBalance + myDebt.damageBalance + myDebt.manualBalance
        : 0;
      const pendingRent = myDebt?.pendingRent ?? 0;
      const hasDebt = realDebt > 0;
      const effStatus = effectiveRentalStatus(r.status, r.endPlanned, realDebt);
      const isOverdue = effStatus === "overdue";
      const delta = daysToEnd(r.endPlanned);
      const overdueDays = delta < 0 ? Math.abs(delta) : 0;
      const daysLeft = delta > 0 ? delta : 0;
      const badgeText =
        isOverdue && overdueDays > 0
          ? `${overdueDays}д`
          : delta === 0
            ? "0д"
            : `${daysLeft}д`;
      const badgeTone =
        isOverdue || hasDebt
          ? "bg-red-600 text-white"
          : delta === 0
            ? "bg-orange-500 text-white"
            : "bg-emerald-500 text-white";
      const scooter = r.scooterId
        ? apiScooters.find((s) => s.id === r.scooterId)
        : null;
      return {
        rental: r,
        clientId: r.clientId,
        clientName: c?.name ?? `Клиент #${r.clientId}`,
        scooterLabel: r.scooter,
        mileage: scooter?.mileage ?? null,
        startKey: dateKey(r.start),
        endKey: dateKey(r.endPlanned),
        delta,
        badgeText,
        badgeTone,
        effStatus,
        hasDebt,
        rightSum: hasDebt ? realDebt : pendingRent,
        pendingRent,
        danger: isOverdue || hasDebt,
      };
    });
  }, [items, apiClients, apiScooters, debtAgg]);

  const sortedRows = useMemo<Row[]>(() => {
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const cmp = (a: Row, b: Row): number => {
      switch (sort.col) {
        case "client":
          return a.clientName.localeCompare(b.clientName, "ru") * dir;
        case "scooter":
          return a.scooterLabel.localeCompare(b.scooterLabel, "ru") * dir;
        case "start":
          return (a.startKey - b.startKey) * dir;
        case "end":
          return (a.endKey - b.endKey) * dir;
        case "days":
          return (a.delta - b.delta) * dir;
        case "sum":
          return (a.rightSum - b.rightSum) * dir;
        case "status":
          return (
            (STATUS_LABEL[a.effStatus] ?? a.effStatus).localeCompare(
              STATUS_LABEL[b.effStatus] ?? b.effStatus,
              "ru",
            ) * dir
          );
        default:
          return 0;
      }
    };
    return [...rows].sort(cmp);
  }, [rows, sort]);

  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 p-8 text-center">
        <SearchX size={36} className="text-muted-2" />
        <div className="text-[14px] font-semibold text-ink">Аренд не найдено</div>
        <div className="text-[12px] text-muted">
          Попробуйте другой фильтр или запрос
        </div>
      </div>
    );
  }

  if (viewMode === "tiles") {
    return (
      <div className="scrollbar-thin h-full overflow-y-auto overflow-x-hidden p-3">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {rows.map((row) => (
            <RentalTile
              key={row.rental.id}
              row={row}
              active={row.rental.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    );
  }

  // ===== Табличный режим =====
  const toggleSort = (col: SortCol) =>
    setSort((s) =>
      s && s.col === col
        ? s.dir === "asc"
          ? { col, dir: "desc" }
          : null
        : { col, dir: "asc" },
    );

  return (
    <div className="scrollbar-thin h-full overflow-auto">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-surface-soft">
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
            <Th label="Клиент" col="client" sort={sort} onSort={toggleSort} />
            <Th label="Скутер" col="scooter" sort={sort} onSort={toggleSort} />
            <Th label="Выдан" col="start" sort={sort} onSort={toggleSort} />
            <Th label="Возврат" col="end" sort={sort} onSort={toggleSort} />
            <Th label="Дней" col="days" sort={sort} onSort={toggleSort} align="center" />
            <Th label="Сумма" col="sum" sort={sort} onSort={toggleSort} align="right" />
            <Th label="Статус" col="status" sort={sort} onSort={toggleSort} />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <RentalTableRow
              key={row.rental.id}
              row={row}
              active={row.rental.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  label,
  col,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  col: SortCol;
  sort: { col: SortCol; dir: "asc" | "desc" } | null;
  onSort: (col: SortCol) => void;
  align?: "left" | "center" | "right";
}) {
  const activeSort = sort?.col === col;
  return (
    <th
      className={cn(
        "border-b border-border px-3 py-2 font-semibold select-none",
        align === "right" && "text-right",
        align === "center" && "text-center",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-ink",
          align === "right" && "flex-row-reverse",
          activeSort ? "text-ink" : "",
        )}
      >
        {label}
        {activeSort &&
          (sort!.dir === "asc" ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          ))}
      </button>
    </th>
  );
}

/** Маленькая аватарка клиента (фото или инициалы). */
function MiniAvatar({
  clientId,
  name,
  size = 28,
}: {
  clientId: number;
  name: string;
  size?: number;
}) {
  const photo = useClientPhoto(clientId);
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, background: clientColor(clientId) }}
    >
      {photo?.thumbUrl ? (
        <img src={photo.thumbUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span
          className="font-display font-bold leading-none text-white"
          style={{ fontSize: size * 0.4 }}
        >
          {initialsOf(name)}
        </span>
      )}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide",
        STATUS_TONE[status] ?? "bg-surface-soft text-muted-2",
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function RentalTableRow({
  row,
  active,
  onSelect,
}: {
  row: Row;
  active: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <tr
      onClick={() => onSelect(row.rental.id)}
      className={cn(
        "cursor-pointer border-b border-border text-[12.5px] transition-colors",
        row.danger
          ? active
            ? "bg-red-soft/55"
            : "bg-red-soft/25 hover:bg-red-soft/40"
          : active
            ? "bg-blue-50"
            : "hover:bg-surface-soft/70",
      )}
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <MiniAvatar clientId={row.clientId} name={row.clientName} size={26} />
          <span className="truncate font-semibold text-ink" title={row.clientName}>
            {row.clientName}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 text-muted">
        <span className="whitespace-nowrap">{row.scooterLabel}</span>
        {row.mileage != null && (
          <span className="ml-1 text-[11px] text-muted-2 tabular-nums">
            · {fmt(row.mileage)} км
          </span>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums text-muted whitespace-nowrap">
        {row.rental.start}
      </td>
      <td className="px-3 py-2 tabular-nums text-muted whitespace-nowrap">
        {row.rental.endPlanned}
      </td>
      <td className="px-3 py-2 text-center">
        <span
          className={cn(
            "inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
            row.badgeTone,
          )}
        >
          {row.badgeText}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
        {row.hasDebt ? (
          <span className="font-bold text-red-ink">{fmt(row.rightSum)} ₽</span>
        ) : row.pendingRent > 0 ? (
          <span className="font-semibold text-ink-2">{fmt(row.pendingRent)} ₽</span>
        ) : (
          <span className="text-muted-2">0 ₽</span>
        )}
      </td>
      <td className="px-3 py-2">
        <StatusPill status={row.effStatus} />
      </td>
    </tr>
  );
}

function RentalTile({
  row,
  active,
  onSelect,
}: {
  row: Row;
  active: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(row.rental.id)}
      className={cn(
        "relative flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors",
        row.danger
          ? active
            ? "border-red-300 bg-red-soft/55"
            : "border-red-200 bg-red-soft/25 hover:bg-red-soft/40"
          : active
            ? "border-blue-300 bg-blue-50"
            : "border-border bg-surface hover:bg-surface-soft/70",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="relative shrink-0">
          <MiniAvatar clientId={row.clientId} name={row.clientName} size={40} />
          <span
            className={cn(
              "absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1 py-0.5 text-[9px] font-bold leading-none tabular-nums shadow-card-sm",
              row.badgeTone,
            )}
          >
            {row.badgeText}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[13px] font-bold leading-tight text-ink"
            title={row.clientName}
          >
            {row.clientName}
          </div>
          <div className="truncate text-[11.5px] text-muted leading-tight">
            {row.scooterLabel}
          </div>
        </div>
        <ChevronRight size={14} className="shrink-0 text-muted-2" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] tabular-nums text-muted-2 whitespace-nowrap">
          {row.rental.start} → {row.rental.endPlanned}
        </span>
        <StatusPill status={row.effStatus} />
      </div>

      <div className="flex items-end justify-between">
        {row.hasDebt ? (
          <div>
            <span className="text-[15px] font-bold tabular-nums text-red-ink">
              {fmt(row.rightSum)} ₽
            </span>
            <span className="ml-1 text-[10px] font-semibold text-red-ink/80">долг</span>
          </div>
        ) : row.pendingRent > 0 ? (
          <div>
            <span className="text-[14px] font-semibold tabular-nums text-ink-2">
              {fmt(row.pendingRent)} ₽
            </span>
            <span className="ml-1 text-[10px] text-muted-2">к оплате</span>
          </div>
        ) : (
          <span className="text-[12px] text-muted-2">платежей нет</span>
        )}
      </div>
    </button>
  );
}
