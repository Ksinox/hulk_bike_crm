/**
 * Экран «Утро» — главный landing модуля.
 *
 * Структура:
 *  - Greeting (Доброе утро, Имя · дата)
 *  - Hero card с самым горящим (если есть hot-задача)
 *  - Очередь дня (warm + cool задачи)
 *  - Сводка по всем активным
 */
import { useMe } from "@/lib/api/auth";
import { useDebtorsToday } from "@/lib/api/debtors";
import { Plus, ArrowRight, Filter, Clock } from "lucide-react";
import { TYPE_LABEL, formatRub, type DebtType } from "@/lib/debtors/types";

function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 11) return "Доброе утро";
  if (h < 17) return "Добрый день";
  if (h < 22) return "Добрый вечер";
  return "Доброй ночи";
}

const TYPE_DOT: Record<DebtType, string> = {
  dtp_guilty: "bg-red-500",
  dtp_victim: "bg-blue-500",
  damage: "bg-orange-500",
  theft: "bg-violet-500",
  rental_overdue: "bg-slate-500",
};

const TYPE_BG: Record<DebtType, string> = {
  dtp_guilty: "bg-red-50 text-red-700 border-red-100",
  dtp_victim: "bg-blue-50 text-blue-700 border-blue-100",
  damage: "bg-orange-50 text-orange-700 border-orange-100",
  theft: "bg-violet-50 text-violet-700 border-violet-100",
  rental_overdue: "bg-slate-50 text-slate-600 border-slate-200",
};

const PRIO_DOT: Record<"hot" | "warm" | "cool", string> = {
  hot: "bg-red-600",
  warm: "bg-amber-500",
  cool: "bg-blue-600",
};

export function DebtorsMorning({
  onOpenCase,
  onAddNew,
  onOpenList,
}: {
  onOpenCase: (id: number) => void;
  onAddNew: () => void;
  onOpenList: () => void;
}) {
  const me = useMe();
  const todayQ = useDebtorsToday();
  const now = new Date();
  const greeting = greetingFor(now);
  const name = me.data?.name?.split(" ")[0] ?? "коллега";
  const date = now.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (todayQ.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted">
        Загрузка…
      </div>
    );
  }
  if (!todayQ.data) {
    return null;
  }

  const { hottest, queue, totalActiveCount, totalActiveSum } = todayQ.data;

  return (
    <section className="rounded-[18px] bg-white p-9 shadow-card-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 font-mono text-[12px] uppercase tracking-[0.08em] text-muted-2">
            {date} · {now.toTimeString().slice(0, 5)}
          </div>
          <h1 className="font-display text-[36px] font-bold leading-none tracking-[-0.022em] text-ink">
            {greeting},{" "}
            <em className="font-display font-semibold not-italic text-blue-700">
              {name}
            </em>
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpenList}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-border bg-white px-3.5 text-[13px] font-semibold text-ink hover:border-border-strong"
          >
            <Filter size={14} />
            Все дела
          </button>
          <button
            type="button"
            onClick={onAddNew}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-ink px-3.5 text-[13px] font-semibold text-white hover:bg-[#16213a]"
          >
            <Plus size={14} />
            Новое дело
          </button>
        </div>
      </div>

      {/* Hero — самое срочное */}
      {hottest && (
        <>
          <div className="mt-8 mb-3 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-red-700">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-600" />
            Самое срочное сегодня
          </div>
          <div className="relative overflow-hidden rounded-[22px] border border-red-100 bg-white p-9 shadow-[0_32px_64px_-24px_rgba(220,38,38,0.25),0_8px_22px_-8px_rgba(11,18,32,0.12)]">
            <div className="absolute left-0 top-0 h-full w-[5px] bg-gradient-to-b from-red-600 to-rose-400" />
            <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(ellipse_at_top_right,rgba(220,38,38,0.06),transparent_60%)]" />

            <div className="relative z-10">
              <div className="mb-4 flex items-center gap-2.5">
                <span
                  className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold ${TYPE_BG[hottest.debtor.type]}`}
                >
                  <i className={`inline-block h-1.5 w-1.5 rounded-full ${TYPE_DOT[hottest.debtor.type]}`} />
                  {TYPE_LABEL[hottest.debtor.type]}
                </span>
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-red-700">
                  СРОЧНО · {hottest.action.text.toUpperCase()}
                </span>
                <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.04em] text-muted-2">
                  {hottest.debtor.caseNumber}
                </span>
              </div>

              <h2 className="mb-1.5 font-display text-[44px] font-bold leading-[1.05] tracking-[-0.025em] text-ink">
                {hottest.debtor.clientName}
              </h2>
              <p className="mb-6 max-w-[580px] text-[17px] leading-[1.5] text-ink-2">
                Сумма к взысканию <b className="font-display text-[22px] font-bold tracking-[-0.01em] text-ink">{formatRub(hottest.debtor.totalAmount)}</b>.
                Открой и разберись — система покажет где сейчас в процессе и
                какой следующий шаг.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenCase(hottest.debtor.id)}
                  className="group inline-flex h-14 items-center gap-2.5 rounded-[14px] bg-ink px-7 text-[16px] font-semibold text-white shadow-[0_12px_24px_-8px_rgba(11,18,32,0.35)] transition-transform hover:-translate-y-0.5"
                >
                  Открыть и разобраться
                  <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Очередь */}
      {queue.length > 0 && (
        <>
          <div className="mt-8 mb-3 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-muted-2">
            <span className="inline-block h-px w-4 bg-muted-2" />
            {hottest ? "Ещё на сегодня" : "Кому звонить сегодня"} · {queue.length}{" "}
            {queue.length === 1 ? "задача" : queue.length < 5 ? "задачи" : "задач"}
          </div>
          <div className="flex flex-col gap-1.5">
            {queue.map(({ debtor, action }) => (
              <button
                key={debtor.id}
                type="button"
                onClick={() => onOpenCase(debtor.id)}
                className="grid grid-cols-[36px_1fr_auto_auto] items-center gap-3.5 rounded-[12px] border border-border bg-white px-4 py-3.5 text-left transition-all hover:translate-x-1 hover:border-ink hover:shadow-card"
              >
                <div className="grid h-9 w-9 place-items-center rounded-full border border-border bg-gradient-to-br from-blue-50 to-surface-soft text-[12px] font-semibold text-ink">
                  {(debtor.clientName ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-[14.5px] font-semibold leading-[1.2] text-ink">
                    {debtor.clientName}
                  </div>
                  <div className="mt-0.5 text-[12px] leading-[1.4] text-muted">
                    <span className={`mr-1.5 inline-block h-1.5 w-1.5 align-middle rounded-full ${PRIO_DOT[action.priority]}`} />
                    {action.text}
                  </div>
                </div>
                <div className="font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">
                  {formatRub(debtor.totalAmount).replace(" ₽", "")}
                  <span className="ml-1 text-[12px] text-muted">₽</span>
                </div>
                <ArrowRight size={14} className="text-muted-2" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* Сводка — клик ведёт в полный список дел */}
      <button
        type="button"
        onClick={onOpenList}
        className="mt-8 flex w-full items-center gap-3 rounded-[14px] border border-dashed border-border-strong bg-white px-5 py-4 text-left text-[13px] text-muted transition-colors hover:border-ink hover:bg-surface-soft"
      >
        <Clock size={16} className="text-muted-2" />
        <div className="flex-1">
          Всего активных дел —{" "}
          <b className="font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">
            {totalActiveCount}
          </b>{" "}
          · на сумму{" "}
          <b className="font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">
            {formatRub(totalActiveSum)}
          </b>
        </div>
        <ArrowRight size={15} className="text-muted-2" />
      </button>
    </section>
  );
}
