import { useMemo, useState } from "react";
import {
  BadgePercent,
  Banknote,
  Package,
  RotateCcw,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/api/auth";
import { toast } from "@/lib/toast";
import {
  useSaleDeals,
  useSaleManagers,
  useSalePlans,
  useSetSalePlan,
  type SaleDeal,
} from "@/lib/api/sales";
import { useApiScooters } from "@/lib/api/scooters";
import {
  ManagerAvatar,
  PeriodPicker,
  PlanBar,
  SectionCard,
  StatTile,
} from "./SalesUI";
import { SalesChart } from "./SalesChart";
import {
  BUCKET_AXIS,
  deltaPct,
  isAtNow,
  panView,
  rangeFromView,
  viewForPreset,
  zoomView,
  type ChartView,
  fmt,
  fmtCompact,
  managerRating,
  modelRating,
  previousRange,
  series,
  soldIn,
  totals,
  type Bucket,
  type PeriodPreset,
  type Range,
} from "./salesUtils";

/**
 * Главный экран блока «Продажи» (31.08).
 *
 * Отвечает на четыре вопроса директора: сколько техники стоит в продаже,
 * сколько продали и заработали за период, как идём к плану, куда движется
 * динамика — и кто из менеджеров и какие модели тянут результат.
 */

/** Масштаб для произвольного диапазона из календаря — по его длине. */
function bucketForRange(from: Date, to: Date): Bucket {
  const days = Math.max(1, (to.getTime() - from.getTime()) / 86_400_000);
  if (days <= 2) return "hour";
  if (days <= 60) return "day";
  if (days <= 400) return "month";
  return "year";
}

export function SalesOverview({
  onOpenStock,
  onOpenDeal,
}: {
  onOpenStock: () => void;
  onOpenDeal: (id: number) => void;
}) {
  const { data: dealsData } = useSaleDeals();
  const { data: managersData } = useSaleManagers();
  const { data: plansData } = useSalePlans();
  const { data: scooters = [] } = useApiScooters();
  const { data: me } = useMe();
  const isDirector = me?.role === "director" || me?.role === "creator";

  const deals = dealsData?.items ?? [];
  const managers = managersData?.items ?? [];

  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [managerId, setManagerId] = useState<number | null>(null);
  const [planOpen, setPlanOpen] = useState(false);

  /**
   * Окно графика: скользящее, правый край — «сейчас» (правка 31.08).
   * Колесо над графиком меняет масштаб, перетаскивание двигает во времени;
   * пресеты сверху просто задают стартовое окно.
   */
  const [view, setView] = useState<ChartView>(() => viewForPreset("month"));
  const range: Range = useMemo(() => rangeFromView(view), [view]);
  const bucket = view.bucket;

  const sold = useMemo(() => soldIn(deals, range, managerId), [deals, range, managerId]);
  const prev = useMemo(
    () => soldIn(deals, previousRange(range), managerId),
    [deals, range, managerId],
  );
  const now = totals(sold);
  const before = totals(prev);

  // Техника, стоящая в продаже (не зависит от периода).
  const stock = useMemo(() => {
    const list = scooters.filter((s) => s.baseStatus === "for_sale" && !s.archivedAt);
    const price = list.reduce((s, x) => s + (x.salePrice ?? 0), 0);
    const cost = list.reduce((s, x) => s + (x.purchasePrice ?? 0), 0);
    return { units: list.length, price, expectedProfit: price - cost };
  }, [scooters]);

  /** Левая стенка графика: раньше первой продажи смотреть не на что. */
  const earliestSale = useMemo(() => {
    const dates = deals
      .filter((d) => d.status === "signed" && d.soldAt)
      .map((d) => new Date(d.soldAt!).getTime());
    return dates.length ? new Date(Math.min(...dates)) : null;
  }, [deals]);

  const dyn = useMemo(() => series(sold, range, bucket), [sold, range, bucket]);

  const mRating = useMemo(() => managerRating(sold, managers), [sold, managers]);
  const modRating = useMemo(() => modelRating(sold), [sold]);
  const maxModelUnits = Math.max(1, ...modRating.map((m) => m.units));
  const maxManagerRevenue = Math.max(1, ...mRating.map((m) => m.revenue));

  // План берём на месяц, в котором заканчивается период.
  const planPeriod = `${range.to.getFullYear()}-${String(range.to.getMonth() + 1).padStart(2, "0")}`;
  const plan = (plansData?.items ?? []).find((p) => p.period.slice(0, 7) === planPeriod);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker
          preset={preset}
          custom={custom}
          onChange={(p, c) => {
            setPreset(p);
            setCustom(c);
            if (p === "custom" && c.from && c.to) {
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
                count: Math.max(2, Math.round((to.getTime() - from.getTime()) / stepMs) + 1),
                end: to,
              });
            } else {
              setView(viewForPreset(p));
            }
          }}
        />
        <div className="flex-1" />
        {managers.length > 0 && (
          <div className="flex max-w-full flex-wrap items-center gap-1 rounded-full bg-surface p-1 shadow-card-sm">
            <button
              type="button"
              onClick={() => setManagerId(null)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                managerId == null ? "bg-ink text-white" : "text-muted hover:text-ink",
              )}
            >
              Все менеджеры
            </button>
            {managers.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setManagerId(managerId === m.id ? null : m.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[12.5px] font-semibold transition-colors",
                  managerId === m.id ? "bg-ink text-white" : "text-muted hover:text-ink",
                )}
              >
                <ManagerAvatar name={m.name} color={m.avatarColor} size={22} />
                {m.name.split(" ")[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Показатели */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <button type="button" onClick={onOpenStock} className="text-left">
          <StatTile
            label="В продаже"
            value={fmt(stock.units)}
            suffix="ед."
            hint={
              stock.units
                ? `сейчас на ${fmtCompact(stock.price)} ₽`
                : "техники в продаже нет"
            }
            icon={<Package size={13} />}
          />
        </button>
        <StatTile
          label="Продано"
          value={fmt(now.units)}
          suffix="ед."
          delta={deltaPct(now.units, before.units)}
          hint={`средний чек ${fmtCompact(now.avgCheck)} ₽`}
          icon={<Trophy size={13} />}
        />
        <StatTile
          label="Выручка"
          value={fmtCompact(now.revenue)}
          suffix="₽"
          delta={deltaPct(now.revenue, before.revenue)}
          hint={`было ${fmtCompact(before.revenue)} ₽`}
          icon={<Banknote size={13} />}
          accent
        />
        <StatTile
          label="Прибыль"
          value={fmtCompact(now.profit)}
          suffix="₽"
          delta={deltaPct(now.profit, before.profit)}
          hint={
            now.commission
              ? `менеджерам ${fmtCompact(now.commission)} ₽`
              : "закуп вычтен"
          }
          icon={<TrendingUp size={13} />}
        />
        <StatTile
          label="Маржинальность"
          value={String(now.marginPct)}
          suffix="%"
          delta={deltaPct(now.marginPct, before.marginPct)}
          hint={`было ${before.marginPct}%`}
          icon={<BadgePercent size={13} />}
        />
      </div>

      <div className="grid min-w-0 items-stretch gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* Динамика */}
        <SectionCard
          title="Динамика продаж"
          hint={range.label}
          action={
            <>
              {!isAtNow(view) && (
                <button
                  type="button"
                  onClick={() => {
                    setPreset("month");
                    setView(viewForPreset("month"));
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <RotateCcw size={11} /> К сегодняшнему дню
                </button>
              )}
              <span className="rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-semibold text-muted-2">
                {BUCKET_AXIS[bucket]}
              </span>
            </>
          }
        >
          <div className="flex flex-1 flex-col justify-center p-4">
            {/* График рисуем всегда — даже когда продаж нет: пустая сетка
                честнее, чем текст вместо графика, и из неё видно, куда
                уехало окно (фидбэк 31.08). */}
            {now.units === 0 && (
              <div className="mb-2 text-center text-[12.5px] text-muted-2">
                За это окно продаж не было
                {earliestSale
                  ? ` — первая продажа ${earliestSale.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`
                  : ""}
              </div>
            )}
            {(
              <SalesChart
                points={dyn.points}
                forecast={dyn.forecast}
                bucket={bucket}
                onZoom={(dir) => {
                  setPreset("custom");
                  setView((v) => zoomView(v, dir));
                }}
                onPan={(steps) => {
                  setPreset("custom");
                  setView((v) => panView(v, steps, new Date(), earliestSale));
                }}
              />
            )}
          </div>
        </SectionCard>

        {/* План */}
        <SectionCard
          title="План продаж"
          hint={range.to.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
          action={
            isDirector && (
              <button
                type="button"
                onClick={() => setPlanOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11.5px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                <Target size={12} /> {plan ? "Изменить" : "Задать план"}
              </button>
            )
          }
        >
          <div className="flex flex-1 flex-col justify-between gap-3 p-4">
            <PlanBar label="Единиц" fact={now.units} plan={plan?.units ?? 0} unit="ед." />
            <PlanBar label="Выручка" fact={now.revenue} plan={plan?.revenue ?? 0} unit="₽" />
            <PlanBar label="Прибыль" fact={now.profit} plan={plan?.profit ?? 0} unit="₽" />
            <PlanBar
              label="Маржинальность"
              fact={now.marginPct}
              plan={plan?.marginPct ?? 0}
              unit="%"
            />
            {!plan && !isDirector && (
              <div className="text-[12px] text-muted-2">
                План на месяц задаёт директор.
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid min-w-0 items-stretch gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        {/* Рейтинг менеджеров */}
        <SectionCard
          title="Рейтинг менеджеров"
          hint={`${range.label} · кто сколько продал`}
        >
          {mRating.length === 0 ? (
            <div className="px-4 py-7 text-center text-[13px] text-muted">
              За период продаж не было.
            </div>
          ) : (
            /* Списком, а не таблицей: в узкой колонке семь столбцов
               обрезались по краю и половина цифр была не видна. */
            <div className="flex flex-col gap-2 p-3">
              {mRating.map((row, i) => {
                const share =
                  maxManagerRevenue > 0 ? (row.revenue / maxManagerRevenue) * 100 : 0;
                return (
                  <div
                    key={row.managerId ?? "none"}
                    className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-surface-soft/60 p-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-3 shrink-0 text-[11px] font-bold text-muted-2">
                        {i + 1}
                      </span>
                      <ManagerAvatar name={row.name} color={row.color} size={26} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                        {row.name}
                      </span>
                      <span className="shrink-0 text-[13px] font-bold tabular-nums text-ink">
                        {fmt(row.revenue)} ₽
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-2">
                      <span>
                        продано <b className="text-ink-2">{row.units}</b>
                      </span>
                      <span>
                        прибыль{" "}
                        <b className="text-emerald-700">{fmt(row.profit)} ₽</b>
                      </span>
                      <span>ср. чек {fmt(row.avgCheck)} ₽</span>
                      {row.commission > 0 && (
                        <span>
                          ему {fmt(row.commission)} ₽
                          {row.manager ? ` (${row.manager.commissionPct}%)` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Рейтинг моделей */}
        <SectionCard title="Рейтинг моделей" hint="что продаётся чаще">
          {modRating.length === 0 ? (
            <div className="px-4 py-7 text-center text-[13px] text-muted">
              За период продаж не было.
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-4">
              {modRating.map((m) => (
                <div key={m.name} className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 truncate text-[13px] font-semibold text-ink">
                      {m.name}
                    </span>
                    <span className="ml-auto text-[13px] font-bold tabular-nums text-ink">
                      {m.units} ед.
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-soft">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${(m.units / maxModelUnits) * 100}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-muted-2">
                    {fmt(m.revenue)} ₽ выручки · прибыль {fmt(m.profit)} ₽ · средний чек{" "}
                    {fmt(m.avgCheck)} ₽
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Последние сделки — третьей карточкой в том же ряду, чтобы не
            занимать отдельную широкую строку ради пары записей. */}
        {sold.length > 0 && (
          <SectionCard
            title="Последние продажи"
            hint={`${sold.length} за период · сверху свежие`}
            className="xl:col-span-2 2xl:col-span-1"
          >
            {/* Лентой сверху вниз: свежая продажа первая, у каждой дата и
                время. Сеткой в две колонки хронология не читалась вовсе. */}
            <div className="flex flex-col">
              {[...sold]
                .sort(
                  (a, b) =>
                    new Date(b.soldAt ?? b.createdAt).getTime() -
                    new Date(a.soldAt ?? a.createdAt).getTime(),
                )
                .slice(0, 6)
                .map((d, i) => (
                  <RecentRow
                    key={d.id}
                    deal={d}
                    latest={i === 0}
                    onOpen={() => onOpenDeal(d.id)}
                  />
                ))}
            </div>
          </SectionCard>
        )}
      </div>

      {planOpen && (
        <PlanDialog
          period={planPeriod}
          initial={plan ?? null}
          onClose={() => setPlanOpen(false)}
        />
      )}
    </div>
  );
}

function RecentRow({
  deal,
  latest,
  onOpen,
}: {
  deal: SaleDeal;
  /** Самая свежая продажа периода — помечаем, чтобы не искать глазами. */
  latest?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-start gap-3 border-b border-border/60 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-soft/60"
    >
      {/* Колонка времени — по ней и читается хронология. */}
      <span className="w-[86px] shrink-0 pt-0.5">
        <span className="block text-[11.5px] font-semibold tabular-nums text-ink-2">
          {saleWhen(deal.soldAt ?? deal.createdAt)}
        </span>
        {latest && (
          <span className="mt-0.5 inline-block rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-emerald-700">
            последняя
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">
          {deal.modelName || deal.scooterName || "Техника"}
          {deal.vin && (
            <span className="ml-1.5 font-mono text-[11px] font-normal text-muted-2">
              {deal.vin}
            </span>
          )}
        </span>
        <span className="block truncate text-[11.5px] text-muted">
          {deal.clientName ?? "клиент не указан"}
          {deal.managerName && ` · ${deal.managerName}`}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[13px] font-bold tabular-nums text-ink">
          {fmt(deal.price)} ₽
        </span>
        <span className="block text-[11px] tabular-nums text-emerald-700">
          +{fmt(deal.price - (deal.purchasePrice ?? 0))} ₽
        </span>
      </span>
    </button>
  );
}

/** «сегодня 14:20» / «вчера 09:05» / «28 авг 17:40». */
function saleWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff === 0) return `сегодня ${time}`;
  if (diff === 1) return `вчера ${time}`;
  return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} ${time}`;
}

/** Диалог «Задать план» — четыре числа на месяц. */
function PlanDialog({
  period,
  initial,
  onClose,
}: {
  period: string;
  initial: { units: number; revenue: number; profit: number; marginPct: number } | null;
  onClose: () => void;
}) {
  const setPlan = useSetSalePlan();
  const [units, setUnits] = useState(String(initial?.units ?? ""));
  const [revenue, setRevenue] = useState(String(initial?.revenue ?? ""));
  const [profit, setProfit] = useState(String(initial?.profit ?? ""));
  const [margin, setMargin] = useState(String(initial?.marginPct ?? ""));
  const [month, setMonth] = useState(period);

  const save = async () => {
    try {
      await setPlan.mutateAsync({
        period: month,
        units: Number(units) || 0,
        revenue: Number(revenue) || 0,
        profit: Number(profit) || 0,
        marginPct: Number(margin) || 0,
      });
      toast.success("План сохранён");
      onClose();
    } catch {
      toast.error("Не удалось сохранить план");
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 animate-backdrop-in">
      <div className="w-full max-w-[440px] rounded-2xl bg-surface p-5 shadow-card-lg animate-modal-in">
        <div className="text-[16px] font-bold text-ink">План продаж</div>
        <div className="mt-1 text-[12.5px] text-muted">
          Ставится на месяц. Факт сравнивается с планом на главном экране.
        </div>
        <label className="mt-4 flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
            Месяц
          </span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 rounded-[12px] border border-border bg-surface px-3 text-[14px] tabular-nums outline-none focus:border-emerald-500"
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <PlanField label="Единиц" value={units} onChange={setUnits} suffix="ед." />
          <PlanField label="Выручка" value={revenue} onChange={setRevenue} suffix="₽" />
          <PlanField label="Прибыль" value={profit} onChange={setProfit} suffix="₽" />
          <PlanField label="Маржа" value={margin} onChange={setMargin} suffix="%" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-[13px] font-semibold text-muted hover:text-ink"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={save}
            disabled={setPlan.isPending}
            className="rounded-full bg-emerald-600 px-5 py-2 text-[13px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <span className="relative">
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="0"
          className="h-10 w-full rounded-[12px] border border-border bg-surface pl-3 pr-9 text-[14px] font-semibold tabular-nums outline-none focus:border-emerald-500"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-2">
          {suffix}
        </span>
      </span>
    </label>
  );
}

