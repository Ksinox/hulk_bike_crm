import {
  AlertTriangle,
  ArrowRight,
  Bike,
  Clock,
  Gauge,
  Wallet,
} from "lucide-react";
import type { RouteId } from "@/app/route";
import { useMe } from "@/lib/api/auth";
import { useApiScooters } from "@/lib/api/scooters";
import type { ApiScooter } from "@/lib/api/types";
import { ActivityFeed } from "@/pages/dashboard/ActivityFeed";
import { cn } from "@/lib/utils";
import {
  formatRub,
  greetingByHour,
  useDashboardMetrics,
  type DashboardMetrics,
  type OverdueItem,
  type ReturnItem,
} from "@/pages/dashboard/useDashboardMetrics";

/**
 * Мобильный дашборд. Переиспользует тот же data-хук, что и десктоп
 * (useDashboardMetrics) — источник данных один, расходиться цифры не могут.
 * Раскладка одноколоночная под телефон: KPI-сетка 2×2, статус парка,
 * возвраты сегодня и просрочки.
 */
export function MobileDashboard({
  onSelect,
}: {
  onSelect: (id: RouteId) => void;
}) {
  const { data: me } = useMe();
  const m = useDashboardMetrics();

  if (m.isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Приветствие */}
      <div>
        <div className="text-[13px] font-medium text-muted">
          {greetingByHour()}
          {me?.name ? `, ${me.name.split(" ")[0]}` : ""}
        </div>
        <div className="font-display text-[22px] font-bold tracking-tight text-ink">
          Сводка на сегодня
        </div>
      </div>

      {/* KPI 2×2 */}
      <div className="grid grid-cols-2 gap-3">
        <KpiTile
          icon={<Wallet size={16} />}
          tone="green"
          label="Поступит сегодня"
          value={m.todayIncoming > 0 ? formatRub(m.todayIncoming) : "0"}
          unit="₽"
          foot={
            m.todayIncomingCount > 0
              ? `${m.todayIncomingCount} ${plural(m.todayIncomingCount, ["возврат", "возврата", "возвратов"])}`
              : "нет возвратов"
          }
        />
        <KpiTile
          icon={<AlertTriangle size={16} />}
          tone={m.overdueCount > 0 ? "red" : "neutral"}
          label="Просрочено"
          value={String(m.overdueCount)}
          unit={m.overdueCount > 0 ? "шт" : ""}
          foot={
            m.overdueCount > 0
              ? `долг ${formatRub(m.overdueSum)} ₽`
              : "нет просрочек"
          }
          onClick={m.overdueCount > 0 ? () => onSelect("debtors") : undefined}
        />
        <KpiTile
          icon={<Bike size={16} />}
          tone="blue"
          label="Активных аренд"
          value={String(m.activeRentalsCount)}
          unit={m.fleetTotal > 0 ? `/${m.fleetTotal}` : ""}
          foot={m.fleetTotal > 0 ? `${m.loadPercent}% загрузка` : "парк пуст"}
          onClick={() => onSelect("rentals")}
        />
        <KpiTile
          icon={<Gauge size={16} />}
          tone="neutral"
          label="Загрузка парка"
          value={String(m.loadPercent)}
          unit="%"
          foot={`${m.park.pool} готов к аренде · ${m.park.inRepair} в ремонте`}
          onClick={() => onSelect("fleet")}
        />
      </div>

      {/* Статус парка */}
      <MobileParkGrid metrics={m} />

      {/* Возвраты сегодня */}
      <Section
        title="Возвраты сегодня"
        count={m.returnsToday.length}
        icon={<Clock size={15} />}
      >
        {m.returnsToday.length === 0 ? (
          <EmptyRow text="Сегодня никто не возвращает" />
        ) : (
          m.returnsToday
            .slice(0, 6)
            .map((r) => <ReturnRow key={r.rentalId} item={r} />)
        )}
      </Section>

      {/* Просрочки */}
      <Section
        title="Просрочки"
        count={m.overdueCount}
        icon={<AlertTriangle size={15} />}
        tone="red"
        onMore={m.overdueCount > 0 ? () => onSelect("debtors") : undefined}
      >
        {m.overdue.length === 0 ? (
          <EmptyRow text="Просрочек нет — все аренды в графике" />
        ) : (
          m.overdue
            .slice(0, 6)
            .map((o) => <OverdueRow key={o.rentalId} item={o} />)
        )}
      </Section>

      {/* Последние действия — лента журнала (как в десктоп-CRM). */}
      <ActivityFeed compact />
    </div>
  );
}

/* ───────────────────────── KPI-плитка ───────────────────────── */

type Tone = "green" | "red" | "blue" | "neutral";

const toneStyles: Record<Tone, { icon: string; value: string }> = {
  green: { icon: "bg-green-soft text-green-ink", value: "text-ink" },
  red: { icon: "bg-red-soft text-red-ink", value: "text-red" },
  blue: { icon: "bg-blue-50 text-blue-600", value: "text-ink" },
  neutral: { icon: "bg-surface-soft text-muted", value: "text-ink" },
};

function KpiTile({
  icon,
  tone,
  label,
  value,
  unit,
  foot,
  onClick,
}: {
  icon: React.ReactNode;
  tone: Tone;
  label: string;
  value: string;
  unit?: string;
  foot: string;
  onClick?: () => void;
}) {
  const s = toneStyles[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex flex-col gap-2 rounded-2xl bg-surface p-3.5 text-left shadow-card",
        onClick && "active:scale-[0.98]",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            s.icon,
          )}
        >
          {icon}
        </span>
        {onClick && <ArrowRight size={14} className="text-muted-2" />}
      </div>
      <div className="text-[11px] font-medium leading-tight text-muted">
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-display text-[26px] font-bold leading-none tabular-nums",
            s.value,
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[13px] font-semibold text-muted">{unit}</span>
        )}
      </div>
      <div className="text-[11px] leading-tight text-muted-2">{foot}</div>
    </button>
  );
}

/* ───────────────────────── статус парка (цветные квадраты) ─────────────── */

// Производный статус плитки — зеркало логики десктопного ParkPanel
// (computeTileStatus). Цвета совпадают с десктопом.
type ParkTile =
  | "rented"
  | "overdue"
  | "late_today"
  | "pool"
  | "ready"
  | "repair"
  | "for_sale"
  | "sold"
  | "disassembly";

const PARK_TILE_CLS: Record<ParkTile, string> = {
  rented: "bg-blue",
  overdue: "bg-red",
  late_today: "bg-blue ring-2 ring-red/50",
  pool: "bg-green",
  ready: "bg-surface-soft border border-border-strong",
  repair: "bg-orange",
  for_sale: "bg-purple",
  sold: "bg-border",
  disassembly: "bg-ink",
};

const PARK_LEGEND: { id: ParkTile; label: string }[] = [
  { id: "rented", label: "в аренде" },
  { id: "overdue", label: "просрочка / ущерб" },
  { id: "late_today", label: "опаздывает" },
  { id: "pool", label: "готов" },
  { id: "ready", label: "не распределён" },
  { id: "repair", label: "ремонт" },
  { id: "for_sale", label: "продажа" },
];

function parkTileOf(s: ApiScooter, m: DashboardMetrics): ParkTile {
  if (s.baseStatus === "sold") return "sold";
  if (s.baseStatus === "disassembly") return "disassembly";
  if (s.baseStatus === "for_sale" || s.baseStatus === "buyout") return "for_sale";
  if (s.baseStatus === "repair") return "repair";
  if (m.overdueScooterIds.has(s.id) || m.damageDebtScooterIds.has(s.id))
    return "overdue";
  if (m.pastDueTodayScooterIds.has(s.id)) return "late_today";
  if (m.anyActiveRentalByScooter.has(s.id)) return "rented";
  if (s.baseStatus === "rental_pool") return "pool";
  return "ready";
}

function MobileParkGrid({ metrics }: { metrics: DashboardMetrics }) {
  const { data: scooters = [] } = useApiScooters();
  const live = scooters.filter((s) => !s.archivedAt && !s.deletedAt);
  const tiles = live
    .map((s) => ({ id: s.id, name: s.name, status: parkTileOf(s, metrics) }))
    .sort((a, b) => parkNum(a.name) - parkNum(b.name));

  const counts = tiles.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="rounded-2xl bg-surface p-3.5 shadow-card">
      <div className="mb-2.5 text-[12px] font-semibold text-muted">
        Парк · {live.length} скутеров
      </div>
      {/* Сетка цветных квадратов — по одному на скутер, цвет = состояние. */}
      <div className="flex flex-wrap gap-1.5">
        {tiles.map((t) => (
          <span
            key={t.id}
            title={t.name}
            className={cn("h-7 w-7 rounded-[7px]", PARK_TILE_CLS[t.status])}
          />
        ))}
      </div>
      {/* Легенда со счётчиками — только присутствующие статусы. */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-border pt-3 text-[11px] text-muted">
        {PARK_LEGEND.filter((l) => (counts[l.id] ?? 0) > 0).map((l) => (
          <span key={l.id} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-[3px]", PARK_TILE_CLS[l.id])} />
            {l.label} · {counts[l.id]}
          </span>
        ))}
      </div>
    </div>
  );
}

function parkNum(name: string): number {
  const m = name.match(/#\s*(\d+)/);
  return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
}

/* ───────────────────────── секции-списки ───────────────────────── */

function Section({
  title,
  count,
  icon,
  tone,
  onMore,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  tone?: "red";
  onMore?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-surface p-3.5 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("text-muted", tone === "red" && "text-red")}>
          {icon}
        </span>
        <h3 className="text-[14px] font-bold text-ink">{title}</h3>
        {count > 0 && (
          <span
            className={cn(
              "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
              tone === "red" ? "bg-red-soft text-red-ink" : "bg-surface-soft text-muted",
            )}
          >
            {count}
          </span>
        )}
        {onMore && (
          <button
            type="button"
            onClick={onMore}
            className="ml-auto flex items-center gap-0.5 text-[12px] font-semibold text-blue-600"
          >
            Все <ArrowRight size={13} />
          </button>
        )}
      </div>
      <div className="flex flex-col divide-y divide-border">{children}</div>
    </section>
  );
}

function ReturnRow({ item }: { item: ReturnItem }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">
          {item.clientName}
        </div>
        <div className="truncate text-[11px] text-muted">{item.scooterName}</div>
      </div>
      <div className="text-right">
        <div className="text-[13px] font-bold tabular-nums text-ink">
          {formatRub(item.sum)} ₽
        </div>
        <div className="text-[11px] text-muted-2">{timeOf(item.endPlannedAt)}</div>
      </div>
    </div>
  );
}

function OverdueRow({ item }: { item: OverdueItem }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">
          {item.clientName}
        </div>
        <div className="truncate text-[11px] text-muted">{item.scooterName}</div>
      </div>
      <div className="text-right">
        <div className="text-[13px] font-bold tabular-nums text-red">
          {formatRub(item.debt)} ₽
        </div>
        <div className="text-[11px] text-muted-2">
          {item.daysOverdue} {plural(item.daysOverdue, ["день", "дня", "дней"])}
        </div>
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="py-3 text-[12px] text-muted-2">{text}</div>;
}

/* ───────────────────────── скелет загрузки ───────────────────────── */

function DashboardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4">
      <div className="h-12 w-2/3 rounded-xl bg-surface" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-surface" />
        ))}
      </div>
      <div className="h-24 rounded-2xl bg-surface" />
      <div className="h-40 rounded-2xl bg-surface" />
    </div>
  );
}

/* ───────────────────────── utils ───────────────────────── */

function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
