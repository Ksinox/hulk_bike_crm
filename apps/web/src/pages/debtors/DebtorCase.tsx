/**
 * Карточка дела (Case workspace) — рабочее место по одному должнику.
 *
 * Раскладка (десктоп): шапка-полоса + две колонки.
 *   ЛЕВО (деньги):  прогресс-диаграмма → график платежей → хронология.
 *   ПРАВО (sticky): «Следующий шаг» (стадия+рекомендация+1 primary) →
 *                   «Связь с должником» (звонок + заметки).
 * Цель — с первого взгляда видно «сколько долга / что платится» слева и
 * «что сделать / как связаться» справа. Стиль — фирменный (brand-spec).
 */
import { useState } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  Check,
  Phone,
  PhoneOff,
  CalendarClock,
  CalendarRange,
  Ban,
  StickyNote,
  Wallet,
  Bike,
  UserRound,
  ArrowUpRight,
} from "lucide-react";
import { navigate } from "@/app/navigationStore";
import { fileUrl } from "@/lib/files";
import { DebtorPaymentCheck } from "./DebtorPaymentCheck";
import {
  useDebtor,
  useTransitionDebtor,
  useLogCall,
  useAddNote,
} from "@/lib/api/debtors";
import {
  STAGE_LABEL,
  TYPE_LABEL,
  formatRub,
  isAwaitingPayment,
  isClosed,
  localYmd,
  needsPaymentCheck,
  ruDate,
  type CallOutcome,
  type DebtType,
  type Stage,
} from "@/lib/debtors/types";
import { ScheduleBuilderDialog } from "./ScheduleBuilderDialog";
import { DamageDebtorActSection } from "./DamageDebtorActSection";
import { toast, confirmDialog } from "@/lib/toast";
import { isTouchPrimary } from "@/lib/useIsMobile";
import { DatePicker } from "@/components/ui/date-picker";

/** На пальце кнопки дела — не мельче 44px, на мыши остаются компактными. */
const TAP = isTouchPrimary() ? "min-h-[44px] " : "";

// Локальная копия логики state machine для UI (зеркало бэка).
// Зеркало TRANSITIONS бэка (для отрисовки кнопок). closed_paid здесь НЕ
// перечисляем — закрытие «оплачено» происходит авто при полном погашении
// или кнопкой «Закрыть — долг погашен» (см. primaryAction). Прочие закрытия
// (recovered/settled/court/written_off) — управленческие, без денег.
const NEXT_TRANSITIONS: Record<DebtType, Partial<Record<Stage, { to: Stage; label: string; primary?: boolean }[]>>> = {
  dtp_guilty: {
    created: [
      { to: "pretrial", label: "Начать досудебку", primary: true },
      { to: "closed_settled", label: "Договорились — мировая" },
      { to: "closed_written_off", label: "Списать долг" },
    ],
    pretrial: [
      { to: "payment_schedule", label: "Признал — график", primary: true },
      { to: "lawyer", label: "Не признал — юристу" },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    lawyer: [
      { to: "payment_schedule", label: "Юрист убедил — график", primary: true },
      { to: "court", label: "В суд" },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    payment_schedule: [
      { to: "lawyer", label: "Перестал платить — юристу" },
      { to: "closed_written_off", label: "Списать остаток" },
    ],
    court: [
      { to: "closed_court", label: "Решение суда", primary: true },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
  },
  dtp_victim: {
    created: [
      { to: "insurance_docs", label: "Документы в страховую", primary: true },
      { to: "closed_written_off", label: "Не обращаемся — закрыть" },
    ],
    insurance_docs: [
      { to: "insurance_eval", label: "Оценка назначена", primary: true },
      { to: "closed_written_off", label: "Отказ страховой — списать" },
    ],
    insurance_eval: [
      { to: "insurance_wait", label: "Оценка получена", primary: true },
      { to: "lawyer", label: "Спор со страховой — юристу" },
      { to: "closed_written_off", label: "Отказ — списать" },
    ],
    insurance_wait: [
      { to: "closed_paid", label: "Выплата получена", primary: true },
      { to: "lawyer", label: "Занизили — юристу" },
      { to: "closed_written_off", label: "Отказ — списать" },
    ],
    lawyer: [
      { to: "court", label: "В суд на страховую", primary: true },
      { to: "closed_settled", label: "Урегулировали — мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    court: [
      { to: "closed_court", label: "Решение суда", primary: true },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
  },
  damage: {
    created: [
      { to: "payment_schedule", label: "Создать график", primary: true },
      { to: "closed_settled", label: "Договорились — мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    payment_schedule: [
      { to: "lawyer", label: "Нарушения — юристу" },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать остаток" },
    ],
    lawyer: [
      { to: "payment_schedule", label: "Возобновить график", primary: true },
      { to: "court", label: "В суд" },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    court: [
      { to: "closed_court", label: "Решение суда", primary: true },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
  },
  theft: {
    created: [
      { to: "pretrial", label: "Связаться с клиентом", primary: true },
      { to: "closed_recovered", label: "Скутер вернулся" },
      { to: "police", label: "Заявление в полицию" },
      { to: "closed_written_off", label: "Списать (скутер потерян)" },
    ],
    pretrial: [
      { to: "payment_schedule", label: "Согласен выкупить — график", primary: true },
      { to: "closed_recovered", label: "Скутер вернулся" },
      { to: "police", label: "Не признал — полиция" },
      { to: "closed_written_off", label: "Списать" },
    ],
    payment_schedule: [
      { to: "closed_recovered", label: "Скутер вернулся — закрыть" },
      { to: "lawyer", label: "Перестал платить — юристу" },
      { to: "closed_written_off", label: "Списать остаток" },
    ],
    police: [
      { to: "criminal_case", label: "Уголовное дело возбуждено", primary: true },
      { to: "closed_recovered", label: "Скутер вернулся" },
      { to: "closed_settled", label: "Договорились — мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    criminal_case: [
      { to: "closed_court", label: "Приговор", primary: true },
      { to: "closed_recovered", label: "Скутер вернулся" },
      { to: "closed_written_off", label: "Не нашли — списать" },
    ],
    lawyer: [
      { to: "payment_schedule", label: "Возобновить выкуп", primary: true },
      { to: "court", label: "В суд" },
      { to: "closed_recovered", label: "Скутер вернулся" },
      { to: "closed_written_off", label: "Списать" },
    ],
    court: [
      { to: "closed_court", label: "Решение суда", primary: true },
      { to: "closed_recovered", label: "Скутер вернулся" },
      { to: "closed_written_off", label: "Списать" },
    ],
  },
  rental_overdue: {
    created: [
      { to: "payment_schedule", label: "Создать график", primary: true },
      { to: "closed_settled", label: "Договорились — мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    payment_schedule: [
      { to: "lawyer", label: "Нарушения — юристу" },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать остаток" },
    ],
    lawyer: [
      { to: "payment_schedule", label: "Возобновить", primary: true },
      { to: "court", label: "В суд" },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    court: [
      { to: "closed_court", label: "Решение суда", primary: true },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
  },
};

const TYPE_BG: Record<DebtType, string> = {
  dtp_guilty: "bg-red-50 text-red-700 border-red-100",
  dtp_victim: "bg-blue-50 text-blue-700 border-blue-100",
  damage: "bg-orange-50 text-orange-700 border-orange-100",
  theft: "bg-violet-50 text-violet-700 border-violet-100",
  rental_overdue: "bg-slate-50 text-slate-600 border-slate-200",
};

export function DebtorCase({
  id,
  onBack,
  onOpenPayment,
}: {
  id: number;
  onBack: () => void;
  onOpenPayment: (paymentN?: number) => void;
}) {
  const q = useDebtor(id);
  const transition = useTransitionDebtor();
  const logCall = useLogCall();
  const addNote = useAddNote();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Панель связи: текст разговора, флаг ввода даты обещания, дата, заметка.
  const [callNote, setCallNote] = useState("");
  const [showPromised, setShowPromised] = useState(false);
  const [promisedDate, setPromisedDate] = useState("");
  const [noteText, setNoteText] = useState("");

  if (q.isLoading) {
    return <div className="flex h-64 items-center justify-center text-muted">Загрузка…</div>;
  }
  if (!q.data) return <div className="text-muted">Не найдено</div>;
  const d = q.data;
  const closed = isClosed(d.stage);
  const transitions = NEXT_TRANSITIONS[d.type]?.[d.stage] ?? [];
  const primary = transitions.find((t) => t.primary);
  const secondary = transitions.filter((t) => !t.primary);
  // Делим вторичные ходы на «переходы по делу» (ссылки) и «закрытия» дела
  // (отдельная группа «Закрыть дело»). Закрытия не требуют денег — это
  // управленческие исходы (скутер вернулся, мировая, суд, списание).
  const moves = secondary.filter((t) => !t.to.startsWith("closed_"));
  const closings = secondary.filter((t) => t.to.startsWith("closed_"));
  // Партия 23.10: остаток считает сервер (у дела ущерба — по акту + пеня).
  const remaining = d.remaining ?? Math.max(0, d.totalAmount - d.paid);

  const onTransition = async (to: Stage, label: string, reason?: string) => {
    try {
      await transition.mutateAsync({ id, toStage: to, reason });
      toast.success("Стадия обновлена", `Дело перешло: ${label}`);
    } catch (e) {
      toast.error("Не удалось", (e as Error).message);
    }
  };

  // Закрытие дела — подтверждаем (необратимое действие) и фиксируем причину.
  const onClose = async (to: Stage, label: string) => {
    const ok = await confirmDialog({
      title: "Закрыть дело?",
      message: `«${STAGE_LABEL[to]}» — ${label}. Дело уйдёт в архив, клиент перестанет быть должником по нему.`,
      confirmText: "Закрыть дело",
      cancelText: "Отмена",
    });
    if (!ok) return;
    await onTransition(to, label, label);
  };

  // «Создать график»/«…график» → открыть конструктор: он сам построит
  // строки и переведёт дело в стадию «График платежей».
  const handleStep = (to: Stage, label: string) => {
    if (to === "payment_schedule") {
      setScheduleOpen(true);
      return;
    }
    void onTransition(to, label);
  };

  const OUTCOME_LABEL: Record<CallOutcome, string> = {
    answered: "Дозвонился, поговорили",
    no_answer: "Не дозвонился",
    promised: "Обещал заплатить",
    refused: "Отказался платить",
  };

  const onCall = async (outcome: CallOutcome, opts?: { promisedDate?: string }) => {
    try {
      await logCall.mutateAsync({
        id,
        outcome,
        promisedDate: opts?.promisedDate,
        note: callNote.trim() || undefined,
      });
      setCallNote("");
      setShowPromised(false);
      setPromisedDate("");
      toast.success("Звонок записан", OUTCOME_LABEL[outcome]);
    } catch (e) {
      toast.error("Не записано", (e as Error).message);
    }
  };

  const onSaveNote = async () => {
    if (!noteText.trim()) return;
    try {
      await addNote.mutateAsync({ id, text: noteText.trim() });
      setNoteText("");
      toast.success("Заметка добавлена");
    } catch (e) {
      toast.error("Не сохранено", (e as Error).message);
    }
  };

  // Primary-действие панели «Следующий шаг» — основано на реальности, а не
  // на ручном флипе статуса:
  //  • на графике платежей основное действие — ПРИНЯТЬ ПЛАТЁЖ (деньги).
  //    Закрытие «оплачено» происходит автоматически при полном погашении.
  //    Если долг уже покрыт, но дело почему-то не закрылось — даём кнопку
  //    «Закрыть — долг погашен» (у неё есть основание: paid ≥ total).
  //  • на прочих стадиях primary — ход по дереву (досудебка/график/суд…).
  let primaryAction: { label: string; onClick: () => void; pay?: boolean } | null =
    null;
  if (!closed && d.stage === "payment_schedule") {
    primaryAction =
      remaining > 0
        ? { label: "Зафиксировать платёж", onClick: () => onOpenPayment(), pay: true }
        : { label: "Закрыть — долг погашен", onClick: () => onTransition("closed_paid", "Долг погашен") };
  } else if (!closed && primary) {
    primaryAction = {
      label: primary.label,
      onClick: () => handleStep(primary.to, primary.label),
    };
  }

  // ── Статус дела одной строкой: что сейчас происходит и что делать ──
  const today = localYmd();
  const lastCall = d.calls[0] ?? null;
  const status: { tone: "green" | "blue" | "red" | "amber"; text: string } = closed
    ? {
        tone: "green",
        text: `Закрыто · ${STAGE_LABEL[d.stage]}${d.closedReason ? ` · ${d.closedReason}` : ""}`,
      }
    : isAwaitingPayment(d, today)
      ? {
          tone: "blue",
          text: `Ждём оплату по акту до ${ruDate(d.paymentDueDate)} — звонить пока не нужно`,
        }
      : needsPaymentCheck(d, today)
        ? {
            tone: "red",
            text: `Срок оплаты ${ruDate(d.paymentDueDate)} прошёл — отметьте, пришла ли оплата`,
          }
        : d.overdueDays > 0
          ? {
              tone: "red",
              text: `Платёж по графику просрочен на ${d.overdueDays} дн · ${formatRub(d.overdueAmount)}`,
            }
          : {
              tone: "amber",
              text: `В работе · ${STAGE_LABEL[d.stage]}${
                lastCall
                  ? ` · звонок ${ruDateTime(lastCall.createdAt)}${
                      lastCall.outcome === "promised" && lastCall.promisedDate
                        ? `, обещал к ${ruDate(lastCall.promisedDate)}`
                        : ""
                    }`
                  : " · звонков ещё не было"
              }`,
            };
  const STATUS_CLS = {
    green: "bg-emerald-50 text-emerald-800 border-emerald-100",
    blue: "bg-blue-50 text-blue-800 border-blue-100",
    red: "bg-red-50 text-red-800 border-red-100",
    amber: "bg-amber-50 text-amber-900 border-amber-100",
  }[status.tone];
  const STATUS_DOT = {
    green: "bg-emerald-500",
    blue: "bg-blue-500",
    red: "bg-red-500",
    amber: "bg-amber-500",
  }[status.tone];
  const paidPct =
    d.totalAmount > 0 ? Math.min(100, Math.round((d.paid / d.totalAmount) * 100)) : 0;

  // ── Хронология: этапы, звонки, заметки и платежи — одной лентой ──
  type Ev = { at: string; key: string; tone: string; text: React.ReactNode };
  const events: Ev[] = [
    ...d.stageEvents.map((e) => ({
      at: e.createdAt,
      key: `s${e.id}`,
      tone: "bg-amber-400",
      text: (
        <>
          {e.fromStage ? `${STAGE_LABEL[e.fromStage]} → ` : ""}
          <b className="text-ink">{STAGE_LABEL[e.toStage]}</b>
          {e.reason && <span className="text-muted"> · {e.reason}</span>}
        </>
      ),
    })),
    ...d.calls.map((c) => ({
      at: c.createdAt,
      key: `c${c.id}`,
      tone: "bg-blue-500",
      text: (
        <>
          Звонок — <b className="text-ink">{OUTCOME_SHORT[c.outcome]}</b>
          {c.promisedDate && <> · обещал к {ruDate(c.promisedDate)}</>}
          {c.note && <span className="text-muted"> · {c.note}</span>}
        </>
      ),
    })),
    ...d.notes.map((n) => ({
      at: n.createdAt,
      key: `n${n.id}`,
      tone: "bg-slate-400",
      text: <>{n.text}</>,
    })),
    ...d.payments
      .filter((p) => p.paidAt)
      .map((p) => ({
        at: p.paidAt!,
        key: `p${p.id}`,
        tone: "bg-emerald-500",
        text: (
          <>
            Платёж <b className="text-emerald-700">{formatRub(p.paidAmount ?? 0)}</b> ·{" "}
            {p.paidMethod === "cash" ? "наличные" : "перевод"}
            {p.note && <span className="text-muted"> · {p.note}</span>}
          </>
        ),
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const canPay = !closed && remaining > 0;

  // ── Блоки ──
  const hero = (
    <header
      data-case-hero
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card-sm"
    >
      <div className="p-4 sm:p-6">
        <button
          type="button"
          onClick={onBack}
          className={`${TAP}mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink`}
        >
          <ArrowLeft size={13} />
          Все дела
        </button>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          {/* Кто */}
          <div className="flex min-w-0 items-start gap-4">
            <CaseAvatar name={d.displayName} photoKey={d.clientPhotoKey ?? null} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[11.5px] font-semibold ${TYPE_BG[d.type]}`}
                >
                  {TYPE_LABEL[d.type]}
                </span>
                <span className="inline-flex h-6 items-center rounded-full border border-border bg-surface-soft px-2.5 text-[11.5px] font-semibold text-ink-2">
                  {STAGE_LABEL[d.stage]}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-2">
                  {d.caseNumber}
                </span>
              </div>
              <h2 className="mt-1.5 font-display text-[24px] font-bold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[30px]">
                {d.displayName}
              </h2>
              <a
                href={`tel:${d.displayPhone}`}
                className={`${TAP}mt-1 inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-2 hover:text-blue-700`}
              >
                <Phone size={14} className="text-blue-600" />
                {d.displayPhone}
              </a>
              {(d.clientId != null || d.relatedRentalId != null) && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {d.clientId != null && (
                    <button
                      type="button"
                      data-open-client
                      onClick={() =>
                        navigate({
                          route: "clients",
                          clientId: d.clientId!,
                          from: { route: "debtors" },
                        })
                      }
                      className={`${TAP}inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-[12.5px] font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink`}
                    >
                      <UserRound size={13} className="text-blue-600" />
                      Карточка клиента
                      <ArrowUpRight size={12} className="text-muted-2" />
                    </button>
                  )}
                  {d.relatedRentalId != null && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate({
                          route: "rentals",
                          rentalId: d.relatedRentalId!,
                          from: { route: "debtors" },
                        })
                      }
                      className={`${TAP}inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-[12.5px] font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink`}
                    >
                      <Bike size={13} className="text-blue-600" />
                      Аренда #{String(d.relatedRentalId).padStart(4, "0")}
                      <ArrowUpRight size={12} className="text-muted-2" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Сколько */}
          <div className="w-full shrink-0 lg:w-[400px]">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-2">
                  {closed ? "Итог" : "Осталось взыскать"}
                </div>
                <div
                  data-case-remaining
                  className={`font-display text-[34px] font-extrabold leading-none tracking-[-0.02em] tabular-nums sm:text-[40px] ${
                    closed || remaining === 0 ? "text-emerald-700" : "text-red-ink"
                  }`}
                >
                  {formatRub(closed ? d.paid : remaining)}
                </div>
              </div>
              <div className="pb-1 text-right text-[12.5px] leading-snug text-muted">
                <div>
                  оплачено <b className="text-emerald-700">{formatRub(d.paid)}</b>
                </div>
                <div>
                  из <b className="text-ink">{formatRub(d.totalAmount)}</b>
                </div>
              </div>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-red-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width]"
                style={{ width: `${paidPct}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[11.5px] text-muted-2">
              <span>{paidPct}% погашено</span>
              {d.penalty > 0 && (
                <span className="font-semibold text-red-ink">
                  в т.ч. пеня {formatRub(d.penalty)}
                </span>
              )}
            </div>
            {!closed && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <a
                  href={`tel:${d.displayPhone}`}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border border-emerald-200 bg-emerald-50 text-[14px] font-semibold text-emerald-800 transition-colors hover:border-emerald-400"
                >
                  <Phone size={16} /> Позвонить
                </a>
                <button
                  type="button"
                  data-case-pay
                  disabled={!canPay}
                  onClick={() => onOpenPayment()}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] bg-ink text-[14px] font-semibold text-white shadow-card-sm transition-transform hover:-translate-y-0.5 disabled:opacity-40"
                >
                  <Wallet size={16} /> Принять платёж
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Статус — одной строкой во всю ширину */}
      <div
        data-case-status={status.tone}
        className={`flex items-center gap-2.5 border-t px-4 py-2.5 text-[13px] font-medium sm:px-6 ${STATUS_CLS}`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT}`} />
        <span className="min-w-0">{status.text}</span>
      </div>
    </header>
  );

  const paymentsCard = (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <Wallet size={16} className="text-muted-2" />
          Платежи
          {d.payments.length > 0 && (
            <span className="text-[12.5px] font-normal text-muted">
              · {d.payments.filter((p) => p.paidAt).length} из {d.payments.length}
            </span>
          )}
        </div>
        {!closed && (
          <button
            type="button"
            onClick={() => setScheduleOpen(true)}
            className={`${TAP}inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[12px] font-semibold text-muted hover:border-ink hover:text-ink`}
          >
            <CalendarRange size={12} />
            {d.payments.some((p) => !p.paidAt) ? "Пересоздать график" : "Разбить на график"}
          </button>
        )}
      </div>
      {d.payments.length === 0 ? (
        <div className="rounded-[12px] bg-surface-soft px-4 py-3 text-[13px] leading-relaxed text-muted">
          Платежей ещё не было. Деньги пришли — «Принять платёж». Клиент платит
          частями — «Разбить на график», и каждый платёж отмечается в строке.
        </div>
      ) : (
        <div className="space-y-1">
          {d.payments.map((p) => {
            const paid = p.paidAt != null;
            const overdue = !paid && p.scheduledDate < today;
            return (
              <div
                key={p.id}
                className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] ${
                  paid ? "bg-emerald-50" : overdue ? "bg-red-50" : "bg-surface-soft/60"
                }`}
              >
                <div className="min-w-0">
                  <div
                    className={
                      paid
                        ? "font-semibold text-emerald-800"
                        : overdue
                          ? "font-semibold text-red-700"
                          : "font-semibold text-ink"
                    }
                  >
                    {paid
                      ? `${ruDate(p.paidAt!)} · ${p.paidMethod === "transfer" ? "перевод" : "наличные"}`
                      : `${ruDate(p.scheduledDate)} · ${overdue ? "просрочен" : "по графику"}`}
                  </div>
                  {p.note && (
                    <div className="mt-0.5 truncate text-[11.5px] text-muted">{p.note}</div>
                  )}
                </div>
                <span className="font-display text-[14px] font-bold tabular-nums text-ink">
                  {formatRub(p.paidAmount ?? p.scheduledAmount)}
                </span>
                {paid ? (
                  <Check size={16} className="text-emerald-600" />
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenPayment(p.n)}
                    className={`${TAP}inline-flex items-center rounded-full bg-ink px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-[#16213a]`}
                  >
                    Принять
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const nextStepCard = !closed && (moves.length > 0 || closings.length > 0 || primaryAction || d.recommendation) && (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
        Ход дела
      </div>
      {d.recommendation && (
        <div className="mt-2 flex items-start gap-2 rounded-[12px] bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
          <span>{d.recommendation.reason}</span>
        </div>
      )}
      {primaryAction && !primaryAction.pay && (
        <button
          type="button"
          onClick={primaryAction.onClick}
          disabled={transition.isPending}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-ink bg-white px-4 text-[14px] font-semibold text-ink transition-colors hover:bg-ink hover:text-white disabled:opacity-50"
        >
          <Check size={16} strokeWidth={2} />
          {primaryAction.label}
        </button>
      )}
      {moves.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {moves.map((t) => (
            <button
              key={t.to}
              type="button"
              onClick={() => handleStep(t.to, t.label)}
              className={`${TAP}inline-flex items-center text-[13px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {closings.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-2">
            Закрыть дело без денег
          </div>
          <div className="flex flex-wrap gap-2">
            {closings.map((t) => {
              const recovered = t.to === "closed_recovered";
              return (
                <button
                  key={t.to}
                  type="button"
                  onClick={() => onClose(t.to, t.label)}
                  className={`inline-flex ${isTouchPrimary() ? "h-11" : "h-9"} items-center gap-1.5 rounded-[10px] border px-3 text-[12.5px] font-semibold transition-colors ${
                    recovered
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400"
                      : "border-border bg-white text-ink-2 hover:border-ink"
                  }`}
                >
                  {recovered && <Bike size={13} />}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const contactCard = !closed && (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
          Итог звонка
        </div>
        <div className="text-[11px] text-muted">
          {lastCall ? `последний ${ruDateTime(lastCall.createdAt)}` : "звонков нет"}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onCall("answered")}
          disabled={logCall.isPending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-emerald-100 bg-emerald-50 text-[13px] font-semibold text-emerald-700 transition-colors hover:border-emerald-300 disabled:opacity-50"
        >
          <Phone size={14} /> Ответил
        </button>
        <button
          type="button"
          onClick={() => onCall("no_answer")}
          disabled={logCall.isPending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-border bg-white text-[13px] font-semibold text-ink-2 transition-colors hover:border-ink disabled:opacity-50"
        >
          <PhoneOff size={14} /> Не дозвонился
        </button>
        <button
          type="button"
          onClick={() => setShowPromised((s) => !s)}
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border text-[13px] font-semibold transition-colors ${
            showPromised
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-blue-100 bg-blue-50 text-blue-700 hover:border-blue-300"
          }`}
        >
          <CalendarClock size={14} /> Обещал
        </button>
        <button
          type="button"
          onClick={() => onCall("refused")}
          disabled={logCall.isPending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-red-100 bg-red-50 text-[13px] font-semibold text-red-700 transition-colors hover:border-red-300 disabled:opacity-50"
        >
          <Ban size={14} /> Отказался
        </button>
      </div>
      {showPromised && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-[12px] bg-blue-50/60 p-3.5">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-700">
              Обещал заплатить к дате
            </label>
            <DatePicker
              value={promisedDate || null}
              onChange={(v) => setPromisedDate(v ?? "")}
            />
          </div>
          <button
            type="button"
            disabled={!promisedDate || logCall.isPending}
            onClick={() => onCall("promised", { promisedDate })}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-blue-600 px-4 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            <Check size={14} /> Записать обещание
          </button>
        </div>
      )}
      <input
        value={callNote}
        onChange={(e) => setCallNote(e.target.value)}
        placeholder="Что сказал по телефону (необязательно)"
        className="mt-3 h-11 w-full rounded-[10px] border border-border bg-white px-3.5 text-[13px] text-ink outline-none focus:border-ink"
      />
      <div className="mt-4 border-t border-border pt-4">
        <textarea
          rows={2}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Заметка по делу: договорённость, контакт родственника…"
          className="w-full resize-none rounded-[10px] border border-border bg-white p-3 text-[13px] text-ink outline-none focus:border-ink"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={!noteText.trim() || addNote.isPending}
            onClick={onSaveNote}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink px-4 text-[13px] font-semibold text-white hover:bg-[#16213a] disabled:opacity-40"
          >
            <StickyNote size={14} /> Добавить заметку
          </button>
        </div>
      </div>
    </div>
  );

  const historyCard = (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card-sm">
      <div className="mb-3 text-[14px] font-semibold text-ink">Хронология</div>
      {events.length === 0 ? (
        <div className="text-[12.5px] text-muted-2">Событий пока нет.</div>
      ) : (
        <ol className="max-h-[340px] space-y-2.5 overflow-auto pr-1">
          {events.map((e) => (
            <li key={e.key} className="flex gap-3 text-[12.5px] leading-snug text-ink-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.tone}`} />
              <div className="min-w-0">
                <div className="font-mono text-[10.5px] text-muted-2">{ruDateTime(e.at)}</div>
                <div>{e.text}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  const actCard =
    d.damageReportId != null ? (
      <DamageDebtorActSection rentalId={d.relatedRentalId} reportId={d.damageReportId} />
    ) : d.comment ? (
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card-sm">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
          Откуда долг
        </div>
        <div className="text-[13.5px] leading-relaxed text-ink-2">{d.comment}</div>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      {hero}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        {/* ЛЕВО — деньги и откуда долг */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* «Ждём оплату / Пришла ли оплата?» — первым, это главный вопрос дела */}
          <DebtorPaymentCheck d={d} part="check" />
          {paymentsCard}
          {actCard}
          {/* Финансовый прогноз (ДТП-потерпевший) */}
          {d.forecast && (
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-card-sm">
              <div className="mb-3 flex items-center justify-between text-[14px] font-semibold text-ink">
                <span>Финансовый прогноз</span>
                {d.forecast.profit != null && (
                  <span className="font-mono text-[13px] text-emerald-700">
                    {d.forecast.profit > 0 ? "+" : ""}
                    {d.forecast.profit.toLocaleString("ru-RU")} ₽
                  </span>
                )}
              </div>
              <div className="space-y-1.5 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted">Оценка страховой</span>
                  <b className="font-mono">{d.forecast.estimate != null ? formatRub(d.forecast.estimate) : "—"}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Выплата</span>
                  <b className="font-mono">{d.forecast.payout != null ? formatRub(d.forecast.payout) : "—"}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Себестоимость ремонта</span>
                  <b className="font-mono">{d.forecast.repairCost != null ? formatRub(d.forecast.repairCost) : "—"}</b>
                </div>
              </div>
            </div>
          )}
          <div className="hidden lg:block">{historyCard}</div>
        </div>

        {/* ПРАВО — что делать */}
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">
          {contactCard}
          <DebtorPaymentCheck d={d} part="penalty" />
          {nextStepCard}
          <div className="lg:hidden">{historyCard}</div>
        </div>
      </div>

      {scheduleOpen && (
        <ScheduleBuilderDialog
          debtorId={id}
          caseNumber={d.caseNumber}
          remaining={remaining}
          onClose={() => setScheduleOpen(false)}
          onCreated={() => setScheduleOpen(false)}
        />
      )}
    </div>
  );
}

const OUTCOME_SHORT: Record<CallOutcome, string> = {
  answered: "ответил",
  no_answer: "не дозвонился",
  promised: "обещал заплатить",
  refused: "отказался",
};

function ruDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Аватар дела — фото из карточки клиента (23.10), иначе инициалы. */
function CaseAvatar({ name, photoKey }: { name: string; photoKey: string | null }) {
  const [broken, setBroken] = useState(false);
  const initials =
    (name || "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  if (photoKey && !broken)
    return (
      <img
        src={fileUrl(photoKey, { variant: "thumb" }) ?? undefined}
        alt=""
        data-case-avatar="photo"
        onError={() => setBroken(true)}
        className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-card-sm"
      />
    );
  return (
    <div
      data-case-avatar="initials"
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-surface-soft text-[17px] font-bold text-blue-700"
    >
      {initials}
    </div>
  );
}
