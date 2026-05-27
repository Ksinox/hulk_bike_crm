/**
 * RentalsList v0.6.49 — список аренд по эталону.
 *
 * Каждый элемент шире (p-3) и воздушнее:
 *   • Слева — круглая аватарка 56px (фото или цветной круг с инициалами).
 *     Снизу аватарки — бейдж с количеством дней («12д» красным при
 *     просрочке, зелёным/синим иначе).
 *   • Центр — ФИО (font-bold 14px), «Jog #02 · 11 111 км», дата+время.
 *   • Справа — крупно сумма долга красным + «долг»; либо «0 ₽» серым +
 *     «платежей нет». Дальше ChevronRight.
 *   • Красная рамка (border-2 border-red-200) если есть долг/overdue.
 *   • Активная — ring-2 ring-blue-400.
 */
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Rental } from "@/lib/mock/rentals";
import { effectiveRentalStatus } from "@/lib/rentalStatus";
import { initialsOf } from "@/lib/mock/clients";
import { useClientPhoto } from "@/pages/clients/clientStore";
import { useApiClients } from "@/lib/api/clients";
import { useApiScooters } from "@/lib/api/scooters";
import { useDebtAggregate } from "@/lib/api/debt";

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

export function RentalsList({
  items,
  selectedId,
  onSelect,
}: {
  items: Rental[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 rounded-2xl bg-surface p-8 text-center shadow-card-sm">
        <div className="text-2xl">🔍</div>
        <div className="text-[14px] font-semibold text-ink">
          Аренд не найдено
        </div>
        <div className="text-[12px] text-muted">
          Попробуйте другой фильтр или запрос
        </div>
      </div>
    );
  }

  return (
    <div className="scrollbar-thin max-h-[calc(100vh-260px)] overflow-y-auto overflow-x-hidden flex flex-col gap-2 pr-1">
      {items.map((r) => (
        <RentalRow
          key={r.id}
          rental={r}
          active={r.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function RentalRow({
  rental: r,
  active,
  onSelect,
}: {
  rental: Rental;
  active: boolean;
  onSelect: (id: number) => void;
}) {
  const { data: apiClients } = useApiClients();
  const { data: apiScooters = [] } = useApiScooters();
  const { data: debtAgg } = useDebtAggregate();
  const c = apiClients?.find((x) => x.id === r.clientId);
  const photo = useClientPhoto(r.clientId);

  const myDebt = debtAgg?.find((d) => d.rentalId === r.id);
  const realDebt = myDebt
    ? myDebt.overdueBalance + myDebt.damageBalance + myDebt.manualBalance
    : 0;
  const pendingRent = myDebt?.pendingRent ?? 0;
  const hasDebt = realDebt > 0;
  const rightSum = hasDebt ? realDebt : pendingRent;

  const effStatus = effectiveRentalStatus(r.status, r.endPlanned, realDebt);
  const isOverdue = effStatus === "overdue";

  // Бейдж дней под аватаркой.
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

  // Пробег скутера из API.
  const scooter = r.scooterId
    ? apiScooters.find((s) => s.id === r.scooterId)
    : null;
  const mileage = scooter?.mileage ?? null;

  const danger = isOverdue || hasDebt;

  return (
    <button
      type="button"
      onClick={() => onSelect(r.id)}
      className={cn(
        "w-full flex items-center gap-3 rounded-2xl p-3 text-left transition-colors",
        danger
          ? "border-2 border-red-200 bg-red-soft/20 hover:bg-red-soft/30"
          : "border border-border bg-surface hover:bg-surface-soft/70",
        active && "ring-2 ring-blue-400",
      )}
    >
      {/* Аватарка 56×56 + бейдж дней снизу. */}
      <div className="relative shrink-0">
        <span
          className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full"
          style={{
            background: c
              ? clientColor(c.id)
              : "var(--surface-soft)",
          }}
        >
          {photo?.thumbUrl ? (
            <img
              src={photo.thumbUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="font-display text-[16px] font-bold leading-none text-white">
              {c ? initialsOf(c.name) : "?"}
            </span>
          )}
        </span>
        <span
          className={cn(
            "absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums shadow-card-sm",
            badgeTone,
          )}
        >
          {badgeText}
        </span>
      </div>

      {/* Контент справа от аватарки. */}
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <div
          className="text-[14px] font-bold leading-tight text-ink line-clamp-1"
          title={c?.name ?? undefined}
        >
          {c?.name ?? "Клиент #" + r.clientId}
        </div>
        <div className="text-[12px] text-muted leading-tight truncate">
          {r.scooter}
          {mileage != null && (
            <>
              <span className="mx-1 opacity-50">·</span>
              <span className="tabular-nums">{fmt(mileage)} км</span>
            </>
          )}
        </div>
        <div className="text-[11.5px] text-muted-2 leading-tight tabular-nums mt-0.5">
          {r.start} {r.startTime && <>· {r.startTime}</>}
        </div>
      </div>

      {/* Правая колонка — долг или 0. */}
      <div className="shrink-0 text-right flex flex-col items-end gap-0.5">
        {hasDebt ? (
          <>
            <div className="text-[16px] font-bold tabular-nums text-red-ink leading-none">
              {fmt(rightSum)} ₽
            </div>
            <div className="text-[10.5px] font-semibold text-red-ink/80">
              долг
            </div>
          </>
        ) : (
          <>
            <div className="text-[15px] font-semibold tabular-nums text-muted leading-none">
              {pendingRent > 0 ? `${fmt(pendingRent)} ₽` : "0 ₽"}
            </div>
            <div className="text-[10.5px] text-muted-2">
              {pendingRent > 0 ? "к оплате" : "платежей нет"}
            </div>
          </>
        )}
      </div>

      <ChevronRight size={16} className="shrink-0 text-muted-2" />
    </button>
  );
}
