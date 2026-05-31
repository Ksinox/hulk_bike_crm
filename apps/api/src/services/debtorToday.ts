/**
 * v0.8 — Резолвер «что делать сегодня» для экрана «Утро».
 *
 * На вход — список активных должников. На выход:
 *  - hottest: самое срочное дело (hero-карточка)
 *  - queue:   ещё 3-5 задач второго плана
 *  - total:   {count, sum} сводка по всем активным
 *
 * Логика:
 *  1. Каждому должнику пытаемся подобрать TodayAction (что у него горит).
 *  2. Hot/Warm/Cool классификация — по правилам ниже.
 *  3. Сортировка очереди: Hot (по сумме DESC) → Warm → Cool.
 *  4. hottest = первый Hot если есть, иначе самый приоритетный по priority.
 */

import { sortByPriority } from "./debtorPriority.js";
import {
  hasSystematicViolations,
  isPaymentOverdue,
  overdueDays,
  type PaymentForOverdue,
} from "./debtorOverdue.js";
import { isClosed, stageLabel, type DebtType, type Stage } from "./debtorStages.js";

export type TodayActionKind =
  | "systematic_violation" // 3 просрочки подряд → юрист
  | "overdue_call"         // просрочка платежа N дней → позвонить
  | "lawyer_check"         // долго у юриста без апдейта
  | "insurance_reminder"   // напоминание про страховую
  | "payment_due_today"    // плановый платёж сегодня
  | "first_contact"        // свежее дело — нужен первый контакт
  | "in_progress";         // активное дело без горящего триггера

export type TodayAction = {
  kind: TodayActionKind;
  /** Срочность задачи. Цвет UI зависит от этого. */
  priority: "hot" | "warm" | "cool";
  /** Короткий текст (≤ 60 симв) для карточки задачи. */
  text: string;
  /** Лейбл и роут для главной кнопки. */
  primaryAction: {
    label: string;
    /** Относительно /debtors/:id. Например "/transfer-lawyer" или "" (просто открыть). */
    target: string;
  };
};

export type DebtorForToday = {
  id: number;
  caseNumber: string;
  type: DebtType;
  stage: Stage;
  stageEnteredAt: Date | string;
  lastLawyerUpdateAt: Date | string | null;
  totalAmount: number;
  psyRating: number;
  clientStatus: "active" | "closed";
  clientName: string; // ФИО для отображения (откуда — caller'у решать)
  payments: PaymentForOverdue[];
  /** Опционально: запланированное напоминание (для insurance_reminder). */
  reminderDate?: Date | string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSince(d: Date | string, today: Date): number {
  const t = typeof d === "string" ? new Date(d) : d;
  return Math.floor((today.getTime() - t.getTime()) / MS_PER_DAY);
}

function isSameDay(a: Date | string, b: Date): boolean {
  const da = typeof a === "string" ? new Date(a) : a;
  return (
    da.getFullYear() === b.getFullYear() &&
    da.getMonth() === b.getMonth() &&
    da.getDate() === b.getDate()
  );
}

/** Определяет что у должника требует действий сегодня. */
export function getTodayAction(
  d: DebtorForToday,
  today: Date = new Date(),
): TodayAction | null {
  if (isClosed(d.stage)) return null;

  // HOT 1: систематическое нарушение
  if (
    d.stage === "payment_schedule" &&
    hasSystematicViolations(d.payments, today)
  ) {
    return {
      kind: "systematic_violation",
      priority: "hot",
      text: "3-я просрочка подряд · рекомендация юристу",
      primaryAction: {
        label: "Передать юристу",
        target: "/transfer-lawyer",
      },
    };
  }

  // HOT 2: длинная просрочка платежа (≥ 3 дня)
  const od = overdueDays(d.payments, today);
  if (od >= 3) {
    return {
      kind: "overdue_call",
      priority: "hot",
      text: `Просрочка ${od} ${pluralDays(od)} · позвонить`,
      primaryAction: { label: "Открыть и разобраться", target: "" },
    };
  }

  // WARM 1: юрист долго молчит (15+ дней)
  if (d.stage === "lawyer") {
    const lastUpdate = d.lastLawyerUpdateAt ?? d.stageEnteredAt;
    const since = daysSince(lastUpdate, today);
    if (since >= 15) {
      return {
        kind: "lawyer_check",
        priority: "warm",
        text: `${since} дней без отчёта от юриста`,
        primaryAction: {
          label: "Запросить смету",
          target: "/lawyer-update",
        },
      };
    }
  }

  // WARM 2: напоминание про страховую сегодня
  if (
    (d.stage === "insurance_eval" || d.stage === "insurance_wait") &&
    d.reminderDate &&
    isSameDay(d.reminderDate, today)
  ) {
    return {
      kind: "insurance_reminder",
      priority: "warm",
      text: "Напоминание — уточнить статус в страховой",
      primaryAction: { label: "Открыть дело", target: "" },
    };
  }

  // COOL: плановый платёж сегодня
  const todayPayment = d.payments.find(
    (p) => !p.paidAt && isSameDay(p.scheduledDate, today),
  );
  if (todayPayment) {
    return {
      kind: "payment_due_today",
      priority: "cool",
      text: "Плановый платёж сегодня — зафиксировать",
      primaryAction: { label: "Зафиксировать платёж", target: "/payment" },
    };
  }

  // COOL 2: короткая просрочка 1-2 дня (тоже видна, но не Hot)
  if (od >= 1) {
    return {
      kind: "overdue_call",
      priority: "warm",
      text: `Просрочка ${od} ${pluralDays(od)} · позвонить`,
      primaryAction: { label: "Открыть и разобраться", target: "" },
    };
  }

  // Просрочен один платёж (≤ 0 не сработает выше — это 0 дней)
  if (d.payments.some((p) => isPaymentOverdue(p, today))) {
    return {
      kind: "overdue_call",
      priority: "warm",
      text: "Платёж не пришёл сегодня — проверить",
      primaryAction: { label: "Открыть", target: "" },
    };
  }

  // FALLBACK: у дела нет «горящего» триггера, но оно активно. Всё равно
  // отдаём действие — директор должен видеть КАЖДОГО должника на «Утре»
  // и иметь возможность работать с ним (звонить, ставить статус, заметки).

  // Свежее дело (только заведено / досудебка без графика) — первый контакт:
  // связаться и договориться о возврате долга.
  if (d.stage === "created" || d.stage === "pretrial") {
    return {
      kind: "first_contact",
      priority: "warm",
      text: "Новое дело — связаться и договориться",
      primaryAction: { label: "Открыть и разобраться", target: "" },
    };
  }

  // Прочие активные стадии (у юриста / в суде / страховая / график без
  // просрочки) — держим на радаре «спокойной» задачей.
  return {
    kind: "in_progress",
    priority: "cool",
    text: `В работе · ${stageLabel(d.stage)}`,
    primaryAction: { label: "Открыть дело", target: "" },
  };
}

function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
  return "дней";
}

export type TodayBundle = {
  hottest: { debtor: DebtorForToday; action: TodayAction } | null;
  queue: { debtor: DebtorForToday; action: TodayAction }[];
  totalActiveCount: number;
  totalActiveSum: number;
};

const PRIORITY_ORDER: Record<TodayAction["priority"], number> = {
  hot: 0,
  warm: 1,
  cool: 2,
};

/** Возвращает разложение «Утра» для отображения. */
export function getTodayBundle(
  debtors: DebtorForToday[],
  today: Date = new Date(),
): TodayBundle {
  // Активные дела (не закрытые)
  const active = debtors.filter((d) => !isClosed(d.stage));

  // Собираем все с действиями на сегодня
  const withActions = active
    .map((debtor) => ({ debtor, action: getTodayAction(debtor, today) }))
    .filter((x): x is { debtor: DebtorForToday; action: TodayAction } => x.action !== null);

  // Сортируем: hot первые (по сумме DESC), потом warm, потом cool
  const sorted = withActions.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.action.priority];
    const pb = PRIORITY_ORDER[b.action.priority];
    if (pa !== pb) return pa - pb;
    // в рамках одного приоритета — по сумме DESC
    return b.debtor.totalAmount - a.debtor.totalAmount;
  });

  // hottest — первый hot. Если hot'ов нет — null (тогда UI покажет просто
  // 4 task-row'а без hero).
  const hottest = sorted.find((x) => x.action.priority === "hot") ?? null;
  // queue — все остальные (без hottest)
  const queue = sorted.filter((x) => x !== hottest);

  return {
    hottest,
    queue,
    totalActiveCount: active.length,
    totalActiveSum: active.reduce((s, d) => s + d.totalAmount, 0),
  };
}

/** Все активные дела, отсортированные по приоритету — для экрана «Список». */
export function getActiveList(debtors: DebtorForToday[]): DebtorForToday[] {
  return sortByPriority(debtors);
}
