import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  HandCoins,
  Search,
  Star,
  Users,
  X,
} from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { useIsMobile } from "@/lib/useIsMobile";
import { cn } from "@/lib/utils";
import { consumePending, onNavigate } from "@/app/navigationStore";
import { useFleetScooters } from "@/pages/fleet/fleetStore";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { ScooterCard } from "@/pages/fleet/ScooterCard";
import type { ScooterDisplayStatus } from "@/lib/mock/fleet";
import {
  useBuyoutDeals,
  useAllBuyoutPayments,
  BUYOUT_STATUS_CLASS,
  BUYOUT_STATUS_LABEL,
  type BuyoutDeal,
} from "@/lib/api/buyout";
import {
  StatTile,
  StatRow,
  SectionCard,
  EmptyState,
  PeriodPicker,
} from "@/pages/sales/SalesUI";
import { SalesChart } from "@/pages/sales/SalesChart";
import {
  fmt,
  fmtCompact,
  ruDateShort,
  isAtNow,
  panView,
  rangeFromView,
  seriesOfEvents,
  viewForPreset,
  zoomView,
  bucketForRange,
  type ChartView,
  type PeriodPreset,
} from "@/pages/sales/salesUtils";
import { NewBuyoutWizard } from "./NewBuyoutWizard";
import { BuyoutDealCard } from "./BuyoutDealCard";

/**
 * Раздел «Аренда с выкупом» (01.09).
 *
 * Отдельное рабочее место, как «Продажи»: обзор с аналитикой, список
 * выкупов со шкалой погашения, отдельная вкладка просрочек (то, ради чего
 * этот раздел открывают чаще всего) и рейтинг клиентов по платёжной
 * дисциплине. Всё открывается внутри раздела.
 */

type Tab = "overview" | "deals" | "overdue" | "clients";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "overview", label: "Обзор", icon: BarChart3 },
  { id: "deals", label: "Выкупы", icon: HandCoins },
  { id: "overdue", label: "Просрочки", icon: AlertTriangle },
  { id: "clients", label: "Клиенты", icon: Star },
];

export function Buyout() {
  const [tab, setTab] = useState<Tab>("overview");
  const [openDealId, setOpenDealId] = useState<number | null>(null);
  const [openScooterId, setOpenScooterId] = useState<number | null>(null);
  const [wizard, setWizard] = useState<
    { open: false } | { open: true; dealId?: number | null; clientId?: number | null }
  >({ open: false });

  const { data } = useBuyoutDeals();
  const deals = useMemo(() => data?.items ?? [], [data]);
  const FLEET = useFleetScooters();
  const rentals = useRentals();

  // Переход из «Новой сделки» → сразу мастер (и когда мы уже в разделе).
  useEffect(() => {
    const p = consumePending("rassrochki");
    if (p?.newSale) setWizard({ open: true, clientId: p.clientId ?? null });
    // Переход из напоминания — сразу нужная сделка (01.09).
    if (p?.buyoutDealId != null) {
      setTab("deals");
      setOpenDealId(p.buyoutDealId);
    }
    return onNavigate((req) => {
      if (req.route !== "rassrochki") return;
      if (req.newSale) {
        consumePending("rassrochki");
        setWizard({ open: true, clientId: req.clientId ?? null });
      }
      if (req.buyoutDealId != null) {
        consumePending("rassrochki");
        setTab("deals");
        setOpenDealId(req.buyoutDealId);
      }
    });
  }, []);

  const active = deals.filter((d) => d.status === "active");
  const overdue = active.filter((d) => d.progress.overdueCount > 0);

  const openDeal = deals.find((d) => d.id === openDealId) ?? null;
  const openScooter = useMemo(() => {
    if (openScooterId == null) return null;
    const s = FLEET.find((x) => x.id === openScooterId);
    if (!s) return null;
    const hasRental = rentals.some(
      (r) =>
        r.scooter === s.name &&
        (r.status === "active" || r.status === "overdue" || r.status === "returning"),
    );
    const status: ScooterDisplayStatus =
      hasRental && s.baseStatus === "rental_pool" ? "rented" : s.baseStatus;
    return { scooter: s, status };
  }, [openScooterId, FLEET, rentals]);

  const drawer = openDeal ? "deal" : openScooter ? "scooter" : null;
  const isMobile = useIsMobile();

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      {/* На телефоне свой app-shell со своей шапкой — десктопная панель
          поверх него дублировала поиск и ломала строку (фидбэк 01.09). */}
      {!isMobile && <Topbar />}
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
          Выкуп
        </h1>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-[11.5px] font-bold text-blue-700">
          {active.length} активных
        </span>
        {overdue.length > 0 && (
          <button
            type="button"
            onClick={() => setTab("overdue")}
            className="rounded-full bg-red-soft px-3 py-1 text-[11.5px] font-bold text-red-ink"
          >
            {overdue.length} с просрочкой
          </button>
        )}
      </header>

      <div className="flex min-w-0 items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Когда открыта карточка, места мало: подписи неактивных вкладок
              скрываются, остаются иконки — и это плавно, а не «сжатием»
              текста. На телефоне те же подписи прячутся у неактивных, чтобы
              все четыре вкладки помещались без прокрутки (правка 01.09). */}
          <div className="flex w-fit max-w-full gap-1 rounded-full bg-surface p-1 shadow-card-sm">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                title={t.label}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full py-2 text-[13px] font-semibold transition-all duration-300",
                  tab === t.id ? "bg-ink px-4 text-white" : "px-3 text-muted hover:text-ink",
                )}
              >
                <t.icon size={14} className="shrink-0" />
                <span
                  className={cn(
                    "overflow-hidden whitespace-nowrap transition-all duration-300",
                    (drawer || isMobile) && tab !== t.id
                      ? "max-w-0 opacity-0"
                      : "max-w-[120px] opacity-100",
                  )}
                >
                  {t.label}
                </span>
                {t.id === "overdue" && overdue.length > 0 && (
                  <span className="shrink-0 rounded-full bg-red px-1.5 text-[10px] font-bold text-white">
                    {overdue.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === "overview" && <Overview deals={deals} onOpen={setOpenDealId} />}
          {tab === "deals" && (
            <DealsList deals={deals} onOpen={setOpenDealId} />
          )}
          {tab === "overdue" && (
            <OverdueList deals={overdue} onOpen={setOpenDealId} />
          )}
          {tab === "clients" && (
            <ClientsRating deals={deals} onOpen={setOpenDealId} />
          )}
        </div>

        {drawer && (
          <div className="drawer-slide-in sticky top-4 hidden h-[calc(100dvh-32px)] w-[480px] shrink-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-card lg:flex xl:w-[560px] 2xl:w-[620px]">
            {openDeal ? (
              <BuyoutDealCard
                deal={openDeal}
                onClose={() => setOpenDealId(null)}
                onContinue={(id) => {
                  setOpenDealId(null);
                  setWizard({ open: true, dealId: id });
                }}
                onOpenScooter={(id) => {
                  setOpenDealId(null);
                  setOpenScooterId(id);
                }}
              />
            ) : openScooter ? (
              <ScooterCard
                drawerChrome
                scooter={openScooter.scooter}
                status={openScooter.status}
                onBack={() => setOpenScooterId(null)}
              />
            ) : null}
          </div>
        )}
        {drawer && (
          <div className="fixed inset-0 z-[55] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-surface animate-slide-in-right lg:hidden">
            {openDeal ? (
              <BuyoutDealCard
                deal={openDeal}
                onClose={() => setOpenDealId(null)}
                onContinue={(id) => {
                  setOpenDealId(null);
                  setWizard({ open: true, dealId: id });
                }}
                onOpenScooter={(id) => {
                  setOpenDealId(null);
                  setOpenScooterId(id);
                }}
              />
            ) : openScooter ? (
              <ScooterCard
                drawerChrome
                scooter={openScooter.scooter}
                status={openScooter.status}
                onBack={() => setOpenScooterId(null)}
              />
            ) : null}
          </div>
        )}
      </div>

      {wizard.open && (
        <NewBuyoutWizard
          dealId={wizard.dealId ?? null}
          presetClientId={wizard.clientId ?? null}
          onClose={() => setWizard({ open: false })}
        />
      )}
    </main>
  );
}

/* ==================== ОБЗОР ==================== */

function Overview({
  deals,
  onOpen,
}: {
  deals: BuyoutDeal[];
  onOpen: (id: number) => void;
}) {
  const active = deals.filter((d) => d.status === "active");
  const closed = deals.filter((d) => d.status === "closed");
  const problem = active.filter((d) => d.progress.overdueCount > 0);
  const defaulted = deals.filter((d) => d.status === "defaulted");

  /**
   * Период (фидбэк 01.09: «это всё должно быть в привязке к календарю»).
   * Тот же календарь и то же скользящее окно, что в «Продажах», — иначе
   * в CRM было бы два разных способа выбрать один и тот же месяц.
   */
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [view, setView] = useState<ChartView>(() => viewForPreset("month"));
  const range = useMemo(() => rangeFromView(view), [view]);
  const paymentsQ = useAllBuyoutPayments();
  const payments = useMemo(
    () => paymentsQ.data?.items ?? [],
    [paymentsQ.data],
  );
  /** Платежи выбранного периода — из них считаются «Собрано» и график. */
  const inRange = useMemo(
    () =>
      payments.filter((x) => {
        const t = new Date(x.paidAt).getTime();
        return t >= range.from.getTime() && t <= range.to.getTime();
      }),
    [payments, range],
  );
  const chart = useMemo(
    () =>
      seriesOfEvents(
        inRange.map((x) => ({ at: x.paidAt, amount: x.amount })),
        range,
        view.bucket,
      ),
    [inRange, range, view.bucket],
  );

  const money = useMemo(() => {
    const portfolio = active.reduce((s, d) => s + d.progress.left, 0);
    const collected = inRange.reduce((s, x) => s + x.amount, 0);
    const overdue = problem.reduce((s, d) => s + d.progress.overdueAmount, 0);
    const markup = deals
      .filter((d) => d.status === "active" || d.status === "closed")
      .reduce((s, d) => s + d.markup, 0);
    return { portfolio, collected, overdue, markup };
  }, [deals, active, problem, inRange]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <StatRow>
        <StatTile
          label="Активных выкупов"
          value={String(active.length)}
          hint={`ещё ${fmtCompact(money.portfolio)} ₽`}
          icon={<HandCoins size={13} />}
        />
        <StatTile
          label="Собрано"
          value={fmtCompact(money.collected)}
          suffix="₽"
          hint={`взносы и платежи · ${range.label}`}
          icon={<CheckCircle2 size={13} />}
          accent
        />
        <StatTile
          label="Проблемных"
          value={String(problem.length)}
          hint={
            money.overdue > 0 ? `долг ${fmtCompact(money.overdue)} ₽` : "просрочек нет"
          }
          icon={<AlertTriangle size={13} />}
        />
        <StatTile
          label="Закрытых"
          value={String(closed.length)}
          hint={defaulted.length > 0 ? `сорвано ${defaulted.length}` : "дошли до конца"}
        />
        <StatTile
          label="Заработок"
          value={fmtCompact(money.markup)}
          suffix="₽"
          hint="наценка по рассрочке"
        />
      </StatRow>

      <SectionCard
        title="Динамика платежей"
        hint={range.label}
        action={
          <>
            <PeriodPicker
              preset={preset}
              custom={custom}
              onChange={(pr, c) => {
                setPreset(pr);
                setCustom(c);
                if (pr === "custom" && c.from && c.to) {
                  const from = new Date(`${c.from}T00:00:00`);
                  const to = new Date(`${c.to}T23:59:59`);
                  const b = bucketForRange(from, to);
                  const stepMs =
                    b === "hour"
                      ? 3_600_000
                      : b === "day"
                        ? 86_400_000
                        : b === "week"
                          ? 7 * 86_400_000
                          : b === "month"
                            ? 30 * 86_400_000
                            : 365 * 86_400_000;
                  setView({
                    bucket: b,
                    count: Math.max(
                      2,
                      Math.round((to.getTime() - from.getTime()) / stepMs) + 1,
                    ),
                    end: to,
                  });
                } else {
                  setView(viewForPreset(pr));
                }
              }}
            />
            {!isAtNow(view) && (
              <button
                type="button"
                onClick={() => {
                  setPreset("month");
                  setView(viewForPreset("month"));
                }}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                К сегодня
              </button>
            )}
          </>
        }
      >
        <div className="p-4 pt-2">
          <SalesChart
            points={chart}
            forecast={null}
            bucket={view.bucket}
            onZoom={(dir) => setView((v) => zoomView(v, dir))}
            onPan={(steps) => setView((v) => panView(v, steps))}
          />
        </div>
      </SectionCard>

      <div className="grid min-w-0 items-stretch gap-3 xl:grid-cols-2">
        <SectionCard title="Ближайшие платежи" hint="кого ждём в первую очередь">
          {active.length === 0 ? (
            <div className="px-4 py-7 text-center text-[13px] text-muted">
              Активных выкупов нет.
            </div>
          ) : (
            <div className="flex flex-col">
              {[...active]
                .filter((d) => d.progress.nextDue || d.progress.overdueCount > 0)
                .sort((a, b) => {
                  const ao = a.progress.overdueCount > 0 ? 0 : 1;
                  const bo = b.progress.overdueCount > 0 ? 0 : 1;
                  if (ao !== bo) return ao - bo;
                  return (
                    new Date(a.progress.nextDue?.date ?? "2999-01-01").getTime() -
                    new Date(b.progress.nextDue?.date ?? "2999-01-01").getTime()
                  );
                })
                .slice(0, 6)
                .map((d) => (
                  <DealRow key={d.id} deal={d} onOpen={() => onOpen(d.id)} compact />
                ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Погашение портфеля" hint="как идут активные сделки">
          {active.length === 0 ? (
            <div className="px-4 py-7 text-center text-[13px] text-muted">
              Пока нечего показывать.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 p-4">
              {active.slice(0, 6).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onOpen(d.id)}
                  className="flex flex-col gap-1 text-left"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 truncate text-[12.5px] font-semibold text-ink">
                      {d.clientName ?? "клиент"}
                    </span>
                    <span className="ml-auto text-[12px] font-bold tabular-nums text-ink">
                      {d.progress.percent}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-soft">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        d.progress.overdueCount > 0 ? "bg-red" : "bg-blue-600",
                      )}
                      style={{ width: `${d.progress.percent}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-muted-2">
                    осталось {fmt(d.progress.left)} ₽ ·{" "}
                    {d.progress.leftCount} платеж
                    {d.progress.leftCount === 1
                      ? ""
                      : d.progress.leftCount < 5
                        ? "а"
                        : "ей"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

/* ==================== СПИСОК ==================== */

function DealsList({
  deals,
  onOpen,
}: {
  deals: BuyoutDeal[];
  onOpen: (id: number) => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "closed" | "problem">("all");

  const list = deals.filter((d) => {
    if (status === "active" && d.status !== "active") return false;
    if (status === "closed" && d.status !== "closed") return false;
    if (status === "problem" && d.progress.overdueCount === 0) return false;
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return [
      String(d.id),
      d.clientName,
      d.clientPhone,
      d.vin,
      d.engineNo,
      d.modelName,
      d.scooterName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Клиент, телефон, VIN, номер сделки…"
            className="h-9 w-full rounded-full border border-border bg-surface pl-9 pr-8 text-[13px] outline-none focus:border-blue-600"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-2 hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="ml-auto flex gap-1 rounded-full bg-surface p-1 shadow-card-sm">
          {(
            [
              ["all", "Все"],
              ["active", "Выплачиваются"],
              ["problem", "С просрочкой"],
              ["closed", "Закрытые"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatus(id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                status === id ? "bg-ink text-white" : "text-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <SectionCard title="Выкупы" hint={`${list.length} сделок`}>
        {list.length === 0 ? (
          <EmptyState
            icon={<HandCoins size={22} />}
            title={q ? "Ничего не нашли" : "Выкупов пока нет"}
            text={
              q
                ? "Попробуйте другой запрос — ищем по клиенту, телефону, VIN и номеру сделки."
                : "Сделка оформляется по шагам: клиент → проверка по чёрным спискам → техника → условия → метка → договор."
            }
          />
        ) : (
          <div className="flex flex-col">
            {list.map((d) => (
              <DealRow key={d.id} deal={d} onOpen={() => onOpen(d.id)} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/** Строка сделки со шкалой погашения — главный элемент раздела. */
function DealRow({
  deal,
  onOpen,
  compact,
}: {
  deal: BuyoutDeal;
  onOpen: () => void;
  compact?: boolean;
}) {
  const p = deal.progress;
  const late = p.overdueCount > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-1.5 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-soft/60"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-[11px] font-bold text-muted-2">
          #{String(deal.id).padStart(4, "0")}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink">
          {deal.clientName ?? "клиент не указан"}
        </span>
        {!compact && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold",
              BUYOUT_STATUS_CLASS[deal.status],
            )}
          >
            {BUYOUT_STATUS_LABEL[deal.status]}
          </span>
        )}
        {late && (
          <span className="shrink-0 rounded-full bg-red-soft px-2 py-0.5 text-[10.5px] font-bold text-red-ink">
            просрочка {p.overdueDays} дн
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-soft">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              deal.status === "closed"
                ? "bg-emerald-500"
                : late
                  ? "bg-red"
                  : "bg-blue-600",
            )}
            style={{ width: `${p.percent}%` }}
          />
        </div>
        <span className="shrink-0 text-[12px] font-bold tabular-nums text-ink">
          {p.percent}%
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-muted-2">
        <span>{deal.modelName || deal.scooterName || "техника"}</span>
        <span>
          осталось <b className="text-ink-2">{fmt(p.left)} ₽</b>
        </span>
        <span>
          {p.paidCount} из {deal.schedule.length || deal.paymentsCount} платежей
        </span>
        {p.nextDue && !late && <span>следующий {ruDateShort(p.nextDue.date)}</span>}
        {late && (
          <span className="font-semibold text-red-ink">
            просрочено {fmt(p.overdueAmount)} ₽
          </span>
        )}
      </div>
    </button>
  );
}

/* ==================== ПРОСРОЧКИ ==================== */

function OverdueList({
  deals,
  onOpen,
}: {
  deals: BuyoutDeal[];
  onOpen: (id: number) => void;
}) {
  const sorted = [...deals].sort(
    (a, b) => b.progress.overdueDays - a.progress.overdueDays,
  );
  const total = sorted.reduce((s, d) => s + d.progress.overdueAmount, 0);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Сделок с просрочкой"
          value={String(sorted.length)}
          icon={<AlertTriangle size={13} />}
        />
        <StatTile label="Просрочено" value={fmtCompact(total)} suffix="₽" accent />
        <StatTile
          label="Самая старая"
          value={String(sorted[0]?.progress.overdueDays ?? 0)}
          suffix="дн"
          hint={sorted[0]?.clientName ?? "—"}
        />
      </div>

      <SectionCard title="Кто не платит" hint="сверху — самые давние">
        {sorted.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={22} />}
            title="Просрочек нет"
            text="Все активные выкупы идут по графику. Здесь появятся сделки, по которым платёж не пришёл в срок."
          />
        ) : (
          <div className="flex flex-col">
            {sorted.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onOpen(d.id)}
                className="flex items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-soft/60"
              >
                <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-red-soft text-red-ink">
                  <span className="text-[14px] font-extrabold leading-none">
                    {d.progress.overdueDays}
                  </span>
                  <span className="text-[9px] font-semibold">дн</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-ink">
                    {d.clientName ?? "клиент"}
                    {d.clientPhone && (
                      <span className="ml-2 text-[11.5px] font-normal text-muted">
                        {d.clientPhone}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-2">
                    {d.modelName || d.scooterName || "техника"} · выкуп #
                    {String(d.id).padStart(4, "0")} · закрыто {d.progress.percent}%
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[14px] font-bold tabular-nums text-red-ink">
                    {fmt(d.progress.overdueAmount)} ₽
                  </span>
                  <span className="block text-[11px] text-muted-2">
                    {d.progress.overdueCount} платеж
                    {d.progress.overdueCount === 1
                      ? ""
                      : d.progress.overdueCount < 5
                        ? "а"
                        : "ей"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ==================== РЕЙТИНГ КЛИЕНТОВ ==================== */

function ClientsRating({
  deals,
  onOpen,
}: {
  deals: BuyoutDeal[];
  onOpen: (id: number) => void;
}) {
  /**
   * Дисциплину считаем по графику: платёж закрыт вовремя или с опозданием.
   * Клиент с одной сделкой и без просрочек не должен обгонять того, кто
   * выплатил три выкупа, поэтому учитываем и объём.
   */
  const rows = useMemo(() => {
    const byClient = new Map<
      number,
      {
        name: string;
        phone: string | null;
        deals: BuyoutDeal[];
        onTime: number;
        late: number;
        lateDays: number;
        paid: number;
      }
    >();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const d of deals) {
      if (d.clientId == null) continue;
      const cur =
        byClient.get(d.clientId) ??
        {
          name: d.clientName ?? "Клиент",
          phone: d.clientPhone,
          deals: [],
          onTime: 0,
          late: 0,
          lateDays: 0,
          paid: 0,
        };
      cur.deals.push(d);
      cur.paid += d.progress.paid + d.downPayment;
      for (const r of d.schedule) {
        const due = new Date(`${r.dueDate}T23:59:59`);
        if (r.paidAmount >= r.amount) {
          const paidAt = r.paidAt ? new Date(r.paidAt) : null;
          if (paidAt && paidAt.getTime() > due.getTime()) {
            cur.late++;
            cur.lateDays += Math.round(
              (paidAt.getTime() - due.getTime()) / 86_400_000,
            );
          } else cur.onTime++;
        } else if (due.getTime() < today.getTime()) {
          cur.late++;
          cur.lateDays += Math.round(
            (today.getTime() - due.getTime()) / 86_400_000,
          );
        }
      }
      byClient.set(d.clientId, cur);
    }
    return [...byClient.entries()]
      .map(([id, c]) => {
        const total = c.onTime + c.late;
        const score =
          total === 0
            ? 100
            : Math.max(
                0,
                Math.round(
                  (c.onTime / total) * 100 -
                    Math.min(30, (c.lateDays / total) * 2),
                ),
              );
        return { clientId: id, ...c, total, score };
      })
      .sort((a, b) => b.score - a.score || b.paid - a.paid);
  }, [deals]);

  const good = rows.filter((r) => r.score >= 85);
  const bad = rows.filter((r) => r.score < 60);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-3">
        <StatTile label="Клиентов в выкупе" value={String(rows.length)} />
        <StatTile
          label="Платят вовремя"
          value={String(good.length)}
          hint="оценка 85 и выше"
          accent
        />
        <StatTile
          label="Нарушители"
          value={String(bad.length)}
          hint="оценка ниже 60"
        />
      </div>

      <SectionCard
        title="Платёжная дисциплина"
        hint="оценка по графику: вовремя / с опозданием"
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<Star size={22} />}
            title="Пока некого оценивать"
            text="Рейтинг появится, когда по выкупам пройдут первые платежи."
          />
        ) : (
          <div className="flex flex-col">
            {rows.map((r) => (
              <div
                key={r.clientId}
                className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0"
              >
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[14px] font-extrabold",
                    r.score >= 85
                      ? "bg-emerald-100 text-emerald-700"
                      : r.score >= 60
                        ? "bg-orange-soft text-orange-ink"
                        : "bg-red-soft text-red-ink",
                  )}
                >
                  {r.score}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-ink">
                    {r.name}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-2">
                    {r.deals.length} сделк
                    {r.deals.length === 1 ? "а" : r.deals.length < 5 ? "и" : "ок"} ·
                    вовремя {r.onTime}, с опозданием {r.late}
                    {r.late > 0 && ` (в среднем ${Math.round(r.lateDays / r.late)} дн)`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[13px] font-bold tabular-nums text-ink">
                    {fmt(r.paid)} ₽
                  </span>
                  <span className="block text-[11px] text-muted-2">внесено</span>
                </span>
                <button
                  type="button"
                  onClick={() => onOpen(r.deals[0]!.id)}
                  className="shrink-0 rounded-full bg-surface-soft px-3 py-1.5 text-[11.5px] font-semibold text-muted hover:text-ink"
                >
                  Сделки
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

