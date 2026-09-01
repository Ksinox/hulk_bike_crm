import { useMemo, useState } from "react";
import {
  Ban,
  Check,
  ChevronRight,
  FileText,
  Printer,
  Trash2,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast, confirmDialog } from "@/lib/toast";
import {
  PayMethodPicker,
  splitByMethod,
  type PayMethod,
} from "@/components/PayMethodPicker";
import { useMe } from "@/lib/api/auth";
import {
  buyoutContractUrl,
  useBuyoutPayment,
  useBuyoutPayments,
  useCancelBuyoutDeal,
  useDeleteBuyoutDeal,
  BUYOUT_STATUS_CLASS,
  BUYOUT_STATUS_LABEL,
  type BuyoutDeal,
} from "@/lib/api/buyout";
import { fmt, ruDate } from "@/pages/sales/salesUtils";

/**
 * Карточка сделки выкупа (01.09).
 *
 * Главное здесь — график: видно, что уже закрыто, что просрочено и что
 * ближайшее. Приём платежа гасит ближайшие непогашенные строки, поэтому
 * оператору не нужно выбирать, «за какой месяц» деньги: он просто вводит
 * сумму. Отдельная кнопка — полное досрочное погашение остатка.
 */

export function BuyoutDealCard({
  deal,
  onClose,
  onContinue,
  onOpenScooter,
}: {
  deal: BuyoutDeal;
  onClose: () => void;
  onContinue: (id: number) => void;
  onOpenScooter: (scooterId: number) => void;
}) {
  const { data: me } = useMe();
  const isDirector = me?.role === "director" || me?.role === "creator";
  const detail = useBuyoutPayments(deal.id);
  const cancel = useCancelBuyoutDeal();
  const del = useDeleteBuyoutDeal();
  const [payOpen, setPayOpen] = useState(false);

  const p = deal.progress;
  const unfinished = deal.status === "draft" || deal.status === "contract";
  const active = deal.status === "active";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[19px] font-extrabold text-ink">
              Выкуп #{String(deal.id).padStart(4, "0")}
            </h2>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-bold",
                BUYOUT_STATUS_CLASS[deal.status],
              )}
            >
              {BUYOUT_STATUS_LABEL[deal.status]}
            </span>
            {p.overdueCount > 0 && active && (
              <span className="rounded-full bg-red-soft px-2 py-0.5 text-[11px] font-bold text-red-ink">
                просрочка {p.overdueDays} дн · {fmt(p.overdueAmount)} ₽
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            {deal.clientName ?? "клиент не указан"}
            {deal.clientPhone && ` · ${deal.clientPhone}`}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-2 hover:bg-surface-soft hover:text-ink"
        >
          <X size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          {/* Прогресс выкупа */}
          <section className="rounded-2xl bg-surface-soft/50 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Выплачено
              </span>
              <span className="font-display text-[22px] font-extrabold tabular-nums text-ink">
                {p.percent}%
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700",
                  deal.status === "closed"
                    ? "bg-emerald-500"
                    : p.overdueCount > 0
                      ? "bg-red"
                      : "bg-blue-600",
                )}
                style={{ width: `${p.percent}%` }}
              />
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
              <Mini label="Внесено" value={`${fmt(p.paid + deal.downPayment)} ₽`} />
              <Mini label="Остаток" value={`${fmt(p.left)} ₽`} accent />
              <Mini
                label="Платежей"
                value={`${p.paidCount} из ${deal.schedule.length || deal.paymentsCount}`}
              />
            </div>
            {active && p.nextDue && (
              <div className="mt-2.5 rounded-xl bg-surface px-3 py-2 text-[12.5px] text-muted">
                Ближайший платёж{" "}
                <b className="text-ink">{fmt(p.nextDue.amount)} ₽</b> ·{" "}
                {ruDate(p.nextDue.date)}
              </div>
            )}
          </section>

          {/* Условия */}
          <Section title="Условия сделки">
            <Row label="Выкупная стоимость" value={`${fmt(deal.total)} ₽`} />
            <Row
              label="Из них наценка"
              value={`${fmt(deal.markup)} ₽ за ${deal.termMonths} мес`}
            />
            <Row label="Первоначальный взнос" value={`${fmt(deal.downPayment)} ₽`} />
            <Row
              label="График"
              value={`${deal.paymentsCount} × ${fmt(deal.paymentAmount)} ₽ ${deal.period === "week" ? "еженедельно" : "ежемесячно"}`}
            />
            <Row
              label="Метка на технике"
              value={deal.airtagConfirmed ? "установлена" : "не подтверждена"}
            />
          </Section>

          {/* Техника */}
          <Section title="Техника">
            <button
              type="button"
              disabled={deal.scooterId == null}
              onClick={() => deal.scooterId != null && onOpenScooter(deal.scooterId)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-soft/60 disabled:cursor-default"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold text-ink">
                  {deal.modelName || deal.scooterName || "—"}
                </span>
                <span className="block text-[12px] text-muted">
                  VIN {deal.vin || "—"}
                  {deal.engineNo && ` · двиг. ${deal.engineNo}`}
                </span>
              </span>
              {deal.scooterId != null && (
                <ChevronRight size={16} className="shrink-0 text-muted-2" />
              )}
            </button>
          </Section>

          {/* График платежей */}
          {deal.schedule.length > 0 && (
            <Section title={`График платежей · ${deal.schedule.length}`}>
              <div className="max-h-[320px] overflow-y-auto">
                {deal.schedule.map((r) => {
                  const closed = r.paidAmount >= r.amount;
                  const overdue =
                    !closed && new Date(`${r.dueDate}T23:59:59`) < new Date();
                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 border-b border-border/50 px-4 py-2 last:border-b-0"
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                          closed
                            ? "bg-emerald-100 text-emerald-700"
                            : overdue
                              ? "bg-red-soft text-red-ink"
                              : "bg-surface-soft text-muted-2",
                        )}
                      >
                        {closed ? <Check size={12} /> : r.seq}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold text-ink">
                          {ruDate(r.dueDate)}
                        </span>
                        {r.paidAmount > 0 && !closed && (
                          <span className="block text-[11px] text-muted">
                            внесено {fmt(r.paidAmount)} из {fmt(r.amount)} ₽
                          </span>
                        )}
                        {overdue && (
                          <span className="block text-[11px] font-semibold text-red-ink">
                            просрочен
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[13px] font-bold tabular-nums",
                          closed ? "text-muted-2 line-through" : "text-ink",
                        )}
                      >
                        {fmt(r.amount)} ₽
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* История платежей */}
          {(detail.data?.payments.length ?? 0) > 0 && (
            <Section title="Поступления">
              {detail.data!.payments.map((pay) => (
                <div
                  key={pay.id}
                  className="flex items-center gap-3 border-b border-border/50 px-4 py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold text-ink">
                      {pay.kind === "down_payment"
                        ? "Первоначальный взнос"
                        : pay.kind === "early_full"
                          ? "Досрочное погашение остатка"
                          : pay.kind === "early_partial"
                            ? "Платёж досрочно"
                            : "Платёж"}
                    </span>
                    <span className="block text-[11px] text-muted-2">
                      {ruDate(pay.paidAt)}
                      {pay.note ? ` · ${pay.note}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-bold tabular-nums text-emerald-700">
                    +{fmt(pay.amount)} ₽
                  </span>
                </div>
              ))}
            </Section>
          )}

          {/* Дисциплина клиента */}
          {detail.data && detail.data.discipline.onTime + detail.data.discipline.late > 0 && (
            <div className="rounded-2xl bg-surface-soft/50 px-4 py-3 text-[12.5px] text-muted">
              Платёжная дисциплина:{" "}
              <b className="text-ink">{detail.data.discipline.score} из 100</b> ·
              вовремя {detail.data.discipline.onTime}, с опозданием{" "}
              {detail.data.discipline.late}
              {detail.data.discipline.late > 0 &&
                ` (в среднем на ${detail.data.discipline.avgLateDays} дн)`}
            </div>
          )}

          {deal.cancelReason && (
            <div className="rounded-xl bg-red-soft px-3 py-2.5 text-[12.5px] text-red-ink">
              {deal.status === "defaulted" ? "Выкуп сорван" : "Сделка отменена"} ·
              причина: {deal.cancelReason}
            </div>
          )}

          {/* Документы */}
          <Section title="Документы">
            <div className="flex flex-wrap gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => window.open(buyoutContractUrl(deal.id, "html"), "_blank")}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[12.5px] font-bold text-white"
              >
                <Printer size={14} /> Договор
              </button>
              <button
                type="button"
                onClick={() => window.open(buyoutContractUrl(deal.id, "docx"), "_blank")}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-soft px-4 text-[12.5px] font-semibold text-ink"
              >
                <FileText size={14} /> Word
              </button>
            </div>
          </Section>
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        {unfinished && (
          <button
            type="button"
            onClick={() => onContinue(deal.id)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-blue-600 px-5 text-[13px] font-bold text-white"
          >
            Продолжить оформление
          </button>
        )}
        {active && (
          <button
            type="button"
            onClick={() => setPayOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-emerald-600 px-5 text-[13px] font-bold text-white transition-transform active:scale-[0.98]"
          >
            <Wallet size={15} /> Принять платёж
          </button>
        )}
        <div className="flex-1" />
        {deal.status !== "cancelled" && deal.status !== "closed" && (
          <button
            type="button"
            onClick={async () => {
              const ok = await confirmDialog({
                title: active ? "Сорвать выкуп?" : "Отменить сделку?",
                message: active
                  ? "Сделка будет помечена сорванной, техника вернётся в парк. График останется в истории."
                  : "Сделка будет отменена. Технику это не затронет.",
                confirmText: active ? "Сорвать выкуп" : "Отменить сделку",
                danger: true,
              });
              if (!ok) return;
              try {
                await cancel.mutateAsync({
                  id: deal.id,
                  status: active ? "defaulted" : "cancelled",
                });
                toast.success(active ? "Выкуп помечен сорванным" : "Сделка отменена");
                onClose();
              } catch {
                toast.error("Не удалось выполнить");
              }
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold text-muted hover:text-red-ink"
          >
            <Ban size={14} /> {active ? "Сорван" : "Отменить"}
          </button>
        )}
        {isDirector && (
          <button
            type="button"
            onClick={async () => {
              const ok = await confirmDialog({
                title: `Удалить выкуп #${String(deal.id).padStart(4, "0")}?`,
                message:
                  "Сделка, график и платежи будут удалены навсегда. В журнале останется запись с полными данными.",
                confirmText: "Удалить навсегда",
                danger: true,
              });
              if (!ok) return;
              try {
                await del.mutateAsync(deal.id);
                toast.success("Сделка удалена");
                onClose();
              } catch {
                toast.error("Не удалось удалить");
              }
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-2 hover:bg-red-soft hover:text-red-ink"
            title="Удалить сделку"
          >
            <Trash2 size={15} />
          </button>
        )}
      </footer>

      {payOpen && (
        <PaymentDialog deal={deal} onClose={() => setPayOpen(false)} />
      )}
    </div>
  );
}

/**
 * Приём платежа (переработано 01.09 по фидбэку).
 *
 * Подсказки сумм — только осмысленные и никогда больше остатка: раньше
 * предлагался «регулярный платёж» 60 000 при остатке 45 000, то есть
 * переплата. Теперь первым идёт то, что реально нужно внести сейчас
 * (просрочка или ближайший платёж), затем суммы, которыми клиент платил
 * раньше, и только в конце — весь остаток.
 *
 * Способ оплаты как везде в CRM: наличные, перевод или смешанно — с
 * разбивкой, иначе смешанную оплату не свести с кассой.
 */
function PaymentDialog({
  deal,
  onClose,
}: {
  deal: BuyoutDeal;
  onClose: () => void;
}) {
  const pay = useBuyoutPayment();
  const detail = useBuyoutPayments(deal.id);
  const p = deal.progress;

  /** Сколько нужно внести прямо сейчас — но не больше остатка. */
  const dueNow = Math.min(
    p.left,
    p.overdueAmount > 0 ? p.overdueAmount : p.nextDue?.amount ?? deal.paymentAmount,
  );

  const suggestions = useMemo(() => {
    const out: { value: number; label: string }[] = [];
    const add = (value: number, label: string) => {
      const v = Math.min(Math.round(value), p.left);
      if (v <= 0 || out.some((x) => x.value === v)) return;
      out.push({ value: v, label });
    };
    if (p.overdueAmount > 0) add(p.overdueAmount, "просрочка");
    if (p.nextDue) add(p.nextDue.amount, "ближайший");
    // Суммы, которыми клиент платил раньше — самые частые сверху.
    const freq = new Map<number, number>();
    for (const x of detail.data?.payments ?? []) {
      if (x.kind === "down_payment") continue;
      freq.set(x.amount, (freq.get(x.amount) ?? 0) + 1);
    }
    [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || b[0] - a[0])
      .slice(0, 2)
      .forEach(([v]) => add(v, "как обычно"));
    add(p.left, "весь остаток");
    return out.slice(0, 4);
  }, [p, detail.data, deal.paymentAmount]);

  const [amount, setAmount] = useState(String(dueNow || ""));
  const [method, setMethod] = useState<PayMethod>("cash");
  const [cashPart, setCashPart] = useState(0);

  const value = Number(amount) || 0;
  const { cash, transfer } = splitByMethod(Math.min(value, p.left), method, cashPart);
  const overpay = value > p.left;

  const send = async (payoff: boolean) => {
    const sum = payoff ? p.left : Math.min(value, p.left);
    if (sum <= 0) {
      toast.error("Укажите сумму");
      return;
    }
    try {
      const res = await pay.mutateAsync({
        id: deal.id,
        amount: sum,
        method: payoff ? "cash" : method,
        cashAmount: method === "mixed" ? cash : undefined,
        transferAmount: method === "mixed" ? transfer : undefined,
        payoff,
      });
      toast.success(
        res.closed
          ? "Выкуп закрыт — техника перешла клиенту"
          : `Платёж принят · остаток ${fmt(res.progress.left)} ₽`,
      );
      onClose();
    } catch {
      toast.error("Не удалось принять платёж");
    }
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 p-4 animate-backdrop-in">
      <div className="w-full max-w-[420px] rounded-2xl bg-surface p-5 shadow-card-lg animate-modal-in">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[16px] font-bold text-ink">Платёж по выкупу</div>
            <div className="mt-0.5 text-[12px] text-muted">
              Деньги гасят ближайшие непогашенные платежи. Осталось{" "}
              <b className="text-ink">{fmt(p.left)} ₽</b>.
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-2 hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {p.overdueAmount > 0 && (
          <div className="mt-3 rounded-xl bg-red-soft px-3 py-2 text-[12.5px] text-red-ink">
            Просрочено {fmt(p.overdueAmount)} ₽ ({p.overdueCount} платеж
            {p.overdueCount === 1 ? "" : p.overdueCount < 5 ? "а" : "ей"})
          </div>
        )}

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
            Сумма платежа
          </span>
          <span className="relative">
            <input
              autoFocus
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              className={cn(
                "h-14 w-full rounded-[16px] border-2 bg-surface pl-4 pr-10 font-display text-[24px] font-extrabold tabular-nums outline-none",
                overpay ? "border-orange-300" : "border-border focus:border-emerald-500",
              )}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[18px] font-bold text-muted-2">
              ₽
            </span>
          </span>
        </label>
        {overpay && (
          <div className="mt-1.5 text-[11.5px] text-orange-ink">
            Это больше остатка — примем {fmt(p.left)} ₽.
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((sg) => (
            <button
              key={sg.value}
              type="button"
              onClick={() => setAmount(String(sg.value))}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                Number(amount) === sg.value
                  ? "bg-ink text-white"
                  : "bg-surface-soft text-muted hover:text-ink",
              )}
            >
              {fmt(sg.value)} ₽
              <span className="ml-1 opacity-60">{sg.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-3">
          <PayMethodPicker
            total={Math.min(value, p.left)}
            method={method}
            onMethod={setMethod}
            cash={cashPart}
            onCash={setCashPart}
            compact
          />
        </div>

        <button
          type="button"
          onClick={() => send(false)}
          disabled={pay.isPending || value <= 0}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 text-[14px] font-bold text-white disabled:opacity-60"
        >
          <Check size={16} /> Принять{" "}
          {value > 0 ? `${fmt(Math.min(value, p.left))} ₽` : "платёж"}
        </button>
        {dueNow < p.left && (
          <button
            type="button"
            onClick={() => send(true)}
            disabled={pay.isPending || p.left <= 0}
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-ink text-[13px] font-bold text-white disabled:opacity-50"
          >
            <Zap size={14} /> Погасить остаток целиком — {fmt(p.left)} ₽
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-surface-soft/40">
      <div className="border-b border-border/60 px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
        {title}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 px-4 py-2.5">
      <span className="w-[150px] shrink-0 text-[11.5px] text-muted-2">{label}</span>
      <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{value}</span>
    </div>
  );
}

function Mini({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={cn("rounded-xl px-2 py-1.5", accent ? "bg-blue-50" : "bg-surface")}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-[14px] font-bold tabular-nums",
          accent ? "text-blue-700" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}
