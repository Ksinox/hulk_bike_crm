import { useMemo, useState } from "react";
import { Handshake, Plus } from "lucide-react";
import { ElectricMark } from "@/components/PowerTypeBadge";
import { ScooterName } from "@/components/ScooterName";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiPayments, type ApiPayment } from "@/lib/api/payments";
import { useApiRentals, useApiRentalsArchived } from "@/lib/api/rentals";
import { useApiInvestors } from "@/lib/api/investors";
import { useBillingPeriodAnchors } from "@/lib/api/billing-period";
import { currentBillingPeriod } from "@/lib/billingPeriod";
import { DEFAULT_PARTNER_SHARE } from "@/lib/partner";
import { AddScooterModal } from "@/pages/fleet/AddScooterModal";
import { cn } from "@/lib/utils";

/**
 * «Партнёрка → Электротранспорт» — аналог вкладки «Скутеры», но для
 * партнёрской техники (п.11 + правки 27.08).
 *
 * По каждой единице: выручка за расчётный период → доля инвестора → наша
 * доля. Процент — свойство ИНВЕСТОРА (правка 27.08): выбрали инвестора у
 * единицы — его процент подтянулся автоматически. Редактировать процент на
 * единице больше нельзя (старая логика убрана) — меняется он в карточке
 * инвестора.
 *
 * Строка кликабельна → карточка техники ВНУТРИ партнёрки (та же, что в
 * «Скутерах»). Техника добавляется прямо отсюда — кнопкой, как в «Скутерах».
 */

const fmt = (n: number) => n.toLocaleString("ru-RU");

/** Критерии выручки — те же, что в useRevenue.ts. */
function countsAsRevenue(p: ApiPayment): boolean {
  if (!p.paid || !p.paidAt) return false;
  if (p.excludedFromRevenue) return false;
  if (p.type === "deposit" || p.type === "refund") return false;
  if (p.method === "deposit" && p.type !== "deposit_forfeit") return false;
  return true;
}

export function PartnerFleet({
  onOpenScooter,
}: {
  /** Открыть карточку техники внутри партнёрки. */
  onOpenScooter: (id: number) => void;
}) {
  const { data: scooters = [] } = useApiScooters();
  const { data: models = [] } = useApiScooterModels();
  const { data: payments = [] } = useApiPayments();
  const { data: active = [] } = useApiRentals();
  const { data: archived = [] } = useApiRentalsArchived();
  const { data: investorsData } = useApiInvestors();
  const investors = investorsData?.items ?? [];
  const anchorsQ = useBillingPeriodAnchors();
  const [addOpen, setAddOpen] = useState(false);

  const period = useMemo(
    () => currentBillingPeriod(new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchorsQ.data],
  );

  // Выручка периода по каждому партнёрскому скутеру + итоги.
  const calc = useMemo(() => {
    const modelById = new Map(models.map((m) => [m.id, m] as const));
    const invById = new Map(investors.map((i) => [i.id, i] as const));
    const partnerScooters = scooters.filter((s) => s.isPartner);
    const partnerIds = new Set(partnerScooters.map((s) => s.id));
    const rentalToScooter = new Map<number, number>();
    for (const r of [...active, ...archived]) {
      if (r.scooterId != null && partnerIds.has(r.scooterId)) {
        rentalToScooter.set(r.id, r.scooterId);
      }
    }
    const revenueByScooter = new Map<number, number>();
    for (const p of payments) {
      if (!countsAsRevenue(p)) continue;
      if (p.rentalId == null) continue;
      const scooterId = rentalToScooter.get(p.rentalId);
      if (scooterId == null) continue;
      const t = new Date(p.paidAt!).getTime();
      if (t < period.start.getTime() || t >= period.end.getTime()) continue;
      revenueByScooter.set(
        scooterId,
        (revenueByScooter.get(scooterId) ?? 0) + p.amount,
      );
    }
    const items = partnerScooters.map((s) => {
      const revenue = revenueByScooter.get(s.id) ?? 0;
      const investor = s.investorId != null ? invById.get(s.investorId) : null;
      // Правка 27.08: процент подтягивается от инвестора единицы.
      // Fallback (единица без инвестора): её старый процент либо общий.
      const sharePct =
        investor?.share ?? s.partnerShare ?? DEFAULT_PARTNER_SHARE;
      const payout = Math.floor((revenue * sharePct) / 100);
      const model = s.modelId != null ? modelById.get(s.modelId) : null;
      return {
        scooter: s,
        modelName: model?.name ?? "—",
        isElectric: model?.isElectric ?? false,
        investor,
        revenue,
        sharePct,
        payout,
        ours: revenue - payout,
      };
    });
    const totals = items.reduce(
      (acc, it) => ({
        revenue: acc.revenue + it.revenue,
        payout: acc.payout + it.payout,
        ours: acc.ours + it.ours,
      }),
      { revenue: 0, payout: 0, ours: 0 },
    );
    return { items, totals };
  }, [models, scooters, active, archived, payments, period, investors]);

  const periodLabel = `${period.start.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — ${new Date(period.end.getTime() - 1).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-violet-100 px-3 py-1 text-[12px] font-bold text-violet-700">
          {calc.items.length}{" "}
          {calc.items.length === 1 ? "единица" : "единиц"} техники
        </span>
        <span className="text-[12.5px] text-muted">
          Расчётный период: <b className="text-ink-2">{periodLabel}</b>
        </span>
        <div className="flex-1" />
        {/* Правка 27.08: техника добавляется прямо из партнёрки. */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-bold text-white transition-transform active:scale-[0.98]"
        >
          <Plus size={14} /> Добавить технику
        </button>
      </div>

      {calc.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-6 py-16 text-center shadow-card-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Handshake size={26} />
          </div>
          <div className="text-[16px] font-bold text-ink">
            Партнёрской техники пока нет
          </div>
          <div className="max-w-[440px] text-[13px] leading-relaxed text-muted">
            Добавьте её кнопкой выше: выберите модель, инвестора — и единица
            появится здесь с расчётом выплат по проценту инвестора.
          </div>
        </div>
      ) : (
        <>
          {/* Итоги периода */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-surface p-4 shadow-card-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Выручка партнёрской техники
              </div>
              <div className="mt-1 font-display text-[26px] font-extrabold tabular-nums text-ink">
                {fmt(calc.totals.revenue)} ₽
              </div>
            </div>
            <div className="rounded-2xl bg-violet-600 p-4 text-white shadow-card">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                Доля инвесторов
              </div>
              <div className="mt-1 font-display text-[26px] font-extrabold tabular-nums">
                {fmt(calc.totals.payout)} ₽
              </div>
            </div>
            <div className="rounded-2xl bg-surface p-4 shadow-card-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Наша доля (в общей выручке)
              </div>
              <div className="mt-1 font-display text-[26px] font-extrabold tabular-nums text-green-ink">
                {fmt(calc.totals.ours)} ₽
              </div>
            </div>
          </div>

          {/* Таблица техники */}
          <div className="overflow-x-auto rounded-2xl bg-surface shadow-card-sm">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-muted-2">
                  <th className="px-4 py-3">Техника</th>
                  <th className="px-4 py-3">Инвестор</th>
                  <th className="px-4 py-3 text-right">Выручка за период</th>
                  <th className="px-4 py-3 text-right">% инвестора</th>
                  <th className="px-4 py-3 text-right">Доля инвестора</th>
                  <th className="px-4 py-3 text-right">Наша доля</th>
                </tr>
              </thead>
              <tbody>
                {calc.items.map((it) => (
                  <tr
                    key={it.scooter.id}
                    onClick={() => onOpenScooter(it.scooter.id)}
                    className="cursor-pointer border-t border-border/60 transition-colors hover:bg-surface-soft/60"
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        <ScooterName
                          name={it.scooter.name}
                          number={it.scooter.rentalSlot}
                          exNumber={it.scooter.exRentalSlot}
                          size="sm"
                        />
                        {it.isElectric && <ElectricMark size="sm" />}
                        <span className="text-[11px] font-normal text-muted-2">
                          {it.modelName}
                          {it.scooter.uid ? ` · ID ${it.scooter.uid}` : ""}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {it.investor ? (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11.5px] font-semibold text-violet-700">
                          {it.investor.name}
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-muted-2">
                          не привязан
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      {fmt(it.revenue)} ₽
                    </td>
                    <td
                      className="px-4 py-3 text-right font-bold tabular-nums text-muted"
                      title="Процент задаётся у инвестора — техника наследует его автоматически"
                    >
                      {it.sharePct} %
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-violet-700">
                      {fmt(it.payout)} ₽
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-bold tabular-nums",
                        it.ours > 0 ? "text-green-ink" : "text-muted",
                      )}
                    >
                      {fmt(it.ours)} ₽
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-[11.5px] leading-relaxed text-muted-2">
            Выручка считается по правилам общей «Выручки» (без залогов и
            возвратов). Общая выручка на дашборде уже показана за вычетом доли
            инвестора. Процент задаётся у инвестора (вкладка «Инвесторы») и
            наследуется его техникой.
          </div>
        </>
      )}

      {addOpen && (
        <AddScooterModal partner onClose={() => setAddOpen(false)} />
      )}
    </div>
  );
}
