import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Repeat,
  Tags,
  UsersRound,
  Wallet,
} from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { useIsMobile } from "@/lib/useIsMobile";
import { cn } from "@/lib/utils";
import {
  currentBillingPeriod,
  listRecentBillingPeriods,
  periodFor,
  type BillingPeriod,
} from "@/lib/billingPeriod";
import {
  totalsOf,
  useFinanceCategories,
  useFinanceEntries,
  useFinancePayroll,
} from "@/lib/api/finance";
import { FinanceFlows } from "./FinanceFlows";
import { FinanceOverview } from "./FinanceOverview";
import { FinancePayroll } from "./FinancePayroll";
import { FinanceRecurringList } from "./FinanceRecurring";
import { FinanceCategories } from "./FinanceCategories";

/**
 * Блок «Финансы» (задание заказчика 20.09) — форма ДДС.
 *
 * Экран один на все устройства: на компьютере таблицы, на телефоне те же
 * данные карточками. Так блок не разъезжается между версиями — оператор с
 * любого устройства делает одно и то же.
 *
 * Что здесь:
 *   • Обзор — приход, расход, прибыль и динамика по периодам, разрез по
 *     статьям и доля постоянных издержек;
 *   • Приход / Расход — сами движения, каждая строка правится на месте,
 *     удаление мягкое с кнопкой «Отменить»;
 *   • Постоянные — издержки, которые сами повторяются каждый период;
 *   • ФОТ — оклад + процент с продаж по каждому человеку;
 *   • Статьи — справочник.
 *
 * Период — общий расчётный период CRM (у заказчика с 15-го по 15-е). Своего
 * календаря у блока нет: два разных «месяца» в системе гарантируют спор цифр.
 */

export type FinanceTab = "overview" | "income" | "expense" | "recurring" | "payroll" | "categories";

const TABS: { id: FinanceTab; label: string; icon: typeof Wallet }[] = [
  { id: "overview", label: "Обзор", icon: Wallet },
  { id: "income", label: "Приход", icon: ArrowUpRight },
  { id: "expense", label: "Расход", icon: ArrowDownRight },
  { id: "recurring", label: "Постоянные", icon: Repeat },
  { id: "payroll", label: "ФОТ", icon: UsersRound },
  { id: "categories", label: "Статьи", icon: Tags },
];

export const fmtMoney = (n: number): string => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

/** Короткая подпись периода: «15 сен — 14 окт». */
export function periodLabel(p: BillingPeriod): string {
  const last = new Date(p.end.getTime() - 86_400_000);
  const f = (d: Date) =>
    d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
  return `${f(p.start)} — ${f(last)}`;
}

export function keyOfPeriod(p: BillingPeriod): string {
  const d = p.start;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`;
}

export function Finance({ embedded = false }: { embedded?: boolean } = {}) {
  const [tab, setTab] = useState<FinanceTab>("overview");
  /** На телефоне показываем короче: 13 столбиков в 390px не читаются. */
  const compact = useIsMobile();
  /** Сдвиг от текущего периода: 0 — этот, 1 — прошлый и так далее. */
  const [back, setBack] = useState(0);

  const period = useMemo(() => {
    const cur = currentBillingPeriod();
    if (back === 0) return cur;
    return listRecentBillingPeriods(back + 1)[back] ?? cur;
  }, [back]);
  const periodKey = keyOfPeriod(period);

  const { data: categories = [] } = useFinanceCategories();
  const { data: entriesData } = useFinanceEntries(periodKey, 13);
  const { data: payroll = [] } = useFinancePayroll(periodKey);
  const entries = entriesData?.items ?? [];

  const payrollTotal = payroll.reduce((s, r) => s + r.salary + r.salesBonus, 0);
  const totals = totalsOf(entries, periodKey, payrollTotal);

  /** Прошлый период — чтобы показать, куда двинулись цифры. */
  const prevKey = useMemo(() => {
    const prev = periodFor(new Date(period.start.getTime() - 86_400_000));
    return keyOfPeriod(prev);
  }, [period]);
  const prevTotals = totalsOf(entries, prevKey, 0);

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      {/* В мобильной оболочке шапка и заголовок раздела уже есть. */}
      {!embedded && (
        <>
          <Topbar />
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-display text-[28px] font-extrabold leading-none text-ink sm:text-[34px]">
              Финансы
            </h1>
            <span className="text-[13px] text-muted-2">приход, расход и прибыль за период</span>
          </header>
        </>
      )}

      {/* Переключатель периода: тот же расчётный период, что и во всей CRM. */}
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface p-2 shadow-card-sm sm:p-2.5">
        <button
          type="button"
          onClick={() => setBack((b) => b + 1)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-surface-soft hover:text-ink"
          title="Предыдущий период"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 text-center">
          <div className="truncate font-display text-[17px] font-bold leading-tight text-ink sm:text-[19px]">
            {periodLabel(period)}
          </div>
          <div className="text-[11.5px] text-muted-2">
            {back === 0 ? "текущий период" : back === 1 ? "прошлый период" : `${back} периода назад`}
            {period.kind === "transition" ? " · переходный" : ""}
          </div>
        </div>
        <button
          type="button"
          disabled={back === 0}
          onClick={() => setBack((b) => Math.max(0, b - 1))}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-surface-soft hover:text-ink disabled:opacity-30"
          title="Следующий период"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Три цифры периода. Клик ведёт в соответствующий список. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MoneyTile
          label="Приход"
          value={totals.income}
          prev={prevTotals.income}
          tone="good"
          onClick={() => setTab("income")}
        />
        <MoneyTile
          label="Расход"
          value={totals.expense}
          prev={prevTotals.expense}
          tone="bad"
          invertDelta
          onClick={() => setTab("expense")}
        />
        <MoneyTile
          label="Прибыль"
          value={totals.profit}
          prev={prevTotals.profit}
          tone={totals.profit >= 0 ? "good" : "bad"}
          hint={totals.income > 0 ? `${totals.marginPct}% от прихода` : "приход ещё не внесён"}
          onClick={() => setTab("overview")}
          wide
        />
      </div>

      {/* Вкладки: на телефоне сеткой в две строки — видно все сразу, ничего
          не прячется за край. На компьютере — одной строкой. */}
      <div>
        <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-surface p-1.5 shadow-card-sm sm:flex">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-[13px] font-semibold transition-colors sm:flex-1 sm:px-3",
                  on ? "bg-ink text-white" : "text-muted hover:bg-surface-soft hover:text-ink",
                )}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "overview" && (
        <FinanceOverview
          entries={entries}
          categories={categories}
          periodKey={periodKey}
          periods={(entriesData?.periods ?? []).slice(0, compact ? 6 : 13)}
          payrollTotal={payrollTotal}
          onOpenTab={setTab}
        />
      )}
      {(tab === "income" || tab === "expense") && (
        <FinanceFlows
          kind={tab === "income" ? "income" : "expense"}
          entries={entries}
          categories={categories}
          period={period}
          periodKey={periodKey}
          payrollTotal={payrollTotal}
        />
      )}
      {tab === "recurring" && (
        <FinanceRecurringList categories={categories} periodKey={periodKey} entries={entries} />
      )}
      {tab === "payroll" && <FinancePayroll rows={payroll} />}
      {tab === "categories" && <FinanceCategories categories={categories} entries={entries} />}
    </main>
  );
}

function MoneyTile({
  label,
  value,
  prev,
  tone,
  hint,
  onClick,
  invertDelta = false,
  wide = false,
}: {
  label: string;
  value: number;
  prev: number;
  tone: "good" | "bad";
  hint?: string;
  onClick?: () => void;
  /** У расхода рост — это плохо, поэтому стрелка красится наоборот. */
  invertDelta?: boolean;
  wide?: boolean;
}) {
  const delta = prev > 0 ? Math.round(((value - prev) / prev) * 100) : null;
  const up = value >= prev;
  const goodDelta = invertDelta ? !up : up;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-2xl bg-surface p-4 text-left shadow-card-sm transition-transform hover:-translate-y-0.5 sm:p-5",
        wide && "col-span-2 sm:col-span-1",
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
        {label}
      </div>
      <div
        className={cn(
          "font-display text-[26px] font-extrabold leading-none tabular-nums sm:text-[30px]",
          tone === "good" ? "text-ink" : "text-ink",
        )}
      >
        {fmtMoney(value)}
      </div>
      <div className="flex items-center gap-1.5 text-[12px] text-muted">
        {delta != null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold",
              goodDelta ? "text-emerald-700" : "text-red-600",
            )}
          >
            {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(delta)}%
          </span>
        )}
        <span className="truncate">{hint ?? "к прошлому периоду"}</span>
      </div>
    </button>
  );
}
