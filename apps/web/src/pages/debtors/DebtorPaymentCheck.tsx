/**
 * Партия 23.10 — оплата ущерба по акту.
 *
 *  • «Ждём оплату до …» — срок из акта ещё не наступил: звонить рано.
 *    Можно отметить, что деньги уже пришли, или перенести срок.
 *  • Срок прошёл — «Пришла ли оплата?»: Да (вся) / Частично (сумма + сколько
 *    дней ждать остаток — CRM спросит снова) / Нет (дело — в прозвон).
 *  • Пеня по п. 5.7 договора — 1 000 ₽ за каждый день неоплаты ущерба.
 *    По умолчанию выключена: решает менеджер.
 */
import { useState } from "react";
import { CalendarClock, Check, Clock, HelpCircle, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePatchDebtor, usePaymentCheck } from "@/lib/api/debtors";
import {
  formatRub,
  isAwaitingPayment,
  isClosed,
  needsPaymentCheck,
  ruDate,
  type DebtorDetail,
  type PaymentMethod,
} from "@/lib/debtors/types";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/lib/toast";
import { isTouchPrimary } from "@/lib/useIsMobile";

const H = isTouchPrimary() ? "h-12" : "h-10";

type Answer = "yes" | "partial" | "no";

export function DebtorPaymentCheck({ d }: { d: DebtorDetail }) {
  const check = usePaymentCheck();
  const patch = usePatchDebtor();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amountStr, setAmountStr] = useState("");
  const [days, setDays] = useState(3);
  const [moving, setMoving] = useState(false);
  const [newDue, setNewDue] = useState<string | null>(d.paymentDueDate);

  if (isClosed(d.stage)) return null;
  const awaiting = isAwaitingPayment(d);
  const due = needsPaymentCheck(d);
  const amount = Math.max(0, parseInt(amountStr.replace(/\D/g, "") || "0", 10));

  const submit = async () => {
    if (!answer) return;
    try {
      await check.mutateAsync({
        id: d.id,
        answer,
        method,
        amount: answer === "partial" ? amount : undefined,
        days: answer === "partial" ? days : undefined,
      });
      toast.success(
        answer === "yes"
          ? "Оплата принята — дело закрыто"
          : answer === "partial"
            ? "Частичная оплата принята"
            : "Дело в работе",
        answer === "partial"
          ? `Остаток ${formatRub(d.remaining - amount)} — спросим через ${days} дн`
          : answer === "no"
            ? "Клиент появится в «Прозвоне»"
            : undefined,
      );
      setAnswer(null);
      setAmountStr("");
    } catch (e) {
      toast.error("Не получилось", (e as Error).message);
    }
  };

  const saveDue = async () => {
    if (!newDue) return;
    try {
      await patch.mutateAsync({ id: d.id, patch: { paymentDueDate: newDue } });
      toast.success("Срок перенесён", `Ждём оплату до ${ruDate(newDue)}`);
      setMoving(false);
    } catch (e) {
      toast.error("Не сохранено", (e as Error).message);
    }
  };

  const partialOk = amount > 0 && amount < d.remaining;

  return (
    <>
      {(awaiting || due) && (
        <div
          data-payment-check={due ? "due" : "awaiting"}
          className={cn(
            "overflow-hidden rounded-2xl border bg-surface shadow-card-sm",
            due ? "border-red-200" : "border-blue-100",
          )}
        >
          <div
            className={cn(
              "border-l-[3px] p-5",
              due ? "border-red-500" : "border-blue-500",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  due ? "bg-red-soft text-red-ink" : "bg-blue-50 text-blue-700",
                )}
              >
                {due ? <HelpCircle size={18} /> : <Clock size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[17px] font-bold leading-tight text-ink">
                  {due
                    ? "Пришла ли оплата?"
                    : `Ждём оплату до ${ruDate(d.paymentDueDate)}`}
                </div>
                <div className="mt-1 text-[12.5px] leading-snug text-muted">
                  {due
                    ? `Срок по акту — ${ruDate(d.paymentDueDate)}. К оплате ${formatRub(d.remaining)}.`
                    : `По акту о повреждениях — ${formatRub(d.remaining)}. В этот день CRM спросит, пришли ли деньги; до этого звонить не нужно.`}
                </div>
              </div>
            </div>

            {/* Ответ: три варианта (на «ждём» — только «уже пришла») */}
            <div
              className={cn(
                "mt-4 grid gap-2",
                due ? "grid-cols-3" : "grid-cols-2",
              )}
            >
              <AnswerBtn
                active={answer === "yes"}
                tone="green"
                onClick={() => setAnswer(answer === "yes" ? null : "yes")}
              >
                {due ? "Да" : "Уже пришла"}
              </AnswerBtn>
              {due ? (
                <>
                  <AnswerBtn
                    active={answer === "partial"}
                    tone="blue"
                    onClick={() =>
                      setAnswer(answer === "partial" ? null : "partial")
                    }
                  >
                    Частично
                  </AnswerBtn>
                  <AnswerBtn
                    active={answer === "no"}
                    tone="red"
                    onClick={() => setAnswer(answer === "no" ? null : "no")}
                  >
                    Нет
                  </AnswerBtn>
                </>
              ) : (
                <AnswerBtn
                  active={moving}
                  tone="ink"
                  onClick={() => {
                    setMoving((v) => !v);
                    setAnswer(null);
                  }}
                >
                  <CalendarClock size={14} /> Другой срок
                </AnswerBtn>
              )}
            </div>

            {moving && !due && (
              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-[12px] bg-surface-soft p-3">
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                    Ждём оплату до
                  </div>
                  <DatePicker value={newDue} onChange={(v) => setNewDue(v)} />
                </div>
                <button
                  type="button"
                  onClick={saveDue}
                  disabled={!newDue || patch.isPending}
                  className={cn(
                    H,
                    "inline-flex items-center gap-1.5 rounded-[10px] bg-ink px-4 text-[13px] font-semibold text-white disabled:opacity-40",
                  )}
                >
                  <Check size={14} /> Сохранить
                </button>
              </div>
            )}

            {answer && (
              <div className="mt-3 flex flex-col gap-3 rounded-[12px] bg-surface-soft p-3">
                {answer === "no" ? (
                  <div className="text-[13px] leading-snug text-ink-2">
                    Дело уйдёт в работу: клиент появится в «Прозвоне», дальше —
                    звонки, график или досудебка.
                  </div>
                ) : (
                  <>
                    {answer === "partial" && (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                          Сколько пришло
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            inputMode="numeric"
                            autoFocus
                            value={amountStr}
                            onChange={(e) =>
                              setAmountStr(e.target.value.replace(/\D/g, ""))
                            }
                            placeholder="0"
                            className={cn(
                              H,
                              "w-36 rounded-[10px] border border-border bg-white px-3 text-right font-display text-[17px] font-bold tabular-nums text-ink outline-none focus:border-ink",
                            )}
                          />
                          <span className="text-[13px] text-muted">
                            ₽ из {formatRub(d.remaining)}
                          </span>
                        </div>
                      </div>
                    )}
                    {answer === "yes" && (
                      <div className="text-[13px] text-ink-2">
                        Принимаем <b className="text-ink">{formatRub(d.remaining)}</b>{" "}
                        — акт будет оплачен, дело закроется.
                      </div>
                    )}
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                        Как пришли деньги
                      </div>
                      <div className="flex gap-2">
                        {(["cash", "transfer"] as const).map((m) => (
                          <Chip
                            key={m}
                            active={method === m}
                            onClick={() => setMethod(m)}
                          >
                            {m === "cash" ? "Наличные" : "Перевод"}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    {answer === "partial" && (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                          Остаток ждём ещё
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[3, 7, 14].map((n) => (
                            <Chip
                              key={n}
                              active={days === n}
                              onClick={() => setDays(n)}
                            >
                              {n} дн
                            </Chip>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={submit}
                  disabled={check.isPending || (answer === "partial" && !partialOk)}
                  className={cn(
                    H,
                    "inline-flex items-center justify-center gap-2 rounded-[12px] bg-ink px-5 text-[14px] font-semibold text-white disabled:opacity-40",
                  )}
                >
                  <Check size={15} />
                  {answer === "no" ? "В работу" : "Подтвердить"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {d.type === "damage" && d.damageReport && <PenaltyToggle d={d} />}
    </>
  );
}

/** Пеня по п. 5.7 договора — тумблер (по умолчанию выкл). */
function PenaltyToggle({ d }: { d: DebtorDetail }) {
  const patch = usePatchDebtor();
  const on = d.penaltyEnabled;
  const toggle = async () => {
    try {
      await patch.mutateAsync({ id: d.id, patch: { penaltyEnabled: !on } });
      toast.success(on ? "Пеня не считается" : "Пеня считается", "п. 5.7 договора");
    } catch (e) {
      toast.error("Не сохранено", (e as Error).message);
    }
  };
  return (
    <div
      data-penalty={on ? "on" : "off"}
      className="rounded-2xl border border-border bg-surface p-4 shadow-card-sm"
    >
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={toggle}
        disabled={patch.isPending}
        className="flex w-full items-start gap-3 text-left disabled:opacity-60"
      >
        <Scale size={17} className="mt-0.5 shrink-0 text-muted-2" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-ink">
            Пеня по п. 5.7 договора
          </span>
          <span className="mt-0.5 block text-[12px] leading-snug text-muted">
            +{d.penaltyPerDay.toLocaleString("ru-RU")} ₽ за каждый день неоплаты
            ущерба
            {on && d.penaltyFrom
              ? ` · с ${ruDate(d.penaltyFrom)}${d.penaltyUntil ? ` по ${ruDate(d.penaltyUntil)}` : ""}`
              : ""}
          </span>
        </span>
        <span
          className={cn(
            "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
            on ? "bg-red-500" : "bg-border",
          )}
        >
          <span
            className={cn(
              "absolute h-5 w-5 rounded-full bg-white shadow transition-transform",
              on ? "translate-x-6" : "translate-x-1",
            )}
          />
        </span>
      </button>
      {on && (
        <div className="mt-3 flex items-center justify-between rounded-[10px] bg-red-soft/40 px-3 py-2 text-[12.5px]">
          <span className="text-ink-2">
            Начислено за {d.penaltyDays} дн
          </span>
          <b className="font-display text-[15px] tabular-nums text-red-ink">
            {formatRub(d.penalty)}
          </b>
        </div>
      )}
    </div>
  );
}

function AnswerBtn({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "green" | "blue" | "red" | "ink";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const idle = {
    green: "border-emerald-100 bg-emerald-50 text-emerald-700 hover:border-emerald-300",
    blue: "border-blue-100 bg-blue-50 text-blue-700 hover:border-blue-300",
    red: "border-red-100 bg-red-50 text-red-700 hover:border-red-300",
    ink: "border-border bg-white text-ink-2 hover:border-ink",
  }[tone];
  const act = {
    green: "border-emerald-600 bg-emerald-600 text-white",
    blue: "border-blue-600 bg-blue-600 text-white",
    red: "border-red-600 bg-red-600 text-white",
    ink: "border-ink bg-ink text-white",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        H,
        "inline-flex items-center justify-center gap-1.5 rounded-[10px] border text-[13.5px] font-semibold transition-colors",
        active ? act : idle,
      )}
    >
      {children}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        isTouchPrimary() ? "h-11" : "h-9",
        "inline-flex items-center rounded-full border px-4 text-[13px] font-semibold transition-colors",
        active
          ? "border-ink bg-ink text-white"
          : "border-border bg-white text-ink-2 hover:border-ink",
      )}
    >
      {children}
    </button>
  );
}
