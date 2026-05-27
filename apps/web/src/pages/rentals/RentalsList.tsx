/**
 * RentalsList v0.6.44 — список аренд по новому эталону.
 *
 * Каждый элемент:
 *   • Слева — фото клиента 60×60 (или цветной круг с инициалами).
 *     Под фото — мелкий бейдж «N дн» (просрочка / до возврата).
 *   • Центр — ФИО (bold), «Jog #02 · 11 111 км», дата+время выдачи.
 *   • Справа — сумма долга красным (или «нет долга» серым).
 *   • Левый бордер 4px цвета статуса (red overdue / green active /
 *     orange returning / blue new / gray иначе).
 *   • Активная аренда подсвечивается мягким фоном (красноватым если
 *     есть долг, иначе нейтрально-голубым).
 */
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
    <div className="overflow-hidden rounded-2xl bg-surface shadow-card-sm">
      <div className="scrollbar-thin max-h-[calc(100vh-260px)] overflow-y-auto overflow-x-hidden">
        {items.map((r) => (
          <RentalRow
            key={r.id}
            rental={r}
            active={r.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
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
  // Сумма для правой колонки: реальный долг (просрочка+ущерб+ручной).
  // Если 0 — pending (плановые неоплаченные платежи). Если оба 0 — «—».
  const rightSum = realDebt > 0 ? realDebt : pendingRent;
  const rightLabel = realDebt > 0 ? "долг" : pendingRent > 0 ? "к оплате" : "";

  const effStatus = effectiveRentalStatus(r.status, r.endPlanned, realDebt);
  const isOverdue = effStatus === "overdue";
  const isReturning = effStatus === "returning";
  const isActive = effStatus === "active";

  // Бейдж дней слева под фото.
  const delta = daysToEnd(r.endPlanned);
  const badgeText =
    isOverdue && delta < 0
      ? `${Math.abs(delta)}д`
      : delta === 0
        ? "сегодня"
        : delta > 0 && delta <= 7
          ? `${delta}д`
          : "";
  const badgeTone =
    isOverdue
      ? "bg-red-soft text-red-ink"
      : delta === 0
        ? "bg-orange-soft text-orange-ink"
        : "bg-blue-50 text-blue-700";

  // Левый бордер 4px по статусу.
  const accentColor =
    isOverdue
      ? "bg-red"
      : isReturning
        ? "bg-orange"
        : isActive
          ? "bg-green"
          : effStatus === "new_request" || effStatus === "meeting"
            ? "bg-blue"
            : "bg-border";

  // Подсветка активной строки.
  const activeBg = isOverdue
    ? "bg-red-soft/35 hover:bg-red-soft/45"
    : "bg-blue-50/60 hover:bg-blue-50";

  // Пробег скутера из API.
  const scooter = r.scooterId
    ? apiScooters.find((s) => s.id === r.scooterId)
    : null;
  const mileage = scooter?.mileage ?? null;

  return (
    <button
      type="button"
      onClick={() => onSelect(r.id)}
      className={cn(
        "relative flex w-full items-stretch gap-3 border-b border-border/60 px-3 py-3 pl-4 text-left transition-colors last:border-b-0",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-[4px]",
        `before:${accentColor}`.replace("before:bg-", "before:!bg-"),
        active ? activeBg : "hover:bg-surface-soft/70",
      )}
      style={{
        // динамический left-accent через CSS-переменную чтобы Tailwind
        // JIT не выбрасывал из биндинга
      }}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0 h-full w-[4px]",
          accentColor,
        )}
      />

      {/* Фото клиента 60×60 + бейдж дней под ним. */}
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span
          className="relative flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-border"
          style={{
            background: c
              ? `linear-gradient(135deg, ${clientColor(c.id)}33, ${clientColor(c.id)}11)`
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
            <span
              className="font-display text-[18px] font-extrabold"
              style={{
                color: c ? clientColor(c.id) : "#94a3b8",
                opacity: 0.55,
              }}
            >
              {c ? initialsOf(c.name) : "?"}
            </span>
          )}
        </span>
        {badgeText && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums",
              badgeTone,
            )}
          >
            {badgeText}
          </span>
        )}
      </div>

      {/* Центр — имя, скутер, дата выдачи. */}
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
        <div
          className="text-[14px] font-bold leading-tight text-ink line-clamp-1"
          title={c?.name ?? undefined}
        >
          {c?.name ?? "Клиент #" + r.clientId}
        </div>
        <div className="text-[11.5px] text-muted-2 leading-tight truncate">
          <span className="font-semibold text-ink-2">{r.scooter}</span>
          {mileage != null && (
            <>
              <span className="mx-1 opacity-40">·</span>
              <span className="tabular-nums">{fmt(mileage)} км</span>
            </>
          )}
        </div>
        <div className="text-[11px] text-muted-2 leading-tight tabular-nums">
          {r.start} {r.startTime && <>· {r.startTime}</>}
        </div>
      </div>

      {/* Правый верх — сумма долга. */}
      <div className="shrink-0 flex flex-col items-end justify-center gap-0.5 pr-1">
        {rightSum > 0 ? (
          <>
            <div className="text-[15px] font-extrabold tabular-nums text-red-ink leading-none">
              {fmt(rightSum)} ₽
            </div>
            <div className="text-[10px] uppercase tracking-wider text-red-ink/70 font-semibold">
              {rightLabel}
            </div>
          </>
        ) : (
          <>
            <div className="text-[13px] font-bold tabular-nums text-muted leading-none">
              0 ₽
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-2 font-semibold">
              без долга
            </div>
          </>
        )}
      </div>
    </button>
  );
}
