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
  formatRub,
  isAwaitingPayment,
  localYmd,
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

  const { hottest, queue, totalActiveSum } = todayQ.data;
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
                  <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted sm:truncate">
                    <span
                      className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${PRIO_DOT[action.priority]}`}
                    />
                    {/* Телефон: сумма — в этой строке, чтобы имя не резалось. */}
                    <b className="mr-1 font-semibold text-ink sm:hidden">
                      {formatRub(left(debtor))} ·
                    </b>
                    {action.text}
                  </div>
                </div>
                <div className="hidden shrink-0 font-display text-[15px] font-semibold tabular-nums text-ink sm:block">
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

  // Один человек — одна строка: чипы-причины (у кого что: ущерб, аренда,
  // выкуп…) с суммами, последний платёж и как идёт график (заказчик 23.10:
  // «чтобы менеджер сразу сориентировался, у кого какая проблема»).
  const people = groupByPerson(active.map((a) => ({ ...a.debtor, action: a.action })));

  const casesBlock = (
    <section data-debtors-active className="min-w-0">
      <BlockTitle
        icon={<Clock size={14} />}
        title="Все должники"
        count={people.length}
        extra={formatRub(totalActiveSum)}
      />
      <div className="flex flex-col gap-1.5">
        {people.map((p) => {
          const lead = p.cases[0]!;
          return (
            <div
              key={p.key}
              role="button"
              tabIndex={0}
              data-person-row={p.name}
              onClick={() => onOpenCase(lead.id)}
              onKeyDown={(e) => e.key === "Enter" && onOpenCase(lead.id)}
              className="grid cursor-pointer grid-cols-[36px_1fr_auto] items-start gap-3 rounded-[12px] border border-border bg-white px-3 py-3 text-left transition-all hover:border-ink hover:shadow-card"
            >
              <Avatar name={p.name} photoKey={p.photoKey} />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold leading-tight text-ink">
                  {p.name}
                </div>
                {/* Причины — чипами, каждый открывает своё дело */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.cases.map((c) => {
                    const awaiting = isAwaitingPayment(c);
                    const check = c.action?.kind === "payment_check";
                    return (
                      <button
                        key={c.id}
                        type="button"
                        data-reason-chip={c.caseNumber}
                        title={`${c.caseNumber} · ${STAGE_LABEL[c.stage]}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCase(c.id);
                        }}
                        className={cn(
                          "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors hover:brightness-95",
                          REASON_CHIP[c.type],
                        )}
                      >
                        {REASON_LABEL[c.type]}
                        <span className="tabular-nums">{formatRub(c.remaining ?? c.totalAmount)}</span>
                        {awaiting && (
                          <span className="font-medium opacity-75">
                            · до {ruDate(c.paymentDueDate).slice(0, 5)}
                          </span>
                        )}
                        {check && <span className="font-bold text-red-700">· срок прошёл</span>}
                      </button>
                    );
                  })}
                </div>
                {/* Как платит: последний платёж и график */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-muted">
                  <span>
                    {p.lastPaid
                      ? `посл. платёж ${ruDate(p.lastPaid.at)} · ${formatRub(p.lastPaid.amount)}`
                      : "платежей не было"}
                  </span>
                  {p.overdueDays > 0 ? (
                    <span className="font-semibold text-red-700">
                      график: просрочка {p.overdueDays} дн
                    </span>
                  ) : p.nextDue ? (
                    <span className="text-emerald-700">
                      график соблюдает · след. {ruDate(p.nextDue).slice(0, 5)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-[16px] font-bold tabular-nums text-ink">
                  {formatRub(p.remaining)}
                </div>
                {p.paid > 0 && (
                  <div className="text-[11px] text-emerald-700">
                    оплачено {formatRub(p.paid)}
                  </div>
                )}
              </div>
            </div>
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
            <span className="sm:hidden">Все дела</span>
            <span className="hidden sm:inline">Все дела и архив</span>
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

type CaseRow = TodayDebtor & { action: TodayAction | null };

const REASON_LABEL: Record<DebtType, string> = {
  damage: "Ущерб",
  rental_overdue: "Аренда",
  buyout_overdue: "Выкуп",
  dtp_guilty: "ДТП",
  dtp_victim: "ДТП (страховая)",
  theft: "Угон",
};

const REASON_CHIP: Record<DebtType, string> = {
  damage: "border-orange-200 bg-orange-50 text-orange-800",
  rental_overdue: "border-slate-200 bg-slate-50 text-slate-700",
  buyout_overdue: "border-teal-200 bg-teal-50 text-teal-700",
  dtp_guilty: "border-red-200 bg-red-50 text-red-700",
  dtp_victim: "border-blue-200 bg-blue-50 text-blue-700",
  theft: "border-violet-200 bg-violet-50 text-violet-700",
};

type Person = {
  key: string;
  name: string;
  photoKey: string | null;
  cases: CaseRow[];
  remaining: number;
  paid: number;
  lastPaid: { at: string; amount: number } | null;
  overdueDays: number;
  nextDue: string | null;
};

/** Дела одного клиента — в одну строку; сортировка по сумме долга. */
function groupByPerson(rows: CaseRow[]): Person[] {
  const today = localYmd();
  const map = new Map<string, Person>();
  for (const c of rows) {
    const key = c.clientId != null ? `c${c.clientId}` : `d${c.id}`;
    const p =
      map.get(key) ??
      ({
        key,
        name: c.clientName,
        photoKey: c.clientPhotoKey ?? null,
        cases: [],
        remaining: 0,
        paid: 0,
        lastPaid: null,
        overdueDays: 0,
        nextDue: null,
      } as Person);
    p.cases.push(c);
    p.remaining += c.remaining ?? c.totalAmount;
    p.paid += c.paid ?? 0;
    p.photoKey = p.photoKey ?? c.clientPhotoKey ?? null;
    for (const pay of c.payments ?? []) {
      if (pay.paidAt) {
        if (!p.lastPaid || pay.paidAt > p.lastPaid.at)
          p.lastPaid = { at: pay.paidAt, amount: pay.paidAmount ?? pay.scheduledAmount };
      } else {
        const d = pay.scheduledDate.slice(0, 10);
        if (d < today) {
          const days = Math.round(
            (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${d}T00:00:00Z`).getTime()) /
              86_400_000,
          );
          p.overdueDays = Math.max(p.overdueDays, days);
        } else if (!p.nextDue || d < p.nextDue) p.nextDue = d;
      }
    }
    map.set(key, p);
  }
  for (const p of map.values())
    p.cases.sort((a, b) => (b.remaining ?? b.totalAmount) - (a.remaining ?? a.totalAmount));
  return [...map.values()].sort((a, b) => b.remaining - a.remaining);
}
