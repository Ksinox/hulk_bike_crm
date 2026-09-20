import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
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
  type BillingPeriod,
} from "@/lib/billingPeriod";
import {
  useFinanceCategories,
  useFinanceEntriesRange,
  useFinancePayrollRange,
  type FinanceEntry,
} from "@/lib/api/finance";
import { FinanceFlows } from "./FinanceFlows";
import { FinanceOverview } from "./FinanceOverview";
import { FinancePayroll } from "./FinancePayroll";
import { FinanceRecurringList } from "./FinanceRecurring";
import { FinanceCategories } from "./FinanceCategories";
import { PeriodBar, type RangeMode } from "./PeriodBar";

/**
 * Блок «Финансы» (задание заказчика 20.09) — форма ДДС.
 *
 * Экран один на все устройства: на компьютере таблицы, на телефоне те же
 * данные карточками. Так блок не разъезжается между версиями — оператор с
 * любого устройства делает одно и то же.
 *
 * Период по умолчанию — расчётный период CRM (у заказчика с 15-го по 15-е),
 * но смотреть можно и за три периода, полгода, год или за свой диапазон дат.
 * Своего календаря у блока нет: два разных «месяца» в системе гарантируют
 * спор цифр.
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

const isoOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dayMonth = (iso: string): string => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
    .toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    .replace(".", "");
};

/** Короткая подпись периода: «15 сен — 14 окт». */
export function periodLabel(p: BillingPeriod): string {
  const last = new Date(p.end.getTime() - 86_400_000);
  return `${dayMonth(isoOf(p.start))} — ${dayMonth(isoOf(last))}`;
}

export function keyOfPeriod(p: BillingPeriod): string {
  return isoOf(p.start);
}

/** Сколько расчётных периодов охватывает быстрый вариант. */
const SPAN: Record<RangeMode, number> = {
  period: 1,
  quarter: 3,
  half: 6,
  year: 12,
  custom: 1,
};

export function Finance({ embedded = false }: { embedded?: boolean } = {}) {
  const [tab, setTab] = useState<FinanceTab>("overview");
  /** Сдвиг от текущего периода: 0 — этот, 1 — прошлый и так далее. */
  const [back, setBack] = useState(0);
  const [mode, setMode] = useState<RangeMode>("period");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  /** На телефоне динамику показываем короче: 13 столбиков в 390px не читаются. */
  const compact = useIsMobile();

  /** Видимый диапазон: свой или набранный из расчётных периодов. */
  const range = useMemo(() => {
    if (mode === "custom" && custom) {
      return {
        from: custom.from,
        to: custom.to,
        label: `${dayMonth(custom.from)} — ${dayMonth(custom.to)}`,
        sub: "свой период",
      };
    }
    const span = SPAN[mode];
    const list = listRecentBillingPeriods(back + span);
    const newest = list[back] ?? currentBillingPeriod();
    const oldest = list[back + span - 1] ?? newest;
    const lastDay = new Date(newest.end.getTime() - 86_400_000);
    const sub =
      span > 1
        ? `${span} периода подряд`
        : back === 0
          ? "текущий период"
          : back === 1
            ? "прошлый период"
            : `${back} периода назад`;
    return {
      from: isoOf(oldest.start),
      to: isoOf(lastDay),
      label: `${dayMonth(isoOf(oldest.start))} — ${dayMonth(isoOf(lastDay))}`,
      sub,
    };
  }, [mode, custom, back]);

  /** Такой же по длине отрезок перед выбранным — с ним и сравниваем. */
  const prev = useMemo(() => {
    const from = new Date(range.from);
    const to = new Date(range.to);
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
    const prevTo = new Date(from.getTime() - 86_400_000);
    const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86_400_000);
    return { from: isoOf(prevFrom), to: isoOf(prevTo) };
  }, [range.from, range.to]);

  const { data: categories = [] } = useFinanceCategories();
  const { data: entriesData } = useFinanceEntriesRange(range.from, range.to);
  const { data: payroll = [] } = useFinancePayrollRange(range.from, range.to);
  const { data: prevData } = useFinanceEntriesRange(prev.from, prev.to);
  const entries: FinanceEntry[] = entriesData?.items ?? [];
  const prevEntries: FinanceEntry[] = prevData?.items ?? [];

  const payrollTotal = payroll.reduce((s, r) => s + r.salary + r.salesBonus, 0);
  const payrollByPeriod = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of payroll) m[r.periodKey] = (m[r.periodKey] ?? 0) + r.salary + r.salesBonus;
    return m;
  }, [payroll]);
  const sum = (list: FinanceEntry[], kind: "income" | "expense") =>
    list.filter((e) => e.kind === kind).reduce((s, e) => s + e.amount, 0);
  const income = sum(entries, "income");
  const expense = sum(entries, "expense") + payrollTotal;
  const profit = income - expense;
  const marginPct = income > 0 ? Math.round((profit / income) * 100) : 0;
  const prevIncome = sum(prevEntries, "income");
  const prevExpense = sum(prevEntries, "expense");
  const prevProfit = prevIncome - prevExpense;

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

      <PeriodBar
        label={range.label}
        sublabel={range.sub}
        mode={mode}
        back={back}
        custom={custom}
        onBack={() => setBack((b) => b + 1)}
        onForward={() => setBack((b) => Math.max(0, b - 1))}
        onMode={(m) => {
          setMode(m);
          setBack(0);
        }}
        onCustom={setCustom}
      />

      {/* Три цифры периода. Клик ведёт в соответствующий список. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MoneyTile
          label="Приход"
          value={income}
          prev={prevIncome}
          tone="good"
          onClick={() => setTab("income")}
        />
        <MoneyTile
          label="Расход"
          value={expense}
          prev={prevExpense}
          invertDelta
          tone="bad"
          onClick={() => setTab("expense")}
        />
        <MoneyTile
          label="Прибыль"
          value={profit}
          prev={prevProfit}
          tone={profit >= 0 ? "good" : "bad"}
          hint={income > 0 ? `${marginPct}% от прихода` : "приход ещё не внесён"}
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
          prevEntries={prevEntries}
          categories={categories}
          periods={(entriesData?.periods ?? []).slice(0, compact ? 6 : 13)}
          payrollTotal={payrollTotal}
          payrollByPeriod={payrollByPeriod}
          onOpenTab={setTab}
        />
      )}
      {(tab === "income" || tab === "expense") && (
        <FinanceFlows
          kind={tab === "income" ? "income" : "expense"}
          entries={entries}
          allEntries={entries}
          categories={categories}
          bounds={{ from: range.from, to: range.to }}
          payrollTotal={payrollTotal}
        />
      )}
      {tab === "recurring" && (
        <FinanceRecurringList
          categories={categories}
          periodKey={entriesData?.periodKey ?? range.from}
          entries={entries}
        />
      )}
      {tab === "payroll" && <FinancePayroll rows={payroll} rangeLabel={range.label} />}
      {tab === "categories" && <FinanceCategories categories={categories} entries={entries} />}
    </main>
  );
}

function MoneyTile({
  label,
  value,
  prev = 0,
  tone,
  hint,
  onClick,
  invertDelta = false,
  wide = false,
}: {
  label: string;
  value: number;
  /** Столько же было за предыдущий такой же отрезок. */
  prev?: number;
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
          "font-display text-[21px] font-extrabold leading-none tabular-nums sm:text-[30px]",
          tone === "good" ? "text-ink" : "text-ink",
        )}
      >
        {fmtMoney(value)}
      </div>
      <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
        {delta != null && (
          <span
            className={cn(
              "shrink-0 font-semibold",
              goodDelta ? "text-emerald-700" : "text-red-600",
            )}
            title="Изменение к предыдущему такому же отрезку"
          >
            {up ? "↗" : "↘"} {Math.abs(delta)}%
          </span>
        )}
        <span className="truncate">{hint ?? "к прошлому периоду"}</span>
      </div>
    </button>
  );
}
