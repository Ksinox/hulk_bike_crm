/**
 * Карточка дела (Case workspace). Полноэкранный режим работы с одним
 * должником.
 *
 * Структура:
 *  - Header (фио, тип, стадия, чипы)
 *  - Tree-путь по стадиям (visualization)
 *  - Decision panel — primary action + secondary links
 *  - Свёрнутые секции: график платежей, хронология, заметки
 */
import { useState } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Check,
  Phone,
  PhoneOff,
  CalendarClock,
  Ban,
  StickyNote,
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

// recordPay used in onOpenPayment via prop, suppress unused warning
// (kept import for future inline-record functionality)
import { toast } from "@/lib/toast";

// Локальная копия логики state machine для UI (зеркало бэка).
// Полное дерево — на бэке через canTransition; здесь только подсказки
// какие кнопки рисовать.
const NEXT_TRANSITIONS: Record<DebtType, Partial<Record<Stage, { to: Stage; label: string; primary?: boolean }[]>>> = {
  dtp_guilty: {
    created: [{ to: "pretrial", label: "Начать досудебку", primary: true }],
    pretrial: [
      { to: "payment_schedule", label: "Признал — график", primary: true },
      { to: "lawyer", label: "Не признал — юристу" },
    ],
    lawyer: [
      { to: "payment_schedule", label: "Юрист убедил — график", primary: true },
      { to: "court", label: "В суд" },
    ],
    payment_schedule: [
      { to: "closed_paid", label: "Все платежи закрыты", primary: true },
      { to: "lawyer", label: "Перестал платить — юристу" },
    ],
    court: [
      { to: "closed_court", label: "Решение суда", primary: true },
      { to: "closed_settled", label: "Мировая" },
    ],
  },
  dtp_victim: {
    created: [{ to: "insurance_docs", label: "Документы в страховую", primary: true }],
    insurance_docs: [{ to: "insurance_eval", label: "Оценка назначена", primary: true }],
    insurance_eval: [{ to: "insurance_wait", label: "Оценка получена", primary: true }],
    insurance_wait: [{ to: "closed_paid", label: "Выплата получена", primary: true }],
  },
  damage: {
    created: [{ to: "payment_schedule", label: "Создать график", primary: true }],
    payment_schedule: [
      { to: "closed_paid", label: "Все платежи закрыты", primary: true },
      { to: "lawyer", label: "Нарушения — юристу" },
    ],
    lawyer: [
      { to: "payment_schedule", label: "Возобновить график", primary: true },
      { to: "closed_settled", label: "Мировая" },
    ],
  },
  theft: {
    created: [{ to: "pretrial", label: "Связаться с клиентом", primary: true }],
    pretrial: [
      { to: "payment_schedule", label: "Признал — график", primary: true },
      { to: "police", label: "Не признал — полиция" },
    ],
    payment_schedule: [
      { to: "closed_paid", label: "Все платежи закрыты", primary: true },
    ],
    police: [{ to: "criminal_case", label: "Уголовное дело возбуждено", primary: true }],
    criminal_case: [{ to: "closed_court", label: "Приговор", primary: true }],
  },
  rental_overdue: {
    created: [{ to: "payment_schedule", label: "Создать график", primary: true }],
    payment_schedule: [
      { to: "closed_paid", label: "Долг погашен", primary: true },
      { to: "lawyer", label: "Нарушения — юристу" },
      { to: "closed_written_off", label: "Списать" },
    ],
    lawyer: [
      { to: "payment_schedule", label: "Возобновить", primary: true },
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
  onOpenPayment: () => void;
}) {
  const q = useDebtor(id);
  const transition = useTransitionDebtor();
  const logCall = useLogCall();
  const addNote = useAddNote();
  const [openSection, setOpenSection] = useState<string | null>("payments");
  // Панель связи: текст разговора, флаг ввода даты обещания, сама дата, заметка.
  const [callNote, setCallNote] = useState("");
  const [showPromised, setShowPromised] = useState(false);
  const [promisedDate, setPromisedDate] = useState("");
  const [noteText, setNoteText] = useState("");

  if (q.isLoading) {
    return <div className="flex h-64 items-center justify-center text-muted">Загрузка…</div>;
  }
  if (!q.data) return <div className="text-muted">Не найдено</div>;
  const d = q.data;
  const transitions = NEXT_TRANSITIONS[d.type]?.[d.stage] ?? [];
  const primary = transitions.find((t) => t.primary);
  const secondary = transitions.filter((t) => !t.primary);

  const onTransition = async (to: Stage, label: string) => {
    try {
      await transition.mutateAsync({ id, toStage: to });
      toast.success("Стадия обновлена", `Дело перешло: ${label}`);
    } catch (e) {
      toast.error("Не удалось", (e as Error).message);
    }
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

  return (
    <section className="overflow-hidden rounded-[18px] bg-white shadow-card-md">
      {/* Header */}
      <header className="border-b border-border p-7 pb-5">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink"
        >
          <ArrowLeft size={13} />
          Назад к очереди
        </button>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-2">
            {d.caseNumber}
          </span>
          <span
            className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold ${TYPE_BG[d.type]}`}
          >
            {TYPE_LABEL[d.type]}
          </span>
          <span className="inline-flex h-6 items-center rounded-full bg-amber-50 px-2.5 text-[11.5px] font-semibold text-amber-700 border border-amber-100">
            {STAGE_LABEL[d.stage]}
          </span>
          {d.overdueDays > 0 && (
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-red-700">
              просрочка {d.overdueDays} дн.
            </span>
          )}
        </div>
        <h2 className="m-0 font-display text-[34px] font-bold leading-[1.05] tracking-[-0.022em] text-ink">
          {d.displayName}
        </h2>
        <div className="mt-1 text-[14px] text-muted">
          <a
            href={`tel:${d.displayPhone}`}
            className="font-semibold text-ink-2 underline-offset-2 hover:text-blue-700 hover:underline"
          >
            {d.displayPhone}
          </a>{" "}
          · <b className="font-semibold text-ink-2">{d.clientStatus === "closed" ? "Закрытый" : "Действующий"} клиент</b> · психо-портрет {d.psyRating}/5
        </div>
      </header>

      {/* Tree visualization (simplified — linear with current marker) */}
      <div className="border-b border-border bg-gradient-to-b from-[#FAFBFD] to-surface-soft px-7 py-6">
        <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-2">
          ↓ путь дела ↓
        </div>
        <div className="inline-flex items-center gap-2 rounded-[14px] border-2 border-amber-500 bg-white px-4 py-2.5 shadow-[0_0_0_4px_rgba(217,119,6,0.15)]">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700">
            СЕЙЧАС
          </span>
          <span className="text-[14px] font-semibold text-ink">{STAGE_LABEL[d.stage]}</span>
        </div>
      </div>

      {/* Прогресс погашения — кольцевая диаграмма + разбивка сумм */}
      {d.totalAmount > 0 && (
        <div className="m-7 mb-0 flex flex-wrap items-center gap-6 rounded-[18px] border border-border bg-white p-6 shadow-card-sm">
          <DonutProgress paid={d.paid} total={d.totalAmount} />
          <div className="grid min-w-[260px] flex-1 grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-4">
            <CaseStat label="Всего долг" value={formatRub(d.totalAmount)} />
            <CaseStat label="Оплачено" value={formatRub(d.paid)} tone="green" />
            <CaseStat
              label="Осталось"
              value={formatRub(Math.max(0, d.totalAmount - d.paid))}
              tone="ink"
            />
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
                    : "график не создан"
                }
              />
            )}
          </div>
        </div>
      )}

      {/* Recommendation banner */}
      {d.recommendation && (
        <div className="m-7 mb-0 rounded-[14px] border border-amber-100 bg-gradient-to-br from-amber-50 to-[#FFFCF3] p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-8 w-8 flex-none place-items-center rounded-[10px] bg-amber-100 text-amber-700">
              <AlertTriangle size={16} />
            </div>
            <div className="flex-1">
              <div className="font-display text-[16px] font-semibold text-amber-700">
                Рекомендация системы
              </div>
              <div className="mt-1 text-[13px] leading-[1.5] text-ink-2">
                {d.recommendation.reason}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Decision panel */}
      {!isClosed(d.stage) && transitions.length > 0 && (
        <div className="m-7 mt-5 rounded-[18px] border border-amber-100 bg-gradient-to-br from-[#FFFCF3] to-[#FFFAEC] p-7">
          <h3 className="m-0 mb-1 font-display text-[20px] font-semibold tracking-[-0.012em] text-amber-700">
            Следующий шаг
          </h3>
          <p className="mb-5 max-w-[640px] text-[13.5px] leading-[1.55] text-ink-2">
            Рекомендуемый ход подсвечен крупно. Если ситуация требует другого
            решения — тихие ссылки ниже.
          </p>

          {primary && (
            <button
              type="button"
              onClick={() => onTransition(primary.to, primary.label)}
              disabled={transition.isPending}
              className="inline-flex h-14 items-center gap-3 rounded-[14px] bg-ink px-7 text-[16px] font-semibold text-white shadow-[0_12px_24px_-8px_rgba(11,18,32,0.35)] hover:-translate-y-0.5 transition-transform disabled:opacity-50"
            >
              <Check size={18} strokeWidth={2} />
              {primary.label}
            </button>
          )}

          {/* Quick payment if on schedule */}
          {d.stage === "payment_schedule" && (
            <button
              type="button"
              onClick={onOpenPayment}
              className="ml-2 inline-flex h-14 items-center gap-3 rounded-[14px] border border-ink bg-white px-7 text-[16px] font-semibold text-ink hover:bg-surface-soft"
            >
              Зафиксировать платёж
            </button>
          )}

          {secondary.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2.5 border-t border-amber-100 pt-4">
              {secondary.map((t) => (
                <button
                  key={t.to}
                  type="button"
                  onClick={() => onTransition(t.to, t.label)}
                  className="text-[13.5px] font-medium text-muted hover:text-ink"
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Связь с должником — всегда доступно для активного дела.
          Звонок (исход + заметка разговора) и быстрая заметка по делу. */}
      {!isClosed(d.stage) && (
        <div className="m-7 mb-0 rounded-[18px] border border-border bg-white p-6 shadow-card-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                Связь с должником
              </div>
              <a
                href={`tel:${d.displayPhone}`}
                className="mt-1 inline-flex items-center gap-2 font-display text-[24px] font-bold tracking-[-0.01em] text-ink hover:text-blue-700"
              >
                <Phone size={18} className="text-blue-600" />
                {d.displayPhone}
              </a>
            </div>
            <div className="text-[12px] text-muted">
              {d.calls.length > 0
                ? `Последний звонок ${d.calls[0]!.createdAt.slice(0, 10)}`
                : "Звонков ещё не было"}
            </div>
          </div>

          {/* Исход звонка */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
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

          {/* Дата обещанного платежа */}
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

          {/* Заметка разговора (приклеивается к звонку) */}
          <input
            value={callNote}
            onChange={(e) => setCallNote(e.target.value)}
            placeholder="Что сказал по телефону (необязательно, добавится к записи звонка)"
            className="mt-3 h-11 w-full rounded-[10px] border border-border bg-white px-3.5 text-[13px] text-ink outline-none focus:border-ink"
          />

          {/* Свободная заметка по делу */}
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

      {/* Collapsed sections */}
      <div className="px-7 pb-9">
        {/* Payments */}
        <CollapsibleSection
          open={openSection === "payments"}
          onToggle={() => setOpenSection(openSection === "payments" ? null : "payments")}
          title={
            <>
              <b className="font-semibold text-ink">График платежей</b>{" "}
              · {d.paid.toLocaleString("ru-RU")} / {d.totalAmount.toLocaleString("ru-RU")} ₽ · {d.progressPercent}%
            </>
          }
          count={d.payments.length}
        >
          {d.payments.length === 0 ? (
            <div className="py-3 text-[13px] text-muted">График ещё не создан. Появится после перехода в стадию «График платежей».</div>
          ) : (
            <div className="space-y-1">
              {d.payments.map((p) => {
                const paid = p.paidAt != null;
                const overdue =
                  !paid && new Date(p.scheduledDate) < new Date();
                return (
                  <div
                    key={p.id}
                    className={`grid grid-cols-[28px_1fr_auto_18px] items-center gap-3 rounded-[8px] px-3 py-2 text-[13px] ${
                      paid ? "bg-emerald-50" : overdue ? "bg-red-50" : ""
                    }`}
                  >
                    <span className="font-mono text-[11px] text-muted-2">{p.n}</span>
                    <div>
                      <div className={paid ? "text-emerald-700" : overdue ? "text-red-700 font-semibold" : "text-ink"}>
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
                    <span className="font-mono text-[12.5px] font-semibold text-ink">
                      {(p.paidAmount ?? p.scheduledAmount).toLocaleString("ru-RU")} ₽
                    </span>
                    <span
                      className={`h-3.5 w-3.5 rounded-full border-2 ${
                        paid
                          ? "border-emerald-600 bg-emerald-600"
                          : overdue
                          ? "border-red-600 bg-red-600"
                          : "border-border-strong"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleSection>

        {/* Timeline */}
        <CollapsibleSection
          open={openSection === "timeline"}
          onToggle={() => setOpenSection(openSection === "timeline" ? null : "timeline")}
          title={
            <>
              <b className="font-semibold text-ink">Хронология</b>
            </>
          }
          count={d.stageEvents.length + d.calls.length + d.notes.length}
        >
          <div className="space-y-1.5">
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
        </CollapsibleSection>

        {/* Forecast for dtp_victim */}
        {d.forecast && (
          <CollapsibleSection
            open={openSection === "forecast"}
            onToggle={() => setOpenSection(openSection === "forecast" ? null : "forecast")}
            title={
              <>
                <b className="font-semibold text-ink">Финансовый прогноз</b> ·{" "}
                {d.forecast.profit != null ? (
                  <span className="font-mono">
                    {d.forecast.profit > 0 ? "+" : ""}
                    {d.forecast.profit.toLocaleString("ru-RU")} ₽
                  </span>
                ) : (
                  <span className="text-muted">данные не полные</span>
                )}
              </>
            }
          >
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
          </CollapsibleSection>
        )}
      </div>
    </section>
  );
}

function CollapsibleSection({
  open,
  onToggle,
  title,
  count,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-[24px_1fr_auto_16px] items-center gap-3 py-4 text-left"
      >
        <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-surface-soft text-muted">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="text-[13.5px] text-ink-2">{title}</span>
        {count != null && (
          <span className="font-mono text-[12px] text-muted-2">{count} →</span>
        )}
        <span />
      </button>
      {open && <div className="ml-10 mb-3">{children}</div>}
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
