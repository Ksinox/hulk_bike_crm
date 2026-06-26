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
} from "lucide-react";
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
  isClosed,
  type CallOutcome,
  type DebtType,
  type Stage,
} from "@/lib/debtors/types";
import { DonutProgress } from "@/components/DonutProgress";
import { ScheduleBuilderDialog } from "./ScheduleBuilderDialog";
import { DamageDebtorActSection } from "./DamageDebtorActSection";
import { toast, confirmDialog } from "@/lib/toast";

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
  const remaining = Math.max(0, d.totalAmount - d.paid);

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

  const showNextStep =
    !closed && (primaryAction != null || secondary.length > 0 || d.recommendation != null);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Шапка ─────────────────────────────────────────────── */}
      <header className="rounded-2xl border border-border bg-surface p-5 shadow-card-sm">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"
        >
          <ArrowLeft size={13} />
          Назад к очереди
        </button>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Статус-пилюля ПЕРЕД именем (постура brand-spec) */}
          <span className="inline-flex h-6 items-center rounded-full border border-amber-100 bg-amber-50 px-2.5 text-[11.5px] font-semibold text-amber-700">
            {STAGE_LABEL[d.stage]}
          </span>
          <span
            className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[11.5px] font-semibold ${TYPE_BG[d.type]}`}
          >
            {TYPE_LABEL[d.type]}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-2">
            {d.caseNumber}
          </span>
          {d.overdueDays > 0 && (
            <span className="inline-flex h-6 items-center rounded-full bg-red-soft px-2.5 text-[11px] font-bold uppercase tracking-[0.04em] text-red-ink">
              просрочка {d.overdueDays} дн.
            </span>
          )}
        </div>
        <h2 className="mt-2 font-display text-[30px] font-bold leading-[1.05] tracking-[-0.022em] text-ink">
          {d.displayName}
        </h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted">
          <a
            href={`tel:${d.displayPhone}`}
            className="inline-flex items-center gap-1.5 font-semibold text-ink-2 hover:text-blue-700"
          >
            <Phone size={13} className="text-blue-600" />
            {d.displayPhone}
          </a>
          <span className="text-muted-2">·</span>
          <span>
            {d.clientStatus === "closed" ? "Закрытый" : "Действующий"} клиент
          </span>
          <span className="text-muted-2">·</span>
          <span>психо-портрет {d.psyRating}/5</span>
        </div>
      </header>

      {/* ── Рабочая зона: две колонки ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {/* ЛЕВО — деньги и история */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Прогресс */}
          {d.totalAmount > 0 && (
            <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-border bg-surface p-6 shadow-card-sm">
              <DonutProgress paid={d.paid} total={d.totalAmount} />
              <div className="grid min-w-[240px] flex-1 grid-cols-2 gap-x-6 gap-y-3.5">
                <CaseStat label="Всего долг" value={formatRub(d.totalAmount)} />
                <CaseStat label="Оплачено" value={formatRub(d.paid)} tone="green" />
                <CaseStat label="Осталось" value={formatRub(remaining)} tone="ink" />
                {d.overdueAmount > 0 ? (
                  <CaseStat
                    label="Просрочка"
                    value={formatRub(d.overdueAmount)}
                    tone="red"
                  />
                ) : (
                  <CaseStat
                    label="Платежей"
                    value={
                      d.payments.length > 0
                        ? `${d.payments.filter((p) => p.paidAt).length} / ${d.payments.length}`
                        : "нет графика"
                    }
                  />
                )}
              </div>
            </div>
          )}

          {/* График платежей */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                <Wallet size={16} className="text-muted-2" />
                График платежей
                {d.payments.length > 0 && (
                  <span className="text-[12.5px] font-normal text-muted">
                    · {d.paid.toLocaleString("ru-RU")} / {d.totalAmount.toLocaleString("ru-RU")} ₽ · {d.progressPercent}%
                  </span>
                )}
              </div>
              {!closed && d.payments.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScheduleOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[12px] font-semibold text-muted hover:border-ink hover:text-ink"
                >
                  <CalendarRange size={12} /> Пересоздать
                </button>
              )}
            </div>

            {d.payments.length === 0 ? (
              <div>
                <div className="mb-3 text-[13px] leading-relaxed text-muted">
                  График ещё не создан. Разбейте долг на платежи — клиент гасит
                  по графику, вы фиксируете каждый кнопкой «Принять».
                </div>
                {!closed && (
                  <button
                    type="button"
                    onClick={() => setScheduleOpen(true)}
                    className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-ink px-5 text-[14px] font-semibold text-white hover:bg-[#16213a]"
                  >
                    <CalendarRange size={16} /> Сформировать график
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {d.payments.map((p) => {
                  const paid = p.paidAt != null;
                  const overdue = !paid && new Date(p.scheduledDate) < new Date();
                  return (
                    <div
                      key={p.id}
                      className={`grid grid-cols-[26px_1fr_auto_auto] items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] ${
                        paid ? "bg-emerald-50" : overdue ? "bg-red-50" : "bg-surface-soft/50"
                      }`}
                    >
                      <span className="font-mono text-[11px] text-muted-2">{p.n}</span>
                      <div className="min-w-0">
                        <div
                          className={
                            paid
                              ? "text-emerald-700"
                              : overdue
                                ? "font-semibold text-red-700"
                                : "text-ink"
                          }
                        >
                          {p.scheduledDate}
                        </div>
                        <div className="mt-0.5 font-mono text-[10.5px] text-muted">
                          {paid
                            ? `оплачен ${p.paidAt?.slice(0, 10)} · ${p.paidMethod === "transfer" ? "перевод" : "наличные"}`
                            : overdue
                              ? "просрочка"
                              : "плановый"}
                        </div>
                        {p.note && (
                          <div className="mt-0.5 text-[11px] italic leading-snug text-ink-2">
                            {p.note}
                          </div>
                        )}
                      </div>
                      <span className="font-mono text-[12.5px] font-semibold text-ink tabular-nums">
                        {(p.paidAmount ?? p.scheduledAmount).toLocaleString("ru-RU")} ₽
                      </span>
                      {paid ? (
                        <span className="h-3.5 w-3.5 rounded-full border-2 border-emerald-600 bg-emerald-600" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenPayment(p.n)}
                          className="inline-flex items-center rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#16213a]"
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

          {/* Финансовый прогноз (для ДТП-потерпевший) */}
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
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="font-semibold text-ink">Прибыль</span>
                  <b className="font-display text-[16px] text-emerald-700">
                    {d.forecast.profit != null ? formatRub(d.forecast.profit) : "—"}
                  </b>
                </div>
              </div>
            </div>
          )}

          {/* Этап 3: связанный акт о повреждениях — медиа-доказательства +
              печать претензии прямо из дела. */}
          {d.damageReportId != null && (
            <DamageDebtorActSection
              rentalId={d.relatedRentalId}
              reportId={d.damageReportId}
            />
          )}

          {/* Хронология */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card-sm">
            <div className="mb-3 text-[14px] font-semibold text-ink">
              Хронология
            </div>
            {d.stageEvents.length + d.calls.length + d.notes.length === 0 ? (
              <div className="text-[12.5px] text-muted-2">Событий пока нет.</div>
            ) : (
              <div className="max-h-[300px] space-y-1.5 overflow-auto pr-1">
                {d.stageEvents.map((e) => (
                  <div key={`s-${e.id}`} className="text-[12.5px] text-ink-2">
                    <span className="mr-2 font-mono text-[10.5px] uppercase tracking-[0.04em] text-muted-2">
                      {e.createdAt.slice(0, 10)}
                    </span>
                    {e.fromStage ? STAGE_LABEL[e.fromStage] + " → " : ""}
                    <b className="text-ink">{STAGE_LABEL[e.toStage]}</b>
                    {e.reason && <span className="text-muted"> · {e.reason}</span>}
                  </div>
                ))}
                {d.calls.map((c) => (
                  <div key={`c-${c.id}`} className="text-[12.5px] text-ink-2">
                    <span className="mr-2 font-mono text-[10.5px] uppercase tracking-[0.04em] text-muted-2">
                      {c.createdAt.slice(0, 10)}
                    </span>
                    Звонок — {c.outcome === "answered" ? "ответил" : c.outcome === "no_answer" ? "не ответил" : c.outcome === "promised" ? "обещал" : "отказался"}
                    {c.note && <span className="text-muted"> · {c.note}</span>}
                  </div>
                ))}
                {d.notes.map((n) => (
                  <div key={`n-${n.id}`} className="text-[12.5px] text-ink-2">
                    <span className="mr-2 font-mono text-[10.5px] uppercase tracking-[0.04em] text-muted-2">
                      {n.createdAt.slice(0, 10)}
                    </span>
                    {n.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ПРАВО — действия и связь */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-4">
          {closed && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-[13px] text-emerald-800 shadow-card-sm">
              <div className="font-display text-[16px] font-semibold">
                Дело закрыто
              </div>
              <div className="mt-1">
                {STAGE_LABEL[d.stage]}
                {d.closedReason ? ` · ${d.closedReason}` : ""}
              </div>
            </div>
          )}

          {showNextStep && (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card-sm">
              <div className="border-l-[3px] border-amber-400 p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                  Следующий шаг
                </div>

                {d.recommendation && (
                  <div className="mt-2 flex items-start gap-2 rounded-[12px] bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-800">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                    <span>{d.recommendation.reason}</span>
                  </div>
                )}

                {primaryAction && (
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={primaryAction.onClick}
                      disabled={transition.isPending}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] bg-ink px-5 text-[15px] font-semibold text-white shadow-card-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                    >
                      {primaryAction.pay ? (
                        <Wallet size={16} />
                      ) : (
                        <Check size={17} strokeWidth={2} />
                      )}
                      {primaryAction.label}
                    </button>
                  </div>
                )}

                {/* Альтернативные ходы по делу — тихие ссылки */}
                {moves.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-3">
                    {moves.map((t) => (
                      <button
                        key={t.to}
                        type="button"
                        onClick={() => handleStep(t.to, t.label)}
                        className="text-[13px] font-medium text-muted hover:text-ink"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Закрыть дело — управленческие исходы без денег. Отдельная
                    группа с outline-кнопками, каждая с подтверждением. */}
                {closings.length > 0 && (
                  <div className="mt-4 border-t border-border pt-3">
                    <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                      Закрыть дело
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {closings.map((t) => {
                        const recovered = t.to === "closed_recovered";
                        return (
                          <button
                            key={t.to}
                            type="button"
                            onClick={() => onClose(t.to, t.label)}
                            className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[12.5px] font-semibold transition-colors ${
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
            </div>
          )}

          {/* Связь с должником */}
          {!closed && (
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-card-sm">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                    Связь с должником
                  </div>
                  <a
                    href={`tel:${d.displayPhone}`}
                    className="mt-1 inline-flex items-center gap-2 font-display text-[22px] font-bold tracking-[-0.01em] text-ink hover:text-blue-700"
                  >
                    <Phone size={17} className="text-blue-600" />
                    {d.displayPhone}
                  </a>
                </div>
                <div className="shrink-0 text-right text-[11px] text-muted">
                  {d.calls.length > 0
                    ? `звонок ${d.calls[0]!.createdAt.slice(0, 10)}`
                    : "звонков нет"}
                </div>
              </div>

              {/* Исход звонка */}
              <div className="mt-4 grid grid-cols-2 gap-2">
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
                    <input
                      type="date"
                      value={promisedDate}
                      onChange={(e) => setPromisedDate(e.target.value)}
                      className="h-10 rounded-[10px] border border-blue-200 bg-white px-3 text-[13px] text-ink outline-none focus:border-blue-600"
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
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Заметка по делу
                </label>
                <textarea
                  rows={2}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Договорённость, контакт родственника, важные детали…"
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
          )}
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

function CaseStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "ink" | "green" | "red";
}) {
  const valueColor =
    tone === "green"
      ? "text-emerald-700"
      : tone === "red"
        ? "text-red-700"
        : "text-ink";
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-2">
        {label}
      </div>
      <div
        className={`mt-1 font-display text-[18px] font-bold leading-none tracking-[-0.01em] tabular-nums ${valueColor}`}
      >
        {value}
      </div>
    </div>
  );
}
