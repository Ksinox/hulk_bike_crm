import { useMemo } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEPOSIT_AMOUNT,
  MODEL_LABEL,
  PAYMENT_LABEL,
  TARIFF,
  TARIFF_PERIOD_LABEL,
  type Rental,
} from "@/lib/mock/rentals";
import {
  markPaymentPaid,
  toggleTask,
  useInspection,
  useRentalIncidents,
  useRentalPayments,
  useRentalTasks,
} from "./rentalsStore";

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

/* =================== Условия =================== */

export function TermsTab({ rental }: { rental: Rental }) {
  const tariffRow = TARIFF[rental.model];
  return (
    <div className="flex flex-col gap-4">
      <Section title="Тариф">
        <div className="rounded-[14px] border border-border p-3">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[13px] font-semibold text-ink">
                {MODEL_LABEL[rental.model]}
              </div>
              <div className="text-[11px] text-muted-2">
                {TARIFF_PERIOD_LABEL[rental.tariffPeriod]}
              </div>
            </div>
            <div className="font-display text-[22px] font-extrabold text-ink">
              {fmt(rental.rate)} <span className="text-[14px] font-bold text-muted-2">₽/сут</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            {(["short", "week", "month"] as const).map((p) => (
              <div
                key={p}
                className={cn(
                  "rounded-[10px] px-2.5 py-1.5",
                  p === rental.tariffPeriod
                    ? "bg-blue-50 text-blue-700"
                    : "bg-surface-soft text-muted",
                )}
              >
                <div className="font-semibold uppercase tracking-wider">
                  {TARIFF_PERIOD_LABEL[p]}
                </div>
                <div className="mt-0.5 tabular-nums">
                  {fmt(tariffRow[p])} ₽/сут
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Сроки и сумма">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <InfoRow label="Дата начала" value={rental.start} />
          <InfoRow label="Плановый возврат" value={rental.endPlanned} />
          <InfoRow label="Срок" value={`${rental.days} дн`} />
          <InfoRow
            label="Итоговая сумма"
            value={`${fmt(rental.sum)} ₽`}
            hint={`${fmt(rental.rate)} × ${rental.days}`}
            emphasize
          />
        </div>
      </Section>

      <Section title="Залог">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <InfoRow
            label="Сумма залога"
            value={`${fmt(rental.deposit || DEPOSIT_AMOUNT)} ₽`}
            hint="фиксированный"
          />
          <InfoRow
            label="Статус"
            value={
              rental.depositReturned === true
                ? "Возвращён клиенту"
                : rental.depositReturned === false
                  ? "Удержан"
                  : "На балансе компании"
            }
          />
        </div>
      </Section>

      <Section title="Экипировка">
        {rental.equipment.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted">
            доп. экипировка не выдавалась
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {rental.equipment.map((e) => (
              <span
                key={e}
                className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-3 py-1 text-[12px] font-semibold text-ink"
              >
                <Check size={12} /> {e}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Оплата">
        <InfoRow
          label="Способ оплаты"
          value={PAYMENT_LABEL[rental.paymentMethod]}
        />
      </Section>

      {rental.note && (
        <Section title="Заметка">
          <div className="rounded-[14px] bg-surface-soft px-3 py-2 text-[12px] text-ink-2">
            {rental.note}
          </div>
        </Section>
      )}
    </div>
  );
}

/* =================== Платежи =================== */

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  rent: "Аренда",
  deposit: "Залог",
  fine: "Штраф",
  damage: "Ущерб",
  refund: "Возврат залога",
};

const PAYMENT_TYPE_TONE: Record<string, string> = {
  rent: "bg-blue-50 text-blue-700",
  deposit: "bg-surface-soft text-ink",
  fine: "bg-orange-soft text-orange-ink",
  damage: "bg-red-soft text-red-ink",
  refund: "bg-green-soft text-green-ink",
};

export function PaymentsTab({ rental }: { rental: Rental }) {
  const payments = useRentalPayments(rental.id);
  const paid = payments.filter((p) => p.paid).reduce((s, p) => s + (p.type === "refund" ? -p.amount : p.amount), 0);
  const unpaid = payments.filter((p) => !p.paid).reduce((s, p) => s + p.amount, 0);
  // свежие сверху — сортируем по id убывания (id у нас растёт со временем)
  const sortedPayments = useMemo(
    () => [...payments].sort((a, b) => b.id - a.id),
    [payments],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MiniStat label="Получено" value={`${fmt(paid)} ₽`} tone="green" />
        <MiniStat
          label="Ожидается"
          value={`${fmt(unpaid)} ₽`}
          tone={unpaid > 0 ? "red" : "neutral"}
        />
        <MiniStat
          label="Баланс"
          value={`${fmt(paid - unpaid)} ₽`}
          tone={paid - unpaid >= 0 ? "green" : "red"}
        />
      </div>

      {payments.length === 0 ? (
        <Empty text="По аренде ещё не было платежей" />
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-border">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-soft text-left text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              <tr>
                <th className="px-3 py-2">Дата</th>
                <th className="px-3 py-2">Тип</th>
                <th className="px-3 py-2 text-right">Сумма</th>
                <th className="px-3 py-2">Способ</th>
                <th className="px-3 py-2">Статус</th>
              </tr>
            </thead>
            <tbody>
              {sortedPayments.map((p) => (
                <tr key={p.id} className="border-t border-border/60">
                  <td className="px-3 py-2 tabular-nums text-muted">{p.date}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        PAYMENT_TYPE_TONE[p.type],
                      )}
                    >
                      {PAYMENT_TYPE_LABEL[p.type]}
                    </span>
                    {p.note && (
                      <div className="mt-0.5 text-[11px] text-muted-2">
                        {p.note}
                      </div>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-semibold tabular-nums",
                      p.type === "refund" ? "text-green-ink" : "text-ink",
                    )}
                  >
                    {p.type === "refund" ? "−" : ""}
                    {fmt(p.amount)} ₽
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {PAYMENT_LABEL[p.method]}
                  </td>
                  <td className="px-3 py-2">
                    {p.paid ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-ink">
                        <CheckCircle2 size={12} /> оплачено
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => markPaymentPaid(p.id, true)}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700"
                      >
                        <Check size={11} /> Зафиксировать
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[11px] text-muted-2">
        Приоритет списания: штрафы → ущерб → неустойка → аренда → выкуп
      </div>
    </div>
  );
}

/* =================== Возврат =================== */

export function ReturnTab({ rental }: { rental: Rental }) {
  const inspection = useInspection(rental.id);
  const isActive = rental.status === "active" || rental.status === "overdue";
  const isReturning = rental.status === "returning";
  const done =
    rental.status === "completed" || rental.status === "completed_damage";

  if (isActive) {
    return (
      <div className="flex flex-col gap-3">
        <Section title="Осмотр при выдаче">
          <div className="rounded-[14px] border border-border px-3 py-3 text-[12px] text-muted">
            <Row label="Видео состояния" value="—" hint="ожидается привязка к облаку" />
            <Row label="Фото документов" value="в Telegram-канале" />
            <Row label="Выдано" value={rental.start} />
          </div>
        </Section>
        <Empty
          text="Возврат ещё не начат"
          hint="Нажмите «Принять возврат» в шапке карточки"
        />
      </div>
    );
  }

  if (isReturning) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-[14px] bg-orange-soft/70 p-3 text-[13px] text-orange-ink">
          <Clock size={14} />
          <div className="min-w-0 flex-1">
            <b>Идёт возврат.</b> Проверьте состояние, экипировку, перепробег.
          </div>
        </div>
        <ChecklistPreview />
      </div>
    );
  }

  if (done && inspection) {
    return (
      <div className="flex flex-col gap-3">
        <Section title="Возврат">
          <div className="rounded-[14px] border border-border p-3 text-[12px] text-ink-2">
            <Row label="Фактическая дата" value={inspection.dateActual} />
            <Row
              label="Состояние"
              value={inspection.conditionOk ? "ОК" : "есть повреждения"}
            />
            <Row
              label="Экипировка"
              value={inspection.equipmentOk ? "в порядке" : "неполная"}
            />
            <Row
              label="Залог"
              value={inspection.depositReturned ? "возвращён" : "удержан"}
            />
            {inspection.damageNotes && (
              <Row label="Заметки" value={inspection.damageNotes} />
            )}
          </div>
        </Section>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <Section title="Возврат">
          <div className="rounded-[14px] border border-border p-3 text-[12px] text-ink-2">
            <Row
              label="Фактическая дата"
              value={rental.endActual ?? rental.endPlanned}
            />
            <Row
              label="Состояние"
              value={rental.status === "completed" ? "ОК" : "есть повреждения"}
            />
            <Row
              label="Залог"
              value={rental.depositReturned ? "возвращён" : "удержан"}
            />
          </div>
        </Section>
      </div>
    );
  }

  return <Empty text="Возврат неприменим к этому статусу" />;
}

function ChecklistPreview() {
  const items = [
    "Сравнить внешнее состояние с видео при выдаче",
    "Завести двигатель, проверить звук",
    "Проверить пробег / остаток до замены масла",
    "Проверить экипировку (соответствие выданной)",
    "Зафиксировать возврат залога или удержание",
  ];
  return (
    <div className="rounded-[14px] border border-border p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
        Чек-лист возврата
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li
            key={it}
            className="flex items-start gap-2 text-[12px] text-ink-2"
          >
            <Check size={14} className="mt-0.5 shrink-0 text-muted-2" />
            {it}
          </li>
        ))}
      </ul>
      <div className="mt-3 text-[11px] text-muted-2">
        Завершить возврат можно кнопкой в шапке: «Завершить без ущерба» или
        «Завершить с ущербом».
      </div>
    </div>
  );
}

/* =================== Инциденты =================== */

export function IncidentsTab({ rental }: { rental: Rental }) {
  const incidents = useRentalIncidents(rental.id);
  if (incidents.length === 0) {
    return <Empty text="По этой аренде инцидентов нет" />;
  }
  return (
    <div className="flex flex-col gap-2">
      {incidents.map((inc) => {
        const left = inc.damage - inc.paid;
        return (
          <div key={inc.id} className="rounded-[14px] border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-ink" />
                  <span className="text-[13px] font-semibold text-ink">
                    {inc.type}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      left > 0
                        ? "bg-red-soft text-red-ink"
                        : "bg-green-soft text-green-ink",
                    )}
                  >
                    {left > 0 ? "не погашен" : "закрыт"}
                  </span>
                </div>
                {inc.note && (
                  <div className="mt-1 text-[12px] text-muted">{inc.note}</div>
                )}
              </div>
              <div className="shrink-0 text-right text-[11px] text-muted-2">
                {inc.date}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
              <Metric label="Ущерб" value={`${fmt(inc.damage)} ₽`} />
              <Metric label="Оплачено" value={`${fmt(inc.paid)} ₽`} tone="green" />
              <Metric
                label="Остаток"
                value={`${fmt(left)} ₽`}
                tone={left > 0 ? "red" : "gray"}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =================== Задачи =================== */

export function TasksTab({ rental }: { rental: Rental }) {
  const tasks = useRentalTasks(rental.id);
  if (tasks.length === 0) {
    return <Empty text="К аренде не привязано задач" hint="Задачи создаются автоматически для просрочек и возвратов" />;
  }
  return (
    <div className="flex flex-col gap-2">
      {tasks.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => toggleTask(t.id)}
          className={cn(
            "flex items-start gap-3 rounded-[12px] border border-border p-3 text-left transition-colors",
            t.done ? "opacity-60" : "hover:bg-surface-soft",
          )}
        >
          <div
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2",
              t.done
                ? "border-green-ink bg-green-ink text-white"
                : "border-border-strong",
            )}
          >
            {t.done && <Check size={12} />}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "text-[13px] font-semibold text-ink",
                t.done && "line-through",
              )}
            >
              {t.title}
            </div>
            <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-2">
              <Calendar size={11} /> {t.due}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* =================== Helpers =================== */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-[10px] bg-surface-soft px-3 py-2">
      <div className="text-[11px] text-muted-2">{label}</div>
      <div
        className={cn(
          "font-semibold tabular-nums",
          emphasize ? "text-[16px] text-ink" : "text-[13px] text-ink-2",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted-2">{hint}</div>}
    </div>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0">
      <span className="text-muted-2">{label}</span>
      <span className="text-right font-semibold text-ink">
        {value}
        {hint && <span className="ml-1 text-[11px] text-muted-2">({hint})</span>}
      </span>
    </div>
  );
}

function Empty({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-border text-center">
      <FileText size={18} className="text-muted-2" />
      <div className="text-[13px] font-semibold text-ink-2">{text}</div>
      {hint && <div className="max-w-[320px] text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "red" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] px-3 py-2",
        tone === "green"
          ? "bg-green-soft/60"
          : tone === "red"
            ? "bg-red-soft/60"
            : "bg-surface-soft",
      )}
    >
      <div className="text-[11px] text-muted-2">{label}</div>
      <div className="font-display text-[16px] font-extrabold tabular-nums text-ink">
        {value}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "gray";
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-2">{label}</div>
      <div
        className={cn(
          "font-semibold tabular-nums",
          tone === "green"
            ? "text-green-ink"
            : tone === "red"
              ? "text-red-ink"
              : tone === "gray"
                ? "text-muted-2"
                : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* ignore unused deps marker */
void useMemo;
void Plus;
void X;
