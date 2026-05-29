/**
 * RentalsList — список аренд в двух режимах (v0.7.23):
 *   • "tiles"  — сетка карточек-плиток. ОСНОВНОЕ изображение плитки —
 *     фото скутера (модельный avatar) сверху; поверх него в левом нижнем
 *     углу — прямоугольная (со скруглением) аватарка клиента. Ниже —
 *     ФИО, скутер, даты, статус, долг.
 *   • "list"   — плотная таблица по столбцам (№ / Клиент / Скутер /
 *     Выдан / Возврат / Дней / Сумма / Статус) с сортировкой по клику на
 *     заголовок. Колонки прижаты к содержимому (не растянуты), строки
 *     крупные и читаемые. Аватарки — квадрат со скруглением (не круг).
 *
 * Данные (клиенты / скутеры / модели / долги) грузятся ОДИН раз на уровне
 * списка и прокидываются в строки — это нужно и для сортировки таблицы.
 */
import { useMemo, useState } from "react";
import { SearchX, ChevronUp, ChevronDown, Bike, SquareParking } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Rental } from "@/lib/mock/rentals";
import { effectiveRentalStatus } from "@/lib/rentalStatus";
import { initialsOf } from "@/lib/mock/clients";
import { useClientPhoto } from "@/pages/clients/clientStore";
import { useApiClients } from "@/lib/api/clients";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useDebtAggregate } from "@/lib/api/debt";
import { useParkingSessions } from "@/lib/api/parking";
import { fileUrl } from "@/lib/files";
import type { RentalsViewMode } from "./rentalsViewMode";

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

/** Разбор «Jog #02» → { model: "Jog", num: "02" }. */
function parseScooter(label: string): { model: string; num: string | null } {
  const m = label.match(/^(.*?)\s*#\s*(\d+)\s*$/);
  if (m) return { model: (m[1] ?? "").trim(), num: m[2] ?? null };
  return { model: label, num: null };
}

/** Скутер: круглый бейдж с номером + модель (+ пробег). */
function ScooterTag({
  label,
  mileage,
  size = "sm",
}: {
  label: string;
  mileage?: number | null;
  size?: "sm" | "md";
}) {
  const { model, num } = parseScooter(label);
  const dot = size === "md" ? "h-6 min-w-6 text-[12px]" : "h-5 min-w-5 text-[11px]";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {num != null && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-ink px-1.5 font-bold tabular-nums text-white",
            dot,
          )}
        >
          {num}
        </span>
      )}
      <span className="text-muted">{model}</span>
      {mileage != null && (
        <span className="text-[11px] tabular-nums text-muted-2">
          · {fmt(mileage)} км
        </span>
      )}
    </span>
  );
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
  scooterAvatarSrc: string | null;
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
  onParking: boolean;
  parkingDays: number;
};

type SortCol =
  | "id"
  | "client"
  | "scooter"
  | "start"
  | "end"
  | "days"
  | "sum"
  | "status"
  | "parking";

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
  const { data: models = [] } = useApiScooterModels();
  const { data: debtAgg } = useDebtAggregate();
  const { data: parkingAll = [] } = useParkingSessions();

  // Локальная сортировка только для табличного режима.
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" } | null>(
    null,
  );

  const rows = useMemo<Row[]>(() => {
    return items.map((r) => {
      const c = apiClients?.find((x) => x.id === r.clientId);
      const myDebt = debtAgg?.find((d) => d.rentalId === r.id);
      // realDebt — для статуса (просрочка): паркинг сюда НЕ входит, он не
      // делает аренду просроченной. Но в сумму к показу паркинг включаем.
      const realDebt = myDebt
        ? myDebt.overdueBalance + myDebt.damageBalance + myDebt.manualBalance
        : 0;
      const parkingBalance = myDebt?.parkingBalance ?? 0;
      const pendingRent = myDebt?.pendingRent ?? 0;
      const displayDebt = realDebt + parkingBalance;
      const hasDebt = displayDebt > 0;
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
      const model = scooter
        ? scooter.modelId
          ? models.find((m) => m.id === scooter.modelId)
          : models.find((m) =>
              m.name.toLowerCase().includes((scooter.model ?? "").toLowerCase()),
            )
        : null;
      return {
        rental: r,
        clientId: r.clientId,
        clientName: c?.name ?? `Клиент #${r.clientId}`,
        scooterLabel: r.scooter,
        scooterAvatarSrc: fileUrl(model?.avatarKey, { variant: "view" }),
        mileage: scooter?.mileage ?? null,
        startKey: dateKey(r.start),
        endKey: dateKey(r.endPlanned),
        delta,
        badgeText,
        badgeTone,
        effStatus,
        hasDebt,
        rightSum: hasDebt ? displayDebt : pendingRent,
        pendingRent,
        danger: isOverdue || hasDebt,
        // v0.8.5: бейдж 🅿 — если в ТЕКУЩЕЙ аренде (этой связке) есть
        // паркинг (любой, не только сейчас активный). Прошлые паркинги
        // предыдущих связок-продлений висят на других rentalId и сюда
        // не попадают.
        onParking: parkingAll.some((p) => p.rentalId === r.id),
        parkingDays: parkingAll
          .filter((p) => p.rentalId === r.id)
          .reduce((s, p) => s + p.days, 0),
      };
    });
  }, [items, apiClients, apiScooters, models, debtAgg, parkingAll]);

  const sortedRows = useMemo<Row[]>(() => {
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const cmp = (a: Row, b: Row): number => {
      switch (sort.col) {
        case "id":
          return (a.rental.id - b.rental.id) * dir;
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
        case "parking":
          return (a.parkingDays - b.parkingDays) * dir;
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
    // v0.8.6: плитки фиксированной ширины, перенос, центрирование,
    // вертикальный скролл. Заполняют ширину сверху→вниз, при нехватке
    // высоты — вертикальный скролл (карточки не растягиваются на 1fr).
    return (
      <div className="scrollbar-thin h-full overflow-y-auto overflow-x-hidden p-3">
        <div className="flex flex-wrap content-start justify-center gap-3">
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

  // v0.8.5: колонка «Паркинг» показывается только если в выборке есть
  // аренда с паркингом → блок адаптивно расширяется на эту колонку.
  const hasAnyParking = rows.some((r) => r.parkingDays > 0);

  return (
    <div className="scrollbar-thin h-full overflow-auto px-2">
      {/* w-auto: колонки прижаты к содержимому (не растянуты на всю ширину). */}
      <table className="w-auto border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
            <Th label="№" col="id" sort={sort} onSort={toggleSort} />
            <Th label="Клиент" col="client" sort={sort} onSort={toggleSort} />
            <Th label="Скутер" col="scooter" sort={sort} onSort={toggleSort} />
            <Th label="Выдан" col="start" sort={sort} onSort={toggleSort} />
            <Th label="Возврат" col="end" sort={sort} onSort={toggleSort} />
            <Th label="Дней" col="days" sort={sort} onSort={toggleSort} align="center" />
            {hasAnyParking && (
              <Th label="Паркинг" col="parking" sort={sort} onSort={toggleSort} align="center" />
            )}
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
              showParking={hasAnyParking}
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
        "whitespace-nowrap border-b border-border px-4 py-2.5 font-semibold select-none",
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

/**
 * Аватарка клиента — квадрат/прямоугольник со скруглением (не круг).
 * w/h задаются явно; для таблицы — квадрат, для плитки — портрет.
 */
function ClientAvatar({
  clientId,
  name,
  w,
  h,
  ring = false,
}: {
  clientId: number;
  name: string;
  w: number;
  h: number;
  ring?: boolean;
}) {
  const photo = useClientPhoto(clientId);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg",
        ring && "ring-2 ring-white shadow-card-sm",
      )}
      style={{ width: w, height: h, background: clientColor(clientId) }}
    >
      {photo?.thumbUrl ? (
        <img src={photo.thumbUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span
          className="font-display font-bold leading-none text-white"
          style={{ fontSize: Math.min(w, h) * 0.42 }}
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
  showParking,
}: {
  row: Row;
  active: boolean;
  onSelect: (id: number) => void;
  showParking?: boolean;
}) {
  return (
    <tr
      onClick={() => onSelect(row.rental.id)}
      className={cn(
        "cursor-pointer border-b border-border text-[13px] transition-colors",
        row.danger
          ? active
            ? "bg-red-soft/55"
            : "bg-red-soft/25 hover:bg-red-soft/40"
          : active
            ? "bg-blue-50"
            : "hover:bg-surface-soft/70",
      )}
    >
      <td className="px-4 py-5 tabular-nums font-mono text-[12px] text-muted-2 whitespace-nowrap">
        #{String(row.rental.id).padStart(4, "0")}
      </td>
      <td className="px-4 py-5">
        <div className="flex items-center gap-3 min-w-0">
          <ClientAvatar clientId={row.clientId} name={row.clientName} w={42} h={42} />
          <span
            className="truncate text-[14px] font-semibold text-ink"
            title={row.clientName}
          >
            {row.clientName}
          </span>
        </div>
      </td>
      <td className="px-4 py-5 text-[13px] whitespace-nowrap">
        <ScooterTag label={row.scooterLabel} mileage={row.mileage} />
      </td>
      <td className="px-4 py-5 tabular-nums text-muted whitespace-nowrap">
        {row.rental.start}
      </td>
      <td className="px-4 py-5 tabular-nums text-muted whitespace-nowrap">
        {row.rental.endPlanned}
      </td>
      <td className="px-4 py-5 text-center">
        <span
          className={cn(
            "inline-block rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
            row.badgeTone,
          )}
        >
          {row.badgeText}
        </span>
      </td>
      {showParking && (
        <td className="px-4 py-5 text-center whitespace-nowrap">
          {row.parkingDays > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-800 tabular-nums"
              title="В этой аренде есть паркинг"
            >
              <SquareParking size={12} />
              {row.parkingDays} дн
            </span>
          ) : (
            <span className="text-muted-2">—</span>
          )}
        </td>
      )}
      <td className="px-4 py-5 text-right tabular-nums whitespace-nowrap">
        {row.hasDebt ? (
          <span className="font-bold text-red-ink">{fmt(row.rightSum)} ₽</span>
        ) : row.pendingRent > 0 ? (
          <span className="font-semibold text-ink-2">{fmt(row.pendingRent)} ₽</span>
        ) : (
          <span className="text-muted-2">0 ₽</span>
        )}
      </td>
      <td className="px-4 py-5 whitespace-nowrap">
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
        "group flex w-[230px] flex-col overflow-hidden rounded-2xl border text-left transition-colors",
        row.danger
          ? active
            ? "border-red-300 bg-red-soft/40"
            : "border-red-200 bg-surface hover:bg-red-soft/20"
          : active
            ? "border-blue-300 bg-blue-50"
            : "border-border bg-surface hover:bg-surface-soft/60",
      )}
    >
      {/* Основная зона — фото скутера; поверх неё аватарка клиента слева
          снизу + бейдж дней справа сверху. */}
      <div className="relative h-[136px] w-full bg-white">
        {row.scooterAvatarSrc ? (
          <img
            src={row.scooterAvatarSrc}
            alt={row.scooterLabel}
            className="h-full w-full object-contain p-2"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Bike size={40} strokeWidth={1.5} className="text-muted-2" />
          </div>
        )}
        {/* Бейдж дней — правый верхний угол. */}
        <span
          className={cn(
            "absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums shadow-card-sm",
            row.badgeTone,
          )}
        >
          {row.badgeText}
        </span>
        {/* Аватарка клиента — портрет со скруглением, левый нижний угол. */}
        <div className="absolute bottom-2 left-2">
          <ClientAvatar
            clientId={row.clientId}
            name={row.clientName}
            w={44}
            h={56}
            ring
          />
        </div>
        {/* Метка скутера — правый нижний угол: круглый номер + модель. */}
        {(() => {
          const { model, num } = parseScooter(row.scooterLabel);
          return (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-ink/75 py-0.5 pl-0.5 pr-2 text-[10px] font-semibold text-white">
              {num != null && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[9px] font-bold text-ink tabular-nums">
                  {num}
                </span>
              )}
              {model}
            </span>
          );
        })()}
      </div>

      {/* Инфо. */}
      <div className="flex flex-col gap-1.5 p-2.5">
        <div
          className="truncate text-[13px] font-bold leading-tight text-ink"
          title={row.clientName}
        >
          {row.clientName}
        </div>
        <div className="text-[11px] tabular-nums text-muted-2 whitespace-nowrap">
          {row.rental.start} → {row.rental.endPlanned}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1">
            <StatusPill status={row.effStatus} />
            {row.onParking && (
              <SquareParking
                size={13}
                className="text-yellow-600"
                aria-label="на паркинге"
              />
            )}
          </span>
          {row.hasDebt ? (
            <span className="text-[14px] font-bold tabular-nums text-red-ink">
              {fmt(row.rightSum)} ₽
            </span>
          ) : row.pendingRent > 0 ? (
            <span className="text-[13px] font-semibold tabular-nums text-ink-2">
              {fmt(row.pendingRent)} ₽
            </span>
          ) : (
            <span className="text-[11px] text-muted-2">оплачено</span>
          )}
        </div>
      </div>
    </button>
  );
}
