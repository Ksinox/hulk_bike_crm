import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bike,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  FileSignature,
  FileText,
  Gauge,
  Plus,
  Printer,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEPOSIT_AMOUNT,
  MODEL_LABEL,
  PAYMENT_LABEL,
  TARIFF_PERIOD_LABEL,
  type Rental,
} from "@/lib/mock/rentals";
import {
  addRentalIncident,
  markPaymentPaid,
  toggleTask,
  useInspection,
  useRentalIncidents,
  useRentalPayments,
  useRentalTasks,
} from "./rentalsStore";
import { CLIENTS } from "@/lib/mock/clients";

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

/* =================== Условия =================== */

/** SVG-иконка мото-шлема (в lucide нет подходящей — используем собственную) */
function HelmetIcon({
  size = 14,
  className,
}: {
  size?: number | string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 15a9 9 0 0 1 18 0v1H3v-1z" />
      <path d="M3 16h18" />
      <path d="M3 18h18" />
      <path d="M15 10h4" />
    </svg>
  );
}

/** детерминированный фейковый пробег по номеру скутера (до появления флот-модуля) */
function mockMileage(scooter: string): number {
  const m = scooter.match(/#(\d+)/);
  const n = m ? +m[1] : 1;
  // ~2,000 … 18,500 км — выглядит реалистично для демо
  return 2000 + ((n * 727) % 165) * 100;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function TermsTab({
  rental,
  onClientClick,
}: {
  rental: Rental;
  onClientClick?: () => void;
}) {
  const client = CLIENTS.find((c) => c.id === rental.clientId);
  const time = rental.startTime ?? "12:00";
  const location = "Склад \"Северный\"";
  const mileage = mockMileage(rental.scooter);

  return (
    <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr]">
      {/* ============ ЛЕВАЯ КОЛОНКА: СКУТЕР + УСЛОВИЯ ============ */}
      <button
        type="button"
        title="Карточка скутера (скоро)"
        className="group rounded-[14px] border border-border p-4 text-left transition-colors hover:bg-surface-soft/60"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-ink text-white">
            <Bike size={34} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
                  Скутер
                </div>
                <div className="mt-0.5 text-[11px] text-muted-2">Model &amp; ID</div>
                <div className="mt-0.5 font-display text-[18px] font-extrabold leading-tight text-ink">
                  {rental.scooter} · {MODEL_LABEL[rental.model]}
                </div>
              </div>
              <ExternalLink
                size={14}
                className="shrink-0 text-muted-2 opacity-60 transition-opacity group-hover:opacity-100"
              />
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-semibold text-ink-2">
              <Gauge size={12} className="text-muted-2" />
              Пробег: {fmt(mileage)} км
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <InfoCell
            icon={CreditCard}
            label="Тариф"
            value={`от ${TARIFF_PERIOD_LABEL[rental.tariffPeriod].replace(/^от\s+/i, "")} · ${fmt(rental.rate)} ₽/сут`}
          />
          <InfoCell
            icon={CreditCard}
            label="Оплата"
            value={PAYMENT_LABEL[rental.paymentMethod]}
          />
          <InfoCell
            icon={ShieldCheck}
            label="Залог"
            value={`${fmt(rental.deposit || DEPOSIT_AMOUNT)} ₽`}
            hint={
              rental.depositReturned === true
                ? "возвращён клиенту"
                : rental.depositReturned === false
                  ? "удержан"
                  : "на балансе компании"
            }
          />
          <InfoCell
            icon={HelmetIcon}
            label="Экипировка"
            value={
              rental.equipment.length === 0
                ? "не выдавалась"
                : rental.equipment
                    .map(
                      (e) => e.charAt(0).toUpperCase() + e.slice(1),
                    )
                    .join(", ")
            }
          />
        </div>
      </button>

      {/* ============ ПРАВАЯ КОЛОНКА: ГРАФИК АРЕНДЫ ============ */}
      <div className="flex flex-col gap-3 rounded-[14px] border border-border p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
          График аренды
        </div>

        <div className="relative pl-6">
          <span className="absolute left-[6px] top-2 bottom-2 w-px bg-border" />
          {/* Выдача */}
          <div className="relative">
            <span className="absolute -left-[22px] top-1.5 h-3 w-3 rounded-full bg-blue-600 ring-4 ring-blue-600/15" />
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
              Выдача
            </div>
            <div className="mt-0.5 font-display text-[15px] font-extrabold tabular-nums text-ink">
              {rental.start} · {time}
            </div>
            <div className="text-[12px] text-muted">{location}</div>
          </div>
          {/* Возврат план */}
          <div className="relative mt-4">
            <span
              className={cn(
                "absolute -left-[22px] top-1.5 h-3 w-3 rounded-full ring-4",
                rental.status === "overdue"
                  ? "bg-red-ink ring-red-ink/15"
                  : "bg-muted-2 ring-muted-2/15",
              )}
            />
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
              Возврат (план)
            </div>
            <div className="mt-0.5 font-display text-[15px] font-extrabold tabular-nums text-ink">
              {rental.endPlanned} · {time}
            </div>
            <div className="text-[12px] text-muted">{location}</div>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between border-t border-border pt-3 text-[12px]">
          <span className="text-muted-2">Общая длительность</span>
          <span className="font-display text-[15px] font-extrabold tabular-nums text-blue-600">
            {rental.days} {daysWord(rental.days)}
          </span>
        </div>

        {client && (
          <div className="flex items-center gap-3 rounded-[12px] bg-surface-soft px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">
              {initials(client.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-ink">
                {client.name}
              </div>
              <div className="truncate text-[11px] tabular-nums text-muted-2">
                {client.phone}
              </div>
            </div>
            <button
              type="button"
              onClick={onClientClick}
              title="Быстрый просмотр клиента"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-2 hover:bg-blue-50 hover:text-blue-600"
            >
              <ExternalLink size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCell({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div className="mt-1 flex items-start gap-2">
        <Icon size={14} className="mt-[3px] shrink-0 text-muted-2" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">{value}</div>
          {hint && (
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-2">
              {hint}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function daysWord(n: number): string {
  const a = Math.abs(n);
  const n10 = a % 10;
  const n100 = a % 100;
  if (n10 === 1 && n100 !== 11) return "день";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "дня";
  return "дней";
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
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
          {incidents.length > 0 ? `${incidents.length} записей` : "нет инцидентов"}
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
        >
          <Plus size={12} /> Создать инцидент
        </button>
      </div>
      {incidents.length === 0 ? (
        <Empty text="По этой аренде инцидентов нет" />
      ) : (
        <>
          {incidents.map((inc) => (
            <IncidentRow key={inc.id} inc={inc} />
          ))}
        </>
      )}
      {addOpen && (
        <InlineIncidentForm
          rentalId={rental.id}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}

function IncidentRow({
  inc,
}: {
  inc: ReturnType<typeof useRentalIncidents>[number];
}) {
  const left = inc.damage - inc.paid;
  return (
    <div className="rounded-[14px] border border-border p-3">
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
}

function InlineIncidentForm({
  rentalId,
  onClose,
}: {
  rentalId: number;
  onClose: () => void;
}) {
  const [type, setType] = useState("ДТП");
  const [amount, setAmount] = useState("3000");
  const [note, setNote] = useState("");

  return (
    <div className="rounded-[14px] border border-blue-600/30 bg-blue-50/40 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-blue-700">
        Новый инцидент
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-ink">
          Тип
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 h-8 w-full rounded-[8px] border border-border bg-surface px-2 text-[12px] text-ink outline-none focus:border-blue-600"
          >
            <option>ДТП</option>
            <option>Повреждение скутера</option>
            <option>Эвакуация на штрафстоянку</option>
            <option>Кража / пропажа</option>
            <option>Жалоба</option>
            <option>Другое</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-ink">
          Ущерб, ₽
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 h-8 w-full rounded-[8px] border border-border bg-surface px-2 text-[12px] text-ink outline-none focus:border-blue-600"
          />
        </label>
      </div>
      <label className="mt-2 block text-[11px] font-semibold text-ink">
        Описание
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Кратко опишите что произошло"
          className="mt-1 w-full resize-y rounded-[8px] border border-border bg-surface px-2 py-1.5 text-[12px] text-ink outline-none focus:border-blue-600"
        />
      </label>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold text-muted hover:bg-border"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={() => {
            addRentalIncident(rentalId, {
              type,
              date: "13.10.2026",
              damage: Number(amount) || 0,
              note,
            });
            onClose();
          }}
          className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
        >
          Создать
        </button>
      </div>
    </div>
  );
}

/* =================== Задачи =================== */

/** Определение просрочки задачи — простое сравнение со «сегодня» демо-дата 13.10.2026 */
function isTaskOverdue(due: string, done: boolean): boolean {
  if (done) return false;
  const m = due.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return false;
  const due0 = new Date(+m[3], +m[2] - 1, +m[1], 23, 59);
  return Date.now() > due0.getTime() ? false : false || due0 < new Date(2026, 9, 13);
}

export function TasksTab({ rental }: { rental: Rental }) {
  const tasks = useRentalTasks(rental.id);
  if (tasks.length === 0) {
    return <Empty text="К аренде не привязано задач" hint="Задачи создаются автоматически для просрочек и возвратов" />;
  }
  return (
    <div className="flex flex-col gap-2">
      {tasks.map((t) => {
        const overdue = isTaskOverdue(t.due, t.done);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggleTask(t.id)}
            className={cn(
              "flex items-start gap-3 rounded-[12px] border p-3 text-left transition-colors",
              t.done
                ? "border-border opacity-60"
                : overdue
                  ? "border-red-soft bg-red-soft/20 hover:bg-red-soft/40"
                  : "border-border hover:bg-surface-soft",
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
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[13px] font-semibold text-ink",
                    t.done && "line-through",
                  )}
                >
                  {t.title}
                </span>
                {overdue && (
                  <span className="rounded-full bg-red-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-ink">
                    просрочена
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-2">
                <span className="inline-flex items-center gap-1">
                  <Calendar size={11} /> {t.due}
                </span>
                <span>·</span>
                <span>назначена: администратор</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* =================== Документы =================== */

type DocType = "contract" | "issue_act" | "return_act";

const DOC_META: Record<
  DocType,
  { title: string; subtitle: string; icon: typeof FileSignature }
> = {
  contract: {
    title: "Договор аренды",
    subtitle: "PDF с реквизитами клиента и условиями аренды",
    icon: FileSignature,
  },
  issue_act: {
    title: "Акт выдачи скутера",
    subtitle: "Состояние скутера, пробег, залог",
    icon: FileText,
  },
  return_act: {
    title: "Акт возврата скутера",
    subtitle: "Осмотр и итоговый расчёт по аренде",
    icon: FileText,
  },
};

type GeneratedDoc = {
  type: DocType;
  createdAt: string;
};

export function DocumentsTab({ rental }: { rental: Rental }) {
  const client = CLIENTS.find((c) => c.id === rental.clientId);
  const [generated, setGenerated] = useState<GeneratedDoc[]>([]);

  const doGenerate = (type: DocType) => {
    setGenerated((prev) => [
      { type, createdAt: new Date().toLocaleString("ru-RU") },
      ...prev,
    ]);
  };

  const docHtml = (type: DocType) => {
    const meta = DOC_META[type];
    return `<!doctype html><html><head><meta charset="utf-8"><title>${meta.title}</title>
    <style>body{font-family:Inter,sans-serif;padding:40px;color:#111}
    h1{font-size:22px;margin:0 0 6px}
    h2{font-size:15px;margin:20px 0 8px;text-transform:uppercase;letter-spacing:0.05em;color:#666}
    .row{display:flex;gap:8px;padding:4px 0}
    .row b{min-width:180px;color:#666;font-weight:500}
    .signs{margin-top:60px;display:flex;gap:40px}
    .sign{flex:1}
    .sign .line{border-bottom:1px solid #000;height:30px;margin-top:20px}
    .sign .lbl{font-size:12px;color:#666}
    </style></head><body>
    <h1>${meta.title}</h1>
    <div>Договор № ${String(rental.id).padStart(4, "0")} · ${new Date().toLocaleDateString("ru-RU")}</div>

    <h2>Арендодатель</h2>
    <div class="row"><b>Организация</b>ИП Халк Байк</div>

    <h2>Клиент</h2>
    <div class="row"><b>ФИО</b>${client?.name ?? "—"}</div>
    <div class="row"><b>Телефон</b>${client?.phone ?? "—"}</div>

    <h2>Объект аренды</h2>
    <div class="row"><b>Скутер</b>${rental.scooter} · ${MODEL_LABEL[rental.model]}</div>
    <div class="row"><b>Тариф</b>${TARIFF_PERIOD_LABEL[rental.tariffPeriod]} · ${rental.rate} ₽/сут</div>

    <h2>Условия</h2>
    <div class="row"><b>Период</b>${rental.start} ${rental.startTime ?? "12:00"} — ${rental.endPlanned} ${rental.startTime ?? "12:00"}</div>
    <div class="row"><b>Срок</b>${rental.days} дн.</div>
    <div class="row"><b>Сумма аренды</b>${rental.sum.toLocaleString("ru-RU")} ₽</div>
    <div class="row"><b>Залог</b>${(rental.deposit || DEPOSIT_AMOUNT).toLocaleString("ru-RU")} ₽</div>
    ${rental.equipment.length > 0 ? `<div class="row"><b>Экипировка</b>${rental.equipment.join(", ")}</div>` : ""}

    <div class="signs">
      <div class="sign"><div class="line"></div><div class="lbl">Арендодатель / подпись, дата</div></div>
      <div class="sign"><div class="line"></div><div class="lbl">Клиент / подпись, дата</div></div>
    </div>
    </body></html>`;
  };

  const openDoc = (type: DocType) => {
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) return;
    w.document.write(docHtml(type));
    w.document.close();
  };

  const handlePrint = (type: DocType) => {
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) return;
    w.document.write(docHtml(type));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  const handleDownload = (type: DocType) => {
    const blob = new Blob([docHtml(type)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${DOC_META[type].title} · аренда ${String(rental.id).padStart(4, "0")}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid items-stretch gap-2 sm:grid-cols-3">
        {(Object.keys(DOC_META) as DocType[]).map((t) => {
          const meta = DOC_META[t];
          const Icon = meta.icon;
          return (
            <div
              key={t}
              className="flex h-full flex-col gap-3 rounded-[14px] border border-border p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-blue-700">
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold leading-tight text-ink">
                    {meta.title}
                  </div>
                </div>
              </div>
              <div className="flex-1 text-[11px] leading-snug text-muted-2">
                {meta.subtitle}
              </div>
              <button
                type="button"
                onClick={() => {
                  doGenerate(t);
                  openDoc(t);
                }}
                className="rounded-[10px] bg-blue-600 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700"
              >
                Сформировать
              </button>
            </div>
          );
        })}
      </div>

      {generated.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
            Сформированные документы
          </div>
          <div className="overflow-hidden rounded-[14px] border border-border">
            <table className="w-full text-[12px]">
              <thead className="bg-surface-soft text-left text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                <tr>
                  <th className="px-3 py-2">Документ</th>
                  <th className="px-3 py-2">Создан</th>
                  <th className="px-3 py-2 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {generated.map((g, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="px-3 py-2 font-semibold text-ink">
                      {DOC_META[g.type].title}
                    </td>
                    <td className="px-3 py-2 text-muted-2 tabular-nums">
                      {g.createdAt}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openDoc(g.type)}
                          className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-semibold text-ink-2 hover:bg-border"
                          title="Просмотр"
                        >
                          <FileText size={11} /> Открыть
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(g.type)}
                          className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-semibold text-ink-2 hover:bg-border"
                        >
                          <Download size={11} /> Скачать
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrint(g.type)}
                          className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-semibold text-ink-2 hover:bg-border"
                        >
                          <Printer size={11} /> Печать
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
