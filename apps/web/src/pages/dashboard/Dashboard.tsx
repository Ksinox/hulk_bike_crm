import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { navigate } from "@/app/navigationStore";
import { Topbar } from "./Topbar";
import { Greeting } from "./Greeting";
import { KpiCard } from "./KpiCard";
import { ParkPanel } from "./ParkPanel";
import { RevenueCard } from "./RevenueCard";
import { ReturnsList } from "./ReturnsList";
import { DebtsToCollect } from "./DebtsToCollect";
import { RemindersCard } from "./RemindersCard";
import { ParkLoadGauge } from "./ParkLoadGauge";
import { ActivityFeed } from "./ActivityFeed";
import { DuplicateRentalsBanner } from "./DuplicateRentalsBanner";
import { useDashboardDrawer } from "./DashboardDrawer";
import {
  formatRub,
  useDashboardMetrics,
  type DashboardMetrics,
} from "./useDashboardMetrics";

export function Dashboard() {
  const metrics = useDashboardMetrics();

  return (
    // v0.4.8: DrawerProvider поднят в App.tsx, теперь стек работает на
    // любых страницах (Клиенты, Аренды, Парк, Ремонты, etc) — связь
    // прослеживается одинаково везде.
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />
      <Greeting metrics={metrics} />
      <DuplicateRentalsBanner metrics={metrics} />
      {/* «Классика» убрана (01.09): пользовались только парком. */}
      <ParkVariant metrics={metrics} />
    </main>
  );
}

function ParkVariant({ metrics }: { metrics: DashboardMetrics }) {
  const drawer = useDashboardDrawer();
  // Правки 2.0, п.4: верхний ряд — 3 карточки, а с чипсом электро — 4,
  // чтобы «Просрочено» не переносилось на вторую строку.
  const hasElectroGauge =
    metrics.rentableElectro > 0 || metrics.activeElectroCount > 0;

  /**
   * Тесная раскладка (фидбэк 01.09). Когда справа открыта карточка
   * быстрого просмотра, плитки занимали половину экрана — «человек и так
   * видит эти цифры». Ужимаем их вдвое и ставим попарно: слева две
   * загрузки и две денежные плитки, а освободившуюся половину отдаём
   * «Выручке» — графику и списку платежей за месяц.
   *
   * Порог меряем по КОНТЕЙНЕРУ, а не по окну: окно широкое, а места мало.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [tight, setTight] = useState(false);
  /**
   * Высоты левых рядов (фидбэк 01.09): «синий блок выручки должен быть
   * такой же высоты, как верхние два чипса, а платежи за месяц — как
   * нижние два». Меряем ряды и отдаём эти числа карточке выручки.
   */
  const gaugesRowRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = useState<{ gauges: number; total: number } | null>(null);
  useEffect(() => {
    if (!compact || tight) {
      setRowH(null);
      return;
    }
    const g = gaugesRowRef.current;
    const c = leftColRef.current;
    if (!g || !c) return;
    const measure = () => {
      setRowH({
        gauges: Math.round(g.getBoundingClientRect().height),
        total: Math.round(c.getBoundingClientRect().height),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(g);
    ro.observe(c);
    return () => ro.disconnect();
  }, [compact, tight]);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const w = entry.contentRect.width;
      setCompact(w < 900);
      // Совсем узко (окно ~1024 с открытой карточкой): делить пополам
      // уже нечего — плитки и выручка встают друг под другом.
      setTight(w < 620);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const topSpan = hasElectroGauge
    ? "@[900px]:col-span-3"
    : "@[900px]:col-span-4";

  const gaugePetrol = (
    <ParkLoadGauge
      compact={compact}
      percent={metrics.loadPercent}
      active={metrics.activePetrolCount}
      rentable={metrics.rentableFleet}
      onClick={
        metrics.activePetrolCount > 0
          ? () => drawer.openRentalsList("active")
          : undefined
      }
    />
  );

  const gaugeElectro = hasElectroGauge ? (
    <ParkLoadGauge
      compact={compact}
      title="Электротранспорт"
      tone="electro"
      percent={metrics.loadPercentElectro}
      active={metrics.activeElectroCount}
      rentable={metrics.rentableElectro}
      onClick={() => navigate({ route: "partners" })}
    />
  ) : null;

  const kpiIncoming = (
    <KpiCard
      blue
      compact={compact}
      title="Поступит сегодня"
      value={metrics.todayIncoming > 0 ? `+${formatRub(metrics.todayIncoming)}` : "0"}
      unit="₽"
      // v0.4.15: клик → drawer со списком возвращающих сегодня.
      onClick={
        metrics.todayIncomingCount > 0
          ? () => drawer.openRentalsList("returnsToday")
          : undefined
      }
      delta={
        metrics.todayIncomingDelta != null
          ? {
              tone: metrics.todayIncomingDelta >= 0 ? "up" : "down",
              label: `${metrics.todayIncomingDelta >= 0 ? "+" : ""}${metrics.todayIncomingDelta}%`,
            }
          : undefined
      }
      foot={
        <span>
          {metrics.todayIncomingCount > 0
            ? `${metrics.todayIncomingCount} ${plural(metrics.todayIncomingCount, ["возврат — продление?", "возврата — продления?", "возвратов — продления?"])}`
            : "сегодня никто не возвращает"}
        </span>
      }
    />
  );

  const kpiOverdue = (
    <KpiCard
      compact={compact}
      title="Просрочено"
      value={String(metrics.overdueCount)}
      unit={metrics.overdueCount > 0 ? "шт" : undefined}
      valueTone={metrics.overdueCount > 0 ? "red" : undefined}
      onClick={
        metrics.overdueCount > 0
          ? () => drawer.openRentalsList("overdue")
          : undefined
      }
      delta={
        metrics.overdueDeltaFromYesterday > 0
          ? { tone: "down", label: `+${metrics.overdueDeltaFromYesterday}` }
          : undefined
      }
      foot={
        metrics.overdueCount > 0 ? (
          // v0.4.17: сумма долга в footer — крупнее обычного и красным,
          // чтоб была заметна.
          <span
            className={cn(
              "font-bold text-red",
              compact ? "text-[11px]" : "text-[14px]",
            )}
          >
            {formatRub(metrics.overdueSum)} ₽ долг
          </span>
        ) : (
          <span>нет просрочек</span>
        )
      }
    />
  );

  return (
    <div
      ref={rootRef}
      className="@container grid auto-rows-[minmax(120px,auto)] grid-cols-12 gap-4"
    >
      {compact ? (
        // Тесно: слева пары мини-плиток, справа выручка с платежами.
        <div
          className={cn(
            "col-span-12 grid items-start gap-4",
            tight ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          <div ref={leftColRef} className="flex min-w-0 flex-col gap-3">
            <div ref={gaugesRowRef} className="grid grid-cols-2 gap-3 [&>div]:h-full">
              {gaugePetrol}
              {gaugeElectro}
            </div>
            <div className="grid grid-cols-2 gap-3 [&>div]:h-full">
              {kpiIncoming}
              {kpiOverdue}
            </div>
          </div>
          <div
            className="min-w-0"
            style={rowH ? { height: rowH.total } : undefined}
          >
            <RevenueCard
              metrics={metrics}
              compact
              blueHeight={rowH?.gauges}
              className="h-full"
            />
          </div>
        </div>
      ) : (
        <>
          {/* #дашборд: круговая загрузка парка — первой картой (вместо
              «Новых заявок», которые остаются в разделе «Заявки»).
              Пункт 19: плитка «Активных аренд» убрана — дублировала
              кольцо «Загрузка парка». */}
          <div className={cn("col-span-6", topSpan, "[&>div]:h-full")}>
            {gaugePetrol}
          </div>
          {/* Второй чипс — партнёрский электротранспорт. */}
          {gaugeElectro && (
            <div className={cn("col-span-6", topSpan, "[&>div]:h-full")}>
              {gaugeElectro}
            </div>
          )}
          <div className={cn("col-span-6", topSpan, "[&>div]:h-full")}>
            {kpiIncoming}
          </div>
          <div className={cn("col-span-6", topSpan, "[&>div]:h-full")}>
            {kpiOverdue}
          </div>
        </>
      )}

      {/* Главная двухколоночная зона — левая и правая колонки независимы
          по высоте. Если RevenueCard справа разворачивается со списком
          аренд — ParkPanel слева остаётся той же высоты, не растягивается.
          items-start гарантирует что флексы не растягиваются друг под друга. */}
      <div className="col-span-12 grid auto-rows-[minmax(120px,max-content)] grid-cols-12 items-start gap-4">
        <div className="col-span-12 @[980px]:col-span-8 flex flex-col gap-4">
          {/* #дашборд: «Долги к сбору» подняты НАД парком — горящие деньги
              первыми, парк (на 100+ скутеров разрастается) ниже. */}
          {/* Напоминания над долгами: сначала «кому позвонить прямо
              сейчас», потом уже суммы к сбору (01.09). */}
          <RemindersCard />
          <DebtsToCollect
            overdue={metrics.overdue}
            debtors={metrics.debtorsNoRental}
            onOpenRental={(id) => drawer.openRental(id)}
            onOpenClient={(id) => drawer.openClient(id)}
          />
          <ParkPanel
            metrics={metrics}
            onOpenRental={(id) => drawer.openRental(id)}
          />
          <ActivityFeed />
        </div>
        <div className="col-span-12 @[980px]:col-span-4 flex flex-col gap-4">
          {/* В тесной раскладке «Выручка» уже стоит наверху. */}
          {!compact && <RevenueCard metrics={metrics} />}
          <ReturnsList
            items={metrics.returnsToday}
            onOpenRental={(id) => drawer.openRental(id)}
          />
        </div>
      </div>
    </div>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
