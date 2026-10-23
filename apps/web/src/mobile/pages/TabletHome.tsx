import { isAwaitingPayment, ruDate } from "@/lib/debtors/types";
import { useState } from "react";
import {
  AlarmClock,
  AlertTriangle,
  ArrowRight,
  Clock,
  History,
  Maximize2,
  Phone,
  Wallet,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { navigate } from "@/app/navigationStore";
import type { RouteId } from "@/app/route";
import type { Reminder } from "@/lib/api/reminders";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import type { ApiScooter } from "@/lib/api/types";
import { ParkLoadGauge } from "@/pages/dashboard/ParkLoadGauge";
import { FullJournalModal } from "@/pages/dashboard/ActivityFeed";
import { useScooterNaming } from "@/lib/scooterNaming";
import { NUMBER_ROWS, compareByRentalNumber, numberRow } from "@/lib/scooterOrder";
import { ElectricMark, NoNumberMark, PetrolMark } from "@/components/PowerTypeBadge";
import {
  formatRub,
  greetingByHour,
  type DashboardMetrics,
} from "@/pages/dashboard/useDashboardMetrics";

/**
 * Главная на планшете (22.10, заказчик: «проработай планшетную версию,
 * чтобы была идеальной; маленькие строчки, всё надо рассматривать»).
 *
 * Раньше планшет показывал телефонные блоки кладкой: огромная «Выручка» и
 * сжатое «Поступит сегодня», «Напоминания» и «Просрочки» с одними и теми же
 * людьми и рядом одинаковых кнопок звонка, плитки парка без номеров, пустая
 * карточка «Возвраты сегодня», лента журнала на полэкрана.
 *
 * Теперь:
 *  · сверху ровный ряд из четырёх одинаковых показателей;
 *  · слева ОДНА очередь «Кому звонить сегодня» — просрочки, долги, платежи
 *    по выкупу, выплаты инвесторам и возвраты сегодня, по срочности;
 *  · справа большой парк — номера прямо на плитках, нажал — карточка;
 *  · журнал — одной кнопкой, а не лентой на главной.
 * Шрифты под расстояние вытянутой руки: строки 18px, цифры 34px.
 */

type QueueKind = "overdue" | "debt" | "buyout" | "investor" | "return";

type QueueItem = {
  key: string;
  kind: QueueKind;
  name: string;
  /** Что за повод: «Просрочка 26 дн», «Возврат в 18:00»… */
  reason: string;
  detail?: React.ReactNode;
  amount: number | null;
  phones: (string | null | undefined)[];
  onOpen: () => void;
};

const KIND_STYLE: Record<QueueKind, { bar: string; pill: string; amount: string }> = {
  overdue: { bar: "bg-red", pill: "bg-red-soft text-red-ink", amount: "text-red" },
  debt: { bar: "bg-red", pill: "bg-red-soft text-red-ink", amount: "text-red" },
  buyout: { bar: "bg-orange", pill: "bg-orange-soft text-orange-ink", amount: "text-ink" },
  investor: { bar: "bg-blue", pill: "bg-blue-50 text-blue-700", amount: "text-ink" },
  return: { bar: "bg-green", pill: "bg-green-soft text-green-ink", amount: "text-ink" },
};

export function TabletHome({
  m,
  meName,
  revenue,
  reminders,
  onRevenue,
  onOpenRental,
  onCall,
  onSelect,
}: {
  m: DashboardMetrics;
  meName?: string | null;
  revenue: { total: number; count: number; label: string };
  reminders: Reminder[];
  onRevenue: () => void;
  onOpenRental: (id: number) => void;
  onCall: (name: string, phones: (string | null | undefined)[]) => void;
  onSelect: (id: RouteId) => void;
}) {
  const hasElectro = m.rentableElectro > 0 || m.activeElectroCount > 0;
  const naming = useScooterNaming();
  const [showAll, setShowAll] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);

  // Очередь звонков: сначала деньги, которые уже горят, потом сегодняшнее,
  // потом то, к чему готовиться.
  const queue: QueueItem[] = [
    ...m.overdue.map<QueueItem>((o) => ({
      key: `o${o.rentalId}`,
      kind: "overdue",
      name: o.clientName,
      reason: `Просрочка ${o.daysOverdue} ${plural(o.daysOverdue, ["день", "дня", "дней"])}`,
      detail: naming.render(o.scooterName, { size: "sm" }),
      amount: o.debt,
      phones: [o.clientPhone, o.clientPhone2],
      onOpen: () => onOpenRental(o.rentalId),
    })),
    ...m.debtorsNoRental.map<QueueItem>((d) => ({
      key: `d${d.debtorId}`,
      kind: "debt",
      name: d.clientName,
      reason: d.type === "damage" ? "Ущерб" : d.type === "rental_overdue" ? "Долг аренды" : "Долг",
      detail: isAwaitingPayment(d)
        ? `ждём оплату до ${ruDate(d.paymentDueDate)}`
        : `дело ${d.caseNumber}`,
      amount: d.amount,
      phones: [d.clientPhone],
      onOpen: () => navigate({ route: "debtors", debtorId: d.debtorId }),
    })),
    ...reminders
      .filter((r) => r.urgency !== "soon")
      .map<QueueItem>((r) => reminderItem(r)),
    ...m.returnsToday.map<QueueItem>((r) => ({
      key: `r${r.rentalId}`,
      kind: "return",
      name: r.clientName,
      reason: `Возврат в ${timeOf(r.endPlannedAt)}`,
      detail: naming.render(r.scooterName, { size: "sm" }),
      amount: r.sum,
      phones: [r.clientPhone, r.clientPhone2],
      onOpen: () => onOpenRental(r.rentalId),
    })),
    ...reminders.filter((r) => r.urgency === "soon").map<QueueItem>((r) => reminderItem(r)),
  ];
  const LIMIT = 8;
  const shown = showAll ? queue : queue.slice(0, LIMIT);
  const burning = m.overdueSum + m.debtorsNoRental.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="flex flex-col gap-6 pb-2">
      {/* Приветствие */}
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[17px] font-medium text-muted">
            {greetingByHour()}
            {meName ? `, ${meName.split(" ")[0]}` : ""}
          </div>
          <h1 className="font-display text-[32px] font-extrabold leading-tight tracking-tight text-ink">
            Сводка на сегодня
          </h1>
        </div>
        <div className="shrink-0 pb-1 text-[16px] font-semibold text-muted">
          {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
        </div>
      </header>

      {/* Четыре одинаковых показателя */}
      <div className="grid grid-cols-4 gap-4 portrait:grid-cols-2">
        <button
          type="button"
          onClick={onRevenue}
          className="relative flex h-[156px] flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-left text-white shadow-card active:scale-[0.99]"
        >
          {/* w-full: старый Safari не растягивает строку внутри <button>-флекса */}
          <div className="flex w-full items-center justify-between">
            <span className="text-[15px] font-semibold text-white/80">Выручка</span>
            <Maximize2 size={18} className="text-white/70" />
          </div>
          <div className="font-display text-[34px] font-extrabold leading-none tabular-nums">
            {formatRub(revenue.total)} ₽
          </div>
          <div className="truncate text-[14px] text-white/75">
            {revenue.label} · {revenue.count} {plural(revenue.count, ["платёж", "платежа", "платежей"])}
          </div>
        </button>

        <StatTile
          icon={<Wallet size={20} />}
          label="Поступит сегодня"
          value={`${formatRub(m.todayIncoming)} ₽`}
          foot={
            m.todayIncomingCount > 0
              ? `${m.todayIncomingCount} ${plural(m.todayIncomingCount, ["возврат", "возврата", "возвратов"])}`
              : "сегодня никто не возвращает"
          }
          tone="green"
        />

        <ParkLoadGauge
          title="Бензиновые"
          percent={m.loadPercent}
          active={m.activePetrolCount}
          rentable={m.rentableFleet}
          onClick={() => onSelect("fleet")}
          size={88}
          layout="row"
          narrowBelow={200}
          className="tab-xl h-[156px] rounded-3xl p-5"
        />
        {hasElectro ? (
          <ParkLoadGauge
            title="Электро"
            tone="electro"
            percent={m.loadPercentElectro}
            active={m.activeElectroCount}
            rentable={m.rentableElectro}
            onClick={() => onSelect("partners")}
            size={88}
            layout="row"
            narrowBelow={200}
            className="tab-xl h-[156px] rounded-3xl p-5"
          />
        ) : (
          <StatTile
            icon={<AlertTriangle size={20} />}
            label="Просрочено"
            value={`${m.overdueCount}`}
            foot={`долг ${formatRub(m.overdueSum)} ₽`}
            tone="red"
          />
        )}
      </div>

      <div className="grid items-start gap-6 landscape:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Одна очередь «Кому звонить» */}
        <section className="overflow-hidden rounded-3xl bg-surface shadow-card">
          <div className="flex items-center gap-3 px-6 pb-3 pt-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-soft text-red-ink">
              <Phone size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[21px] font-extrabold leading-tight text-ink">Кому звонить сегодня</h2>
              <div className="text-[15px] text-muted">
                {queue.length === 0
                  ? "все в графике"
                  : `${queue.length} ${plural(queue.length, ["человек", "человека", "человек"])}${burning > 0 ? ` · горит ${formatRub(burning)} ₽` : ""}`}
              </div>
            </div>
          </div>
          {queue.length === 0 ? (
            <div className="px-6 pb-8 pt-4 text-[17px] text-muted">
              Просрочек и долгов нет, сегодня никто не возвращает.
            </div>
          ) : (
            <div className="flex flex-col">
              {shown.map((q) => (
                <QueueRow key={q.key} q={q} onCall={() => onCall(q.name, q.phones)} />
              ))}
            </div>
          )}
          {queue.length > LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="flex h-14 w-full items-center justify-center gap-2 border-t border-border text-[16px] font-bold text-blue-600 active:bg-surface-soft"
            >
              {showAll ? "Свернуть" : `Показать всех · ещё ${queue.length - LIMIT}`}
              <ArrowRight size={18} className={cn(showAll && "-rotate-90")} />
            </button>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <ParkBoard m={m} onOpenFleet={() => onSelect("fleet")} />
          <button
            type="button"
            onClick={() => setJournalOpen(true)}
            className="flex min-h-[72px] items-center gap-4 rounded-3xl bg-surface px-6 py-4 text-left shadow-card active:bg-surface-soft"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-soft text-muted">
              <History size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[18px] font-bold text-ink">Журнал действий</span>
              <span className="block text-[14.5px] text-muted">кто что сделал и когда</span>
            </span>
            <ArrowRight size={20} className="text-muted-2" />
          </button>
        </div>
      </div>
      {journalOpen && <FullJournalModal compact onClose={() => setJournalOpen(false)} />}
    </div>
  );

  function reminderItem(r: Reminder): QueueItem {
    const investor = r.kind === "investor_payout";
    return {
      key: `m${r.id}`,
      kind: investor ? "investor" : "buyout",
      name: r.title,
      reason: investor ? "Инвестор" : "Выкуп",
      detail: r.subtitle,
      amount: r.amount,
      phones: [r.phone],
      onOpen: () =>
        r.link?.section === "rassrochki"
          ? navigate({ route: "rassrochki", buyoutDealId: r.link.entityId })
          : navigate({ route: "partners" }),
    };
  }
}

function StatTile({
  icon,
  label,
  value,
  foot,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  foot: string;
  tone: "green" | "red";
}) {
  return (
    <div className="flex h-[156px] flex-col justify-between rounded-3xl bg-surface p-5 shadow-card">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            tone === "green" ? "bg-green-soft text-green-ink" : "bg-red-soft text-red-ink",
          )}
        >
          {icon}
        </span>
        <span className="text-[15px] font-semibold text-muted">{label}</span>
      </div>
      <div
        className={cn(
          "font-display text-[34px] font-extrabold leading-none tabular-nums",
          tone === "red" ? "text-red" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="truncate text-[14px] text-muted">{foot}</div>
    </div>
  );
}

function QueueRow({ q, onCall }: { q: QueueItem; onCall: () => void }) {
  const s = KIND_STYLE[q.kind];
  const hasPhone = q.phones.some(Boolean);
  const icon =
    q.kind === "return" ? <Clock size={14} /> : q.kind === "buyout" || q.kind === "investor" ? <AlarmClock size={14} /> : null;
  return (
    <div className="flex items-center gap-3 border-t border-border px-4 py-2.5">
      <span className={cn("h-11 w-1.5 shrink-0 rounded-full", s.bar)} />
      <button
        type="button"
        onClick={q.onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1.5 text-left active:bg-surface-soft"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[18px] font-bold leading-snug text-ink">{q.name}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[14.5px] text-muted">
            <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-bold", s.pill)}>
              {icon}
              {q.reason}
            </span>
            {q.detail && <span className="min-w-0 truncate">{q.detail}</span>}
          </span>
        </span>
        {q.amount != null && q.amount > 0 && (
          <span className={cn("shrink-0 text-[19px] font-extrabold tabular-nums", s.amount)}>
            {formatRub(q.amount)} ₽
          </span>
        )}
      </button>
      {hasPhone ? (
        <button
          type="button"
          onClick={onCall}
          aria-label={`Позвонить: ${q.name}`}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-green-soft text-green-ink active:scale-95"
        >
          <Phone size={22} />
        </button>
      ) : (
        <span className="w-14 shrink-0" />
      )}
    </div>
  );
}

/* ───────── Парк: номера на плитках ───────── */

type Tile = "rented" | "overdue" | "late_today" | "pool" | "ready" | "repair" | "for_sale" | "sold" | "disassembly";

const TILE_CLS: Record<Tile, string> = {
  rented: "bg-blue text-white",
  overdue: "bg-red text-white",
  late_today: "bg-blue text-white ring-[3px] ring-red/60",
  pool: "bg-green text-white",
  ready: "bg-surface-soft text-muted border border-border-strong",
  repair: "bg-orange text-white",
  for_sale: "bg-purple text-white",
  sold: "bg-border text-muted",
  disassembly: "bg-ink text-white",
};

const LEGEND: { id: Tile; label: string }[] = [
  { id: "rented", label: "в аренде" },
  { id: "overdue", label: "просрочка / ущерб" },
  { id: "late_today", label: "опаздывает" },
  { id: "pool", label: "готов" },
  { id: "ready", label: "не распределён" },
  { id: "repair", label: "ремонт" },
  { id: "for_sale", label: "продажа" },
];

function tileOf(s: ApiScooter, m: DashboardMetrics): Tile {
  if (s.baseStatus === "sold") return "sold";
  if (s.baseStatus === "disassembly") return "disassembly";
  if (s.baseStatus === "for_sale" || s.baseStatus === "buyout") return "for_sale";
  if (s.baseStatus === "repair") return "repair";
  if (m.overdueScooterIds.has(s.id) || m.damageDebtScooterIds.has(s.id)) return "overdue";
  if (m.pastDueTodayScooterIds.has(s.id)) return "late_today";
  if (m.anyActiveRentalByScooter.has(s.id)) return "rented";
  if (s.baseStatus === "rental_pool") return "pool";
  return "ready";
}

function ParkBoard({ m, onOpenFleet }: { m: DashboardMetrics; onOpenFleet: () => void }) {
  const { data: scooters = [] } = useApiScooters();
  const { data: models = [] } = useApiScooterModels();
  const electricModels = new Set(models.filter((x) => x.isElectric).map((x) => x.id));
  const live = scooters.filter((s) => !s.archivedAt && !s.deletedAt);
  const tiles = [...live].sort(compareByRentalNumber).map((s) => ({
    s,
    status: tileOf(s, m),
    row: numberRow(s),
    electric: s.rentalSlot != null ? s.slotPool === "electric" : s.modelId != null && electricModels.has(s.modelId),
  }));
  const rows = NUMBER_ROWS.map((r) => ({ ...r, list: tiles.filter((t) => t.row === r.key) })).filter(
    (r) => r.list.length > 0,
  );
  const counts = tiles.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="rounded-3xl bg-surface p-6 shadow-card">
      <button type="button" onClick={onOpenFleet} className="mb-4 flex w-full items-center gap-2 text-left">
        <h2 className="text-[21px] font-extrabold text-ink">Парк</h2>
        <span className="text-[17px] font-semibold text-muted-2">· {live.length}</span>
        <ArrowRight size={20} className="ml-auto text-muted-2" />
      </button>
      <div className="flex flex-col gap-4">
        {rows.map((r) => (
          <div key={r.key}>
            {rows.length > 1 && (
              <div className="mb-2 flex min-w-0 items-center gap-2 text-[15px] font-bold text-ink">
                {r.key === "electric" ? <ElectricMark size="sm" /> : r.key === "petrol" ? <PetrolMark size="sm" /> : <NoNumberMark />}
                <span>{r.label}</span>
                <span className="font-semibold tabular-nums text-muted-2">· {r.list.length}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {r.list.map((t) => (
                <button
                  key={t.s.id}
                  type="button"
                  title={t.s.name}
                  onClick={() => navigate({ route: "fleet", scooterId: t.s.id })}
                  className={cn(
                    "relative flex h-12 w-12 items-center justify-center rounded-xl text-[17px] font-extrabold tabular-nums active:scale-95",
                    TILE_CLS[t.status],
                  )}
                >
                  {t.s.rentalSlot ?? ""}
                  {t.electric && (
                    <Zap
                      size={t.s.rentalSlot ? 11 : 18}
                      strokeWidth={2.6}
                      className={cn("fill-current", t.s.rentalSlot && "absolute right-1 top-1 opacity-90")}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-4 text-[14px] text-muted">
        {LEGEND.filter((l) => (counts[l.id] ?? 0) > 0).map((l) => (
          <span key={l.id} className="inline-flex items-center gap-2">
            <span className={cn("h-3.5 w-3.5 rounded-[4px]", TILE_CLS[l.id])} />
            {l.label} · <b className="font-bold text-ink">{counts[l.id]}</b>
          </span>
        ))}
      </div>
    </section>
  );
}

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
