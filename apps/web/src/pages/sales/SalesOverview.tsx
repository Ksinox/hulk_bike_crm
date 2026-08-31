import { useMemo, useState } from "react";
import {
  BadgePercent,
  Banknote,
  Package,
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
import {
  deltaPct,
  fmt,
  fmtCompact,
  managerRating,
  modelRating,
  presetRange,
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

const BUCKETS: { id: Bucket; label: string }[] = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "year", label: "Год" },
];

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
  const [bucket, setBucket] = useState<Bucket>("day");
  const [planOpen, setPlanOpen] = useState(false);

  const range: Range = useMemo(() => {
    if (preset === "custom" && custom.from && custom.to) {
      const from = new Date(`${custom.from}T00:00:00`);
      const to = new Date(`${custom.to}T23:59:59`);
      return { from, to, label: `${custom.from} — ${custom.to}` };
    }
    return presetRange(preset === "custom" ? "month" : preset);
  }, [preset, custom]);

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

  const dyn = useMemo(() => series(sold, range, bucket), [sold, range, bucket]);
  const chart = dyn.forecast ? [...dyn.points, dyn.forecast] : dyn.points;
  const maxRevenue = Math.max(1, ...chart.map((p) => p.revenue));

  const mRating = useMemo(() => managerRating(sold, managers), [sold, managers]);
  const modRating = useMemo(() => modelRating(sold), [sold]);
  const maxModelUnits = Math.max(1, ...modRating.map((m) => m.units));

  // План берём на месяц, в котором заканчивается период.
  const planPeriod = `${range.to.getFullYear()}-${String(range.to.getMonth() + 1).padStart(2, "0")}`;
  const plan = (plansData?.items ?? []).find((p) => p.period.slice(0, 7) === planPeriod);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker
          preset={preset}
          custom={custom}
          onChange={(p, c) => {
            setPreset(p);
            setCustom(c);
            // Крупный период — крупный разрез, иначе 300 столбиков по дням.
            if (p === "year") setBucket("month");
            else if (p === "today") setBucket("day");
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
                ? `на ${fmtCompact(stock.price)} ₽ · прибыль ~${fmtCompact(stock.expectedProfit)} ₽`
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

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[1.6fr_1fr]">
        {/* Динамика */}
        <SectionCard
          title="Динамика продаж"
          hint={range.label}
          action={
            <div className="flex gap-1 rounded-full bg-surface-soft p-0.5">
              {BUCKETS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBucket(b.id)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                    bucket === b.id ? "bg-surface text-ink shadow-card-sm" : "text-muted",
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="flex flex-col gap-3 p-4">
            {now.units === 0 ? (
              <div className="py-6 text-center text-[13px] text-muted">
                За выбранный период продаж не было.
              </div>
            ) : (
              <>
                <div className="flex h-32 items-end gap-1.5 overflow-x-auto pb-5">
                  {chart.map((p) => {
                    const h = Math.max(
                      (p.revenue / maxRevenue) * 110,
                      p.revenue > 0 ? 3 : 1,
                    );
                    return (
                      <div
                        key={p.key}
                        className="group relative flex min-w-[14px] flex-1 flex-col-reverse items-stretch"
                      >
                        <div
                          className={cn(
                            "w-full rounded-t transition-colors",
                            p.forecast
                              ? "border-2 border-dashed border-emerald-400 bg-emerald-50"
                              : p.revenue > 0
                                ? "bg-emerald-500 group-hover:bg-emerald-600"
                                : "bg-surface-soft",
                          )}
                          style={{ height: `${h}px` }}
                        />
                        <span className="absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap pt-1 text-[9px] font-medium text-muted-2">
                          {p.label}
                        </span>
                        <div className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[8px] bg-ink px-2.5 py-1.5 text-[11px] text-white shadow-lg group-hover:block">
                          <div className="text-white/70">
                            {p.forecast ? "прогноз на следующий период" : p.label}
                          </div>
                          <div className="font-bold tabular-nums">{fmt(p.revenue)} ₽</div>
                          <div className="text-[10px] text-white/70">
                            {p.units} ед.
                            {!p.forecast && p.profit > 0 && ` · прибыль ${fmt(p.profit)} ₽`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {dyn.forecast && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-soft px-3 py-2 text-[12px] text-muted">
                    <span className="inline-block h-3 w-3 rounded border-2 border-dashed border-emerald-400 bg-emerald-50" />
                    Прогноз на следующий интервал:{" "}
                    <b className="text-ink">{fmt(dyn.forecast.revenue)} ₽</b>
                    {dyn.trendPct != null && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                          dyn.trendPct >= 0
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-soft text-red-ink",
                        )}
                      >
                        {dyn.trendPct > 0 ? "+" : ""}
                        {dyn.trendPct}%
                      </span>
                    )}
                    <span className="text-muted-2">— по тренду выбранного периода</span>
                  </div>
                )}
              </>
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
          <div className="flex flex-col gap-4 p-4">
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

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-border/60 text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
                    <th className="px-4 py-2 text-left font-bold">Менеджер</th>
                    <th className="px-2 py-2 text-right font-bold">Продано</th>
                    <th className="px-2 py-2 text-right font-bold">Выручка</th>
                    <th className="px-2 py-2 text-right font-bold">Прибыль</th>
                    <th className="px-2 py-2 text-right font-bold">Ср. чек</th>
                    <th className="px-4 py-2 text-right font-bold">Ему</th>
                  </tr>
                </thead>
                <tbody>
                  {mRating.map((row, i) => (
                    <tr
                      key={row.managerId ?? "none"}
                      className="border-b border-border/60 last:border-b-0"
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="w-4 text-[11px] font-bold text-muted-2">
                            {i + 1}
                          </span>
                          <ManagerAvatar name={row.name} color={row.color} size={26} />
                          <span className="min-w-0 truncate font-semibold text-ink">
                            {row.name}
                          </span>
                          {row.manager && row.manager.commissionPct > 0 && (
                            <span className="rounded-full bg-surface-soft px-1.5 py-0.5 text-[10px] font-bold text-muted-2">
                              {row.manager.commissionPct}%
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right font-bold tabular-nums text-ink">
                        {row.units}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {fmt(row.revenue)} ₽
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-emerald-700">
                        {fmt(row.profit)} ₽
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-muted">
                        {fmt(row.avgCheck)} ₽
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                        {row.commission ? `${fmt(row.commission)} ₽` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
      </div>

      {/* Последние сделки — быстрый вход в детализацию */}
      {sold.length > 0 && (
        <SectionCard title="Последние продажи" hint={range.label}>
          <div className="flex flex-col">
            {sold.slice(0, 5).map((d) => (
              <RecentRow key={d.id} deal={d} onOpen={() => onOpenDeal(d.id)} />
            ))}
          </div>
        </SectionCard>
      )}

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

function RecentRow({ deal, onOpen }: { deal: SaleDeal; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-soft/60"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">
          {deal.modelName || deal.scooterName || "Техника"}
          {deal.vin && (
            <span className="ml-1.5 text-[11.5px] font-normal text-muted-2">
              VIN {deal.vin}
            </span>
          )}
        </span>
        <span className="block truncate text-[11.5px] text-muted">
          {deal.clientName ?? "клиент не указан"}
          {deal.managerName && ` · ${deal.managerName}`}
        </span>
      </span>
      <span className="text-right">
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

