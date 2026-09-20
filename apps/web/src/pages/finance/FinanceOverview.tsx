import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { periodFor } from "@/lib/billingPeriod";
import type { FinanceCategory, FinanceEntry } from "@/lib/api/finance";
import { fmtMoney, type FinanceTab } from "./Finance";
import { EmptyHint, SectionCard } from "./ui";

/**
 * Обзор: ради чего блок и затевался.
 *
 * Три ответа на одном экране:
 *   • откуда пришли деньги и какое направление тянет выручку;
 *   • куда они ушли и какая статья съедает больше всех;
 *   • как это выглядит в динамике — столбики по периодам.
 *
 * Доли и стрелки считаются к прошлому периоду: «стало хуже/лучше» важнее
 * абсолютной цифры, когда ищешь слабое место.
 */

const short = (key: string): string => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
    .toLocaleDateString("ru-RU", { month: "short" })
    .replace(".", "");
};

export function FinanceOverview({
  entries,
  categories,
  periodKey,
  periods,
  payrollTotal,
  onOpenTab,
}: {
  entries: FinanceEntry[];
  categories: FinanceCategory[];
  periodKey: string;
  periods: string[];
  payrollTotal: number;
  onOpenTab: (t: FinanceTab) => void;
}) {
  const prevKey = useMemo(() => {
    const [y, m, d] = periodKey.split("-").map(Number);
    const start = new Date(y!, (m ?? 1) - 1, d ?? 1);
    return keyOf(periodFor(new Date(start.getTime() - 86_400_000)).start);
  }, [periodKey]);

  const byCat = (kind: "income" | "expense", key: string) => {
    const rows = new Map<string, { name: string; sum: number; fixed: boolean }>();
    for (const e of entries) {
      if (e.kind !== kind || e.periodKey !== key) continue;
      const cat = categories.find((c) => c.id === e.categoryId);
      const name = cat?.name ?? "Без статьи";
      const cur = rows.get(name) ?? { name, sum: 0, fixed: cat?.fixed ?? false };
      cur.sum += e.amount;
      rows.set(name, cur);
    }
    return [...rows.values()].sort((a, b) => b.sum - a.sum);
  };

  const income = byCat("income", periodKey);
  const incomePrev = byCat("income", prevKey);
  const expense = byCat("expense", periodKey);
  const expensePrev = byCat("expense", prevKey);
  if (payrollTotal > 0) expense.unshift({ name: "ФОТ", sum: payrollTotal, fixed: true });

  const incomeSum = income.reduce((s, r) => s + r.sum, 0);
  const expenseSum = expense.reduce((s, r) => s + r.sum, 0);
  const fixedSum = expense.filter((r) => r.fixed).reduce((s, r) => s + r.sum, 0);

  /** Динамика: последние периоды слева направо. */
  const chart = useMemo(() => {
    const keys = [...periods].reverse();
    return keys.map((k) => {
      const inc = entries
        .filter((e) => e.kind === "income" && e.periodKey === k)
        .reduce((s, e) => s + e.amount, 0);
      const exp = entries
        .filter((e) => e.kind === "expense" && e.periodKey === k)
        .reduce((s, e) => s + e.amount, 0);
      return { key: k, inc, exp: exp + (k === periodKey ? payrollTotal : 0) };
    });
  }, [entries, periods, periodKey, payrollTotal]);
  const chartMax = Math.max(1, ...chart.map((c) => Math.max(c.inc, c.exp)));
  // Один период — сравнивать не с чем, столбики только занимают место.
  const hasHistory = chart.filter((c) => c.inc > 0 || c.exp > 0).length >= 2;

  if (incomeSum === 0 && expenseSum === 0) {
    return (
      <SectionCard title="Обзор периода">
        <EmptyHint text="За этот период движений ещё нет. Внесите приход на вкладке «Приход», издержки — на вкладке «Расход», а то, что повторяется каждый месяц, отметьте на вкладке «Постоянные»." />
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {hasHistory && (
        <SectionCard title="Динамика" hint="Приход и расход по периодам — видно, куда идёт бизнес">
          <div className="flex items-end gap-1.5 overflow-x-auto pb-1 sm:gap-3">
            {chart.map((c) => (
              <div key={c.key} className="flex min-w-[42px] flex-1 flex-col items-center gap-1.5">
                <div className="flex h-[120px] w-full items-end justify-center gap-1">
                  <div
                    className="w-1/2 rounded-t-md bg-emerald-500/85"
                    style={{ height: `${Math.max(2, (c.inc / chartMax) * 100)}%` }}
                    title={`Приход ${fmtMoney(c.inc)}`}
                  />
                  <div
                    className="w-1/2 rounded-t-md bg-red-400/85"
                    style={{ height: `${Math.max(2, (c.exp / chartMax) * 100)}%` }}
                    title={`Расход ${fmtMoney(c.exp)}`}
                  />
                </div>
                <div
                  className={cn(
                    "text-[11px] font-semibold",
                    c.key === periodKey ? "text-ink" : "text-muted-2",
                  )}
                >
                  {short(c.key)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11.5px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/85" /> приход
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-400/85" /> расход
            </span>
          </div>
        </SectionCard>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Breakdown
          title="Откуда пришло"
          hint="Направления по доле в приходе"
          rows={income}
          prev={incomePrev}
          total={incomeSum}
          tone="income"
          onOpen={() => onOpenTab("income")}
        />
        <Breakdown
          title="Куда ушло"
          hint={
            fixedSum > 0
              ? `Постоянных издержек ${fmtMoney(fixedSum)} — ${Math.round((fixedSum / Math.max(1, expenseSum)) * 100)}% расхода`
              : "Статьи по доле в расходе"
          }
          rows={expense}
          prev={expensePrev}
          total={expenseSum}
          tone="expense"
          onOpen={() => onOpenTab("expense")}
        />
      </div>
    </div>
  );
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Breakdown({
  title,
  hint,
  rows,
  prev,
  total,
  tone,
  onOpen,
}: {
  title: string;
  hint: string;
  rows: { name: string; sum: number; fixed: boolean }[];
  prev: { name: string; sum: number }[];
  total: number;
  tone: "income" | "expense";
  onOpen: () => void;
}) {
  return (
    <SectionCard
      title={title}
      hint={hint}
      right={
        <button
          type="button"
          onClick={onOpen}
          className="text-[12.5px] font-semibold text-blue-700 hover:text-ink"
        >
          Открыть список →
        </button>
      }
    >
      {rows.length === 0 ? (
        <EmptyHint text="Движений нет." />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const share = total > 0 ? Math.round((r.sum / total) * 100) : 0;
            const was = prev.find((p) => p.name === r.name)?.sum ?? 0;
            const delta = was > 0 ? Math.round(((r.sum - was) / was) * 100) : null;
            const grew = r.sum >= was;
            return (
              <div key={r.name} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-semibold text-ink">{r.name}</span>
                    {r.fixed && (
                      <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                        пост.
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-display text-[14px] font-bold tabular-nums text-ink">
                    {fmtMoney(r.sum)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-soft">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        tone === "income" ? "bg-emerald-500" : "bg-red-400",
                      )}
                      style={{ width: `${Math.max(2, share)}%` }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right text-[11.5px] font-semibold text-muted-2">
                    {share}%
                  </span>
                  <span
                    className={cn(
                      "w-14 shrink-0 text-right text-[11.5px] font-semibold",
                      delta == null
                        ? "text-muted-2"
                        : (tone === "income" ? grew : !grew)
                          ? "text-emerald-700"
                          : "text-red-600",
                    )}
                    title="Изменение к прошлому периоду"
                  >
                    {delta == null ? "—" : `${grew ? "+" : ""}${delta}%`}
                  </span>
                </div>
              </div>
            );
          })}
          <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-2">
              Итого
            </span>
            <span className="font-display text-[16px] font-extrabold tabular-nums text-ink">
              {fmtMoney(total)}
            </span>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
