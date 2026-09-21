import { ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TABLET_WIZARD_PANEL } from "@/mobile/tablet";
import type { ServiceMoney, ServiceMoneyRow } from "@/lib/serviceMoney";
import { money, orderNo, StatusBadge } from "./serviceOrderUi";

/**
 * Разбивка денег ремонтов за период (правки 7.0, п.3): по клику на плашку
 * «Выручка» или «Прибыль». Строка — ремонт: выручка, общая прибыль, процент
 * механика, наша прибыль. Итог внизу = цифрам в плашках.
 *
 * Без права на прибыль ремонтов — только выручка (правило «нет права — нет
 * показателя»): столбцы прибыли и механика не рисуются вовсе.
 */
export function ServiceMoneySheet({
  rows,
  stats,
  periodLabel,
  showProfit,
  touch,
  onOpen,
  onClose,
}: {
  rows: ServiceMoneyRow[];
  stats: ServiceMoney;
  periodLabel: string;
  showProfit: boolean;
  touch: boolean;
  onOpen: (orderId: number) => void;
  onClose: () => void;
}) {
  const title = showProfit ? "Выручка и прибыль" : "Выручка";
  // На телефоне пять столбцов не помещаются — строка становится карточкой.
  const cards = touch;

  const summary = (
    <div
      className={cn(
        "grid gap-2",
        showProfit ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1",
      )}
      data-money-summary
    >
      <Sum label="Выручка" value={money(stats.revenue)} tone="good" />
      {showProfit && <Sum label="Общая прибыль" value={money(stats.grossProfit)} />}
      {showProfit && <Sum label="Механикам" value={money(stats.mechanicShare)} />}
      {showProfit && (
        <Sum label="Наша прибыль" value={money(stats.profit)} tone={stats.profit >= 0 ? "good" : "bad"} strong />
      )}
    </div>
  );

  const empty = (
    <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted">
      За этот период денег по ремонтам не принимали.
    </div>
  );

  const table = (
    <div className="overflow-hidden rounded-2xl border border-border" data-money-table>
      <table className="w-full table-fixed border-collapse text-[13px]">
        {/* Ремонту — место под технику и клиента, цифрам — ровно по ширине. */}
        <colgroup>
          <col className={showProfit ? "w-[34%]" : "w-[62%]"} />
          <col className={showProfit ? "w-[15%]" : "w-[38%]"} />
          {showProfit && (
            <>
              <col className="w-[17%]" />
              <col className="w-[16%]" />
              <col className="w-[18%]" />
            </>
          )}
        </colgroup>
        <thead>
          <tr className="bg-surface-soft text-left text-[11px] font-bold uppercase tracking-wider text-muted-2">
            <th className="px-3 py-2.5">Ремонт</th>
            <th className="px-3 py-2.5 text-right">Выручка</th>
            {showProfit && (
              <>
                <th className="px-3 py-2.5 text-right">Общая прибыль</th>
                <th className="px-3 py-2.5 text-right">% механика</th>
                <th className="px-3 py-2.5 text-right">Наша прибыль</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.order.id}
              onClick={() => onOpen(r.order.id)}
              className="cursor-pointer border-t border-border/70 transition-colors hover:bg-surface-soft/60"
              data-money-row={r.order.number}
            >
              <td className="max-w-0 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted-2">{orderNo(r.order.number)}</span>
                  <span className="truncate font-semibold text-ink">{r.order.vehicle}</span>
                </div>
                <div className="truncate text-[11.5px] text-muted">
                  {r.order.customerName}
                  {r.order.mechanicName ? ` · механик ${r.order.mechanicName}` : ""}
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums text-ink">{money(r.revenue)}</td>
              {showProfit &&
                (r.counted ? (
                  <>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-2">{money(r.grossProfit)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-2">
                      {r.mechanicPercent != null ? (
                        <>
                          {r.mechanicPercent}%
                          <span className="block text-[11px] text-muted-2">− {money(r.mechanicShare)}</span>
                        </>
                      ) : (
                        <span className="text-muted-2">—</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-3 py-2.5 text-right font-extrabold tabular-nums",
                        r.ourProfit >= 0 ? "text-green-ink" : "text-red-ink",
                      )}
                    >
                      {money(r.ourProfit)}
                    </td>
                  </>
                ) : (
                  <td colSpan={3} className="px-3 py-2.5 text-right text-[12px] text-muted-2">
                    <span className="inline-flex items-center gap-2">
                      <StatusBadge status={r.order.status} />
                      прибыль — после полной оплаты
                    </span>
                  </td>
                ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-surface-soft font-extrabold">
            <td className="px-3 py-2.5 text-ink">Итого · {rows.length}</td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink">{money(stats.revenue)}</td>
            {showProfit && (
              <>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink">{money(stats.grossProfit)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-2">
                  {stats.mechanicShare > 0 ? `− ${money(stats.mechanicShare)}` : "—"}
                </td>
                <td className={cn("whitespace-nowrap px-3 py-2.5 text-right tabular-nums", stats.profit >= 0 ? "text-green-ink" : "text-red-ink")}>
                  {money(stats.profit)}
                </td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const cardList = (
    <div className="flex flex-col gap-2" data-money-table>
      {rows.map((r) => (
        <button
          key={r.order.id}
          type="button"
          onClick={() => onOpen(r.order.id)}
          className="flex w-full flex-col gap-2 rounded-2xl bg-surface-soft px-4 py-3 text-left"
          data-money-row={r.order.number}
        >
          <span className="flex w-full items-start gap-2">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted-2">{orderNo(r.order.number)}</span>
                <span className="truncate text-[14px] font-bold text-ink">{r.order.vehicle}</span>
              </span>
              <span className="block truncate text-[12px] text-muted">
                {r.order.customerName}
                {r.order.mechanicName ? ` · механик ${r.order.mechanicName}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[15px] font-extrabold tabular-nums text-ink">{money(r.revenue)}</span>
              <span className="block text-[11px] text-muted-2">выручка</span>
            </span>
            <ChevronRight size={16} className="mt-1 shrink-0 text-muted-2" />
          </span>
          {showProfit &&
            (r.counted ? (
              <span className="grid w-full grid-cols-3 gap-1.5 border-t border-border pt-2">
                <Cell label="Общая" value={money(r.grossProfit)} />
                <Cell
                  label={r.mechanicPercent != null ? `Механик ${r.mechanicPercent}%` : "Механик"}
                  value={r.mechanicPercent != null ? `− ${money(r.mechanicShare)}` : "—"}
                />
                <Cell label="Наша" value={money(r.ourProfit)} tone={r.ourProfit >= 0 ? "good" : "bad"} />
              </span>
            ) : (
              <span className="flex w-full items-center gap-2 border-t border-border pt-2 text-[12px] text-muted-2">
                <StatusBadge status={r.order.status} /> прибыль — после полной оплаты
              </span>
            ))}
        </button>
      ))}
    </div>
  );

  const body = (
    <>
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[20px] font-extrabold text-ink">{title}</div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            {periodLabel} · выручка — деньги, принятые в периоде
            {showProfit ? "; прибыль — по ремонтам, оплаченным полностью" : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl text-muted-2 hover:bg-surface-soft hover:text-ink",
            touch ? "h-11 w-11" : "h-9 w-9",
          )}
        >
          <X size={touch ? 20 : 17} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-money-sheet>
        {summary}
        <div className="mt-4">{rows.length === 0 ? empty : cards ? cardList : table}</div>
      </div>
    </>
  );

  if (touch) {
    return (
      <div
        className="fixed inset-0 z-[70] flex flex-col bg-surface lg:items-center lg:bg-ink/45 lg:backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={cn(TABLET_WIZARD_PANEL, "relative")}>{body}</div>
      </div>
    );
  }
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={cn(
          "relative flex max-h-[min(860px,92vh)] w-full flex-col overflow-hidden rounded-3xl bg-surface shadow-card-lg",
          showProfit ? "max-w-[900px]" : "max-w-[620px]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {body}
      </div>
    </div>
  );
}

function Sum({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  strong?: boolean;
}) {
  return (
    <div className={cn("min-w-0 rounded-2xl px-3.5 py-2.5", strong ? "bg-green-soft" : "bg-surface-soft")}>
      <div className="truncate text-[10.5px] font-bold uppercase tracking-wider text-muted-2">{label}</div>
      <div
        className={cn(
          "mt-0.5 truncate font-display text-[19px] font-extrabold tabular-nums",
          tone === "good" ? "text-green-ink" : tone === "bad" ? "text-red-ink" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-[10.5px] font-semibold text-muted-2">{label}</span>
      <span
        className={cn(
          "block truncate text-[13px] font-bold tabular-nums",
          tone === "good" ? "text-green-ink" : tone === "bad" ? "text-red-ink" : "text-ink-2",
        )}
      >
        {value}
      </span>
    </span>
  );
}
