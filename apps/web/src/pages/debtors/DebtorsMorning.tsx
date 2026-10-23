/**
 * Главная модуля «Должники» (партия 23.10).
 *
 * Раньше — «Утро»: одна hero-карточка самого срочного + очередь, а все дела
 * пряталась за ссылкой. Заказчик: на главной — ВСЕ активные дела, и
 * отдельным блоком — задачи на прозвон.
 *
 *  - Все активные дела: аватар, тип, где сейчас (ждём оплату до …, пора
 *    спросить, этап), остаток.
 *  - Прозвон сегодня: кому звонить и зачем (дела, что ждут оплату по акту,
 *    сюда не попадают, пока срок не прошёл).
 * Компьютер/планшет — две колонки, телефон — прозвон сверху, дела ниже.
 */
import { useState } from "react";
import { useMe } from "@/lib/api/auth";
import { useTabletLayout } from "@/lib/useIsMobile";
import { useDebtorsToday } from "@/lib/api/debtors";
import { Plus, ArrowRight, Filter, Phone, Clock } from "lucide-react";
import { fileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import {
  STAGE_LABEL,
  TYPE_LABEL,
  formatRub,
  isAwaitingPayment,
  ruDate,
  type DebtType,
  type TodayAction,
  type TodayDebtor,
} from "@/lib/debtors/types";

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

const PRIO_DOT: Record<"hot" | "warm" | "cool", string> = {
  hot: "bg-red-600",
  warm: "bg-amber-500",
  cool: "bg-blue-600",
};

const left = (d: TodayDebtor) => d.remaining ?? d.totalAmount;

export function DebtorsMorning({
  onOpenCase,
  onAddNew,
  onOpenList,
}: {
  onOpenCase: (id: number) => void;
  onAddNew: () => void;
  onOpenList: () => void;
}) {
  /** Планшет: главное действие раздела — в нижней панели справа. */
  const tabletLayout = useTabletLayout();
  const me = useMe();
  const todayQ = useDebtorsToday();
  const [showAllCalls, setShowAllCalls] = useState(false);
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
  if (!todayQ.data) return null;

  const { hottest, queue, totalActiveCount, totalActiveSum } = todayQ.data;
  const calls = [...(hottest ? [hottest] : []), ...queue];
  const active =
    todayQ.data.active ??
    calls.map((c) => ({ debtor: c.debtor, action: c.action as TodayAction | null }));
  const awaitingCount = todayQ.data.awaitingCount ?? 0;
  const CALLS_LIMIT = 6;
  const shownCalls = showAllCalls ? calls : calls.slice(0, CALLS_LIMIT);

  const callsBlock = (
    <section data-debtors-calls className="min-w-0">
      <BlockTitle
        icon={<Phone size={14} />}
        title="Прозвон сегодня"
        count={calls.length}
        tone="red"
      />
      {calls.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-border px-4 py-5 text-[13px] text-muted">
          Звонить сегодня некому
          {awaitingCount > 0 &&
            ` — ${awaitingCount} ${awaitingCount === 1 ? "дело ждёт" : "дел ждут"} оплату по акту`}
          .
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {shownCalls.map(({ debtor, action }) => (
            <div
              key={debtor.id}
              className={cn(
                "flex items-center gap-2 rounded-[12px] border bg-white pr-2 transition-colors hover:border-ink",
                action.priority === "hot" ? "border-red-200" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => onOpenCase(debtor.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left"
              >
                <Avatar name={debtor.clientName} photoKey={debtor.clientPhotoKey} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold leading-tight text-ink">
                    {debtor.clientName}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] leading-snug text-muted">
                    <span
                      className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${PRIO_DOT[action.priority]}`}
                    />
                    {action.text}
                  </div>
                </div>
                <div className="shrink-0 font-display text-[15px] font-semibold tabular-nums text-ink">
                  {formatRub(left(debtor))}
                </div>
              </button>
              {debtor.clientPhone && debtor.clientPhone !== "—" && (
                <a
                  href={`tel:${debtor.clientPhone.replace(/[^\d+]/g, "")}`}
                  title={`Позвонить ${debtor.clientPhone}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-green-soft text-green-ink transition-colors hover:bg-green-soft/70"
                >
                  <Phone size={15} />
                </a>
              )}
            </div>
          ))}
          {calls.length > CALLS_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAllCalls((v) => !v)}
              className="mt-1 h-10 rounded-[10px] bg-surface-soft text-[12.5px] font-semibold text-ink-2 hover:bg-blue-50 hover:text-blue-700"
            >
              {showAllCalls ? "Свернуть" : `Ещё ${calls.length - CALLS_LIMIT}`}
            </button>
          )}
        </div>
      )}
    </section>
  );

  const casesBlock = (
    <section data-debtors-active className="min-w-0">
      <BlockTitle
        icon={<Clock size={14} />}
        title="Все активные дела"
        count={totalActiveCount}
        extra={formatRub(totalActiveSum)}
      />
      <div className="flex flex-col gap-1.5">
        {active.map(({ debtor, action }) => {
          const awaiting = isAwaitingPayment(debtor);
          const status = awaiting
            ? `ждём оплату до ${ruDate(debtor.paymentDueDate)}`
            : action?.kind === "payment_check"
              ? "пора спросить: пришла ли оплата?"
              : STAGE_LABEL[debtor.stage];
          return (
            <button
              key={debtor.id}
              type="button"
              data-case-row={debtor.caseNumber}
              onClick={() => onOpenCase(debtor.id)}
              className="grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-[12px] border border-border bg-white px-3 py-2.5 text-left transition-all hover:translate-x-0.5 hover:border-ink hover:shadow-card"
            >
              <Avatar name={debtor.clientName} photoKey={debtor.clientPhotoKey} />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold leading-tight text-ink">
                  {debtor.clientName}
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
                  <i
                    className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_DOT[debtor.type]}`}
                  />
                  <span className="shrink-0">{TYPE_LABEL[debtor.type]}</span>
                  <span className="text-muted-2">·</span>
                  <span
                    className={cn(
                      "truncate",
                      awaiting
                        ? "text-blue-700"
                        : action?.kind === "payment_check"
                          ? "font-semibold text-red-ink"
                          : "",
                    )}
                  >
                    {status}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-[15px] font-semibold tabular-nums text-ink">
                  {formatRub(left(debtor))}
                </div>
                <div className="font-mono text-[10.5px] text-muted-2">
                  {debtor.caseNumber}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );

  return (
    <section className="rounded-[18px] bg-white p-4 shadow-card-sm sm:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 font-mono text-[12px] uppercase tracking-[0.08em] text-muted-2">
            {date} · {now.toTimeString().slice(0, 5)}
          </div>
          <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.022em] text-ink sm:text-[34px]">
            {greeting},{" "}
            <em className="font-display font-semibold not-italic text-blue-700">
              {name}
            </em>
          </h1>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button
            type="button"
            onClick={onOpenList}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-border bg-white px-3.5 text-[13px] font-semibold text-ink hover:border-border-strong sm:h-9 sm:flex-none"
          >
            <Filter size={14} />
            Все дела и архив
          </button>
          {/* На планшете «Новое дело» живёт в нижней панели справа (21.09). */}
          {!tabletLayout && (
            <button
              type="button"
              onClick={onAddNew}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-ink px-3.5 text-[13px] font-semibold text-white hover:bg-[#16213a] sm:h-9 sm:flex-none"
            >
              <Plus size={14} />
              Новое дело
            </button>
          )}
        </div>
      </div>

      {/* Телефон: сначала прозвон (что делать), ниже все дела.
          Компьютер/планшет: дела слева, прозвон справа. */}
      <div className="mt-6 flex flex-col gap-7 lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-6 tab:grid tab:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] tab:items-start tab:gap-6">
        <div className="order-2 min-w-0 lg:order-1 tab:order-1">{casesBlock}</div>
        <div className="order-1 min-w-0 lg:order-2 lg:sticky lg:top-4 tab:order-2">
          {callsBlock}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenList}
        className="mt-6 flex w-full items-center gap-3 rounded-[14px] border border-dashed border-border-strong bg-white px-4 py-3.5 text-left text-[13px] text-muted transition-colors hover:border-ink hover:bg-surface-soft sm:px-5"
      >
        <Filter size={15} className="text-muted-2" />
        <div className="flex-1">Таблица дел, фильтры и закрытые дела</div>
        <ArrowRight size={15} className="text-muted-2" />
      </button>
    </section>
  );
}

function BlockTitle({
  icon,
  title,
  count,
  extra,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  extra?: string;
  tone?: "red";
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-lg",
          tone === "red" ? "bg-red-soft text-red-ink" : "bg-blue-50 text-blue-700",
        )}
      >
        {icon}
      </span>
      <h2 className="m-0 text-[15px] font-bold text-ink">{title}</h2>
      <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[12px] font-bold tabular-nums text-ink-2">
        {count}
      </span>
      {extra && (
        <span className="ml-auto font-display text-[15px] font-bold tabular-nums text-ink">
          {extra}
        </span>
      )}
    </div>
  );
}

function Avatar({ name, photoKey }: { name: string; photoKey?: string | null }) {
  const [broken, setBroken] = useState(false);
  if (photoKey && !broken)
    return (
      <img
        src={fileUrl(photoKey, { variant: "thumb" }) ?? undefined}
        alt=""
        onError={() => setBroken(true)}
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-gradient-to-br from-blue-50 to-surface-soft text-[12px] font-semibold text-ink">
      {(name ?? "?").slice(0, 2).toUpperCase()}
    </div>
  );
}
