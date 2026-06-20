import { useMemo, useState } from "react";
import { Undo2, X, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { useApiPayments, type ApiPayment } from "@/lib/api/payments";
import type { ApiActivityItem } from "@/lib/api/activity";
import {
  rollbackLastPayment,
  rollbackAction,
  rollbackCompletion,
} from "./rentalsStore";
import type { Rental } from "@/lib/mock/rentals";

/**
 * «Откатить последнее действие» — защита от ошибочных действий «в день
 * совершения». Кнопка «Откатить» висит ПРЯМО НА СТРОКЕ той операции в
 * хронологии. Условие истекло (наступил следующий день / появилось новое
 * действие сверху) — кнопки нет.
 *
 * Поддержанные операции (Phase 1–3):
 *   • extend       — продление (вернуть период/сумму, удалить платёж);
 *   • equipment    — изменение экипировки (вернуть набор, отменить доплату/возврат);
 *   • created      — создание аренды (в архив, скутер освободить);
 *   • payment      — приём оплаты долга/просрочки/штрафа (un-pay);
 *   • security     — пополнение залога (вернуть прежний залог, удалить платёж);
 *   • completed    — завершение аренды (снова активная, отменить возврат залога);
 *   • manual_debt  — начисление ручного долга (удалить запись);
 *   • forgive_*    — прощение штрафа / дней / всей просрочки (долг вернётся,
 *                    сдвиг возврата отменится).
 *
 * Якорь: идём по хронологии сверху и берём первое «эффективное» state-событие,
 * перешагивая пары (откат + отменённая им операция) — поэтому после отката
 * верхней операции кнопка появляется на предыдущей (peel, слой за слоем).
 * Бэк проверяет то же самое (rollback-payment / rollback-action), фронт лишь
 * решает, где показать кнопку.
 */

export type PayKind = "overdue_days" | "overdue_fine" | "manual";

export type RollbackTarget =
  | {
      kind: "extend";
      anchorId: number;
      paymentId: number;
      extraDays: number;
      amount: number;
    }
  | {
      kind: "equipment";
      anchorId: number;
      paymentId: number;
      amount: number;
      isRefund: boolean;
    }
  | { kind: "created"; anchorId: number; paymentId: number; amount: number }
  | {
      kind: "payment";
      anchorId: number;
      paymentId: number;
      amount: number;
      payKind: PayKind;
    }
  | { kind: "security"; anchorId: number; paymentId: number; amount: number }
  | { kind: "completed"; anchorId: number }
  | { kind: "manual_debt"; anchorId: number; activityId: number; amount: number }
  | { kind: "forgive_fine"; anchorId: number; activityId: number; amount: number }
  | {
      kind: "forgive_days";
      anchorId: number;
      activityId: number;
      amount: number;
      fineAmount: number;
      daysShift: number;
    }
  | {
      kind: "forgive_all";
      anchorId: number;
      activityId: number;
      amountDays: number;
      amountFine: number;
      daysShift: number;
    }
  | {
      kind: "swap";
      anchorId: number;
      activityId: number;
      feeAmount: number;
      refundAmount: number;
    }
  | {
      kind: "parking_set";
      anchorId: number;
      activityId: number;
      days: number;
      amount: number;
    }
  | { kind: "parking_end"; anchorId: number; activityId: number }
  | {
      kind: "parking_paid";
      anchorId: number;
      paymentId: number;
      amount: number;
      /** Если паркинг был ПОСТАВЛЕН и сразу ОПЛАЧЕН одним потоком — ссылка на
       *  событие постановки (parking_set) того же дня. Тогда откат предлагает
       *  выбор: снять только оплату или ещё и постановку (иначе оператор не
       *  догадается, что откатывать надо дважды). */
      underlyingSet?: { activityId: number; days: number; amount: number };
    };

export type RollbackKind = RollbackTarget["kind"];

/* ─────────────── Якорь: «последнее эффективное действие» ─────────────── */

/** State-события — зеркало бэкенда (ROLLBACK_STATE_ACTIONS в rentals.ts). */
const STATE_ACTIONS = new Set([
  "created",
  "completed",
  "revert_completion",
  "rental_extended",
  "equipment_changed",
  "debt_payment",
  "debt_manual",
  "debt_overdue_days_forgiven",
  "debt_overdue_fine_forgiven",
  "debt_overdue_forgiven",
  "debt_entry_deleted",
  "security_topped_up",
  "scooter_swapped",
  "scooter_swap_deleted",
  "payment_rolled_back",
  "action_rolled_back",
  "updated",
  "archived",
  "unarchived",
  "chain_reset",
  "parking_set",
  "parking_ended",
  "parking_deleted",
  "parking_paid",
  "status_changed",
]);

/** Какую операцию отменяет строка-откат (для «прозрачности» пар). */
function cancelMatcher(row: ApiActivityItem): ((a: string) => boolean) | null {
  const m = (row.meta ?? {}) as Record<string, unknown>;
  const kind = typeof m.kind === "string" ? m.kind : null;
  if (row.action === "payment_rolled_back") {
    if (kind === "equipment") return (a) => a === "equipment_changed";
    if (kind === "created") return (a) => a === "created";
    if (kind === "payment") return (a) => a === "debt_payment";
    if (kind === "security") return (a) => a === "security_topped_up";
    if (kind === "parking") return (a) => a === "parking_paid";
    return (a) => a === "rental_extended";
  }
  if (row.action === "action_rolled_back") {
    if (kind === "manual_debt") return (a) => a === "debt_manual";
    if (kind === "forgive_fine") return (a) => a === "debt_overdue_fine_forgiven";
    if (kind === "forgive_days") return (a) => a === "debt_overdue_days_forgiven";
    if (kind === "forgive_all") return (a) => a === "debt_overdue_forgiven";
    if (kind === "swap") return (a) => a === "scooter_swapped";
    if (kind === "parking_set") return (a) => a === "parking_set";
    if (kind === "parking_end") return (a) => a === "parking_ended";
    return null;
  }
  if (row.action === "revert_completion") return (a) => a === "completed";
  return null;
}

function fmtRub(n: number): string {
  return n.toLocaleString("ru-RU");
}

/** ДД.ММ.ГГГГ → Date (локальная полночь) или null. */
function parseRu(s: string): Date | null {
  const m = s?.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}
function fmtRu(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}
/** Календарная дата по Москве (YYYY-MM-DD) из ISO — для границы «сегодня». */
function mskDay(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Минимум полей аренды для вычисления/выполнения отката — id (платежи,
 *  rollback-вызовы) + status (детект «завершения»). Позволяет звать откат там,
 *  где под рукой только rentalId (напр. тостовая «Отмена», SecurityTopupDialog). */
export type RollbackRentalRef = Pick<Rental, "id" | "status">;

/** Чистая (без хуков) версия — нужна и для тостовой «Отмены» (undoLastRentalAction
 *  тянет свежую хронологию+платежи и зовёт это), и для хука ниже. */
export function computeRollbackTarget(
  rental: RollbackRentalRef,
  activity: ApiActivityItem[],
  payments: ApiPayment[],
): RollbackTarget | null {
  {
    // 1) Эффективная верхняя state-строка (скип пар откат+операция).
    let anchor: ApiActivityItem | null = null;
    const stack: Array<(a: string) => boolean> = [];
    for (const row of activity) {
      if (!STATE_ACTIONS.has(row.action)) continue;
      const m = cancelMatcher(row);
      if (m) {
        stack.push(m);
        continue;
      }
      const top = stack[stack.length - 1];
      if (top && top(row.action)) {
        stack.pop();
        continue;
      }
      anchor = row;
      break;
    }
    if (!anchor) return null;
    const today = mskDay(new Date().toISOString());
    if (mskDay(anchor.createdAt) !== today) return null;
    const meta = (anchor.meta ?? {}) as Record<string, unknown>;

    // 2) Для платёжных видов нужен последний платёж аренды (он же — платёж
    //    операции; после отката верхних слоёв их платежи уже удалены).
    const rows = (payments ?? []).filter((p) => p.rentalId === rental.id);
    const lastPay = [...rows].sort((a, b) => b.id - a.id)[0];
    const payToday = !!lastPay && mskDay(lastPay.createdAt) === today;
    const note = lastPay?.note ?? "";

    // Продление — последний платёж с пометкой «продление на N дн».
    if (anchor.action.includes("extend")) {
      if (!lastPay || !payToday) return null;
      const m = note.match(/продлени[ея]\s+на\s+(\d+)\s*дн/i);
      if (!m) return null;
      return {
        kind: "extend",
        anchorId: anchor.id,
        paymentId: lastPay.id,
        extraDays: Number(m[1]),
        amount: lastPay.amount,
      };
    }

    // Экипировка — только если последний платёж это её доплата/возврат
    // (изменение «в долг» платежа не создаёт → откат пока не показываем).
    if (anchor.action.includes("equipment")) {
      if (!lastPay || !payToday) return null;
      if (!/экипировк/i.test(note)) return null;
      return {
        kind: "equipment",
        anchorId: anchor.id,
        paymentId: lastPay.id,
        amount: lastPay.amount,
        isRefund: /возврат/i.test(note),
      };
    }

    // Создание аренды — последний платёж это «оплата аренды при создании».
    if (anchor.action === "created") {
      if (!lastPay || !payToday) return null;
      if (!/оплата\s+аренды.*создани/i.test(note)) return null;
      return {
        kind: "created",
        anchorId: anchor.id,
        paymentId: lastPay.id,
        amount: lastPay.amount,
      };
    }

    // Приём оплаты долга — последний платёж это rent/fine с пометкой
    // «N дн просрочки» / «штрафа просрочки» / «ручного долга».
    if (anchor.action === "debt_payment") {
      if (!lastPay || !payToday) return null;
      let payKind: PayKind | null = null;
      if (/\d+\s*дн\s+просрочки|просрочки\s*\(продление/i.test(note))
        payKind = "overdue_days";
      else if (/штрафа\s+просрочки/i.test(note)) payKind = "overdue_fine";
      else if (/ручного\s+долга/i.test(note)) payKind = "manual";
      if (!payKind) return null;
      return {
        kind: "payment",
        anchorId: anchor.id,
        paymentId: lastPay.id,
        amount: lastPay.amount,
        payKind,
      };
    }

    // Пополнение залога — последний платёж с пометкой «пополнение залога».
    if (anchor.action === "security_topped_up") {
      if (!lastPay || !payToday) return null;
      if (!/пополнение\s+залога/i.test(note)) return null;
      return {
        kind: "security",
        anchorId: anchor.id,
        paymentId: lastPay.id,
        amount: lastPay.amount,
      };
    }

    // Завершение аренды — откат через revert-completion (платёж не нужен).
    if (anchor.action === "completed") {
      if (String(rental.status) !== "completed") return null;
      return { kind: "completed", anchorId: anchor.id };
    }

    // Начисление ручного долга — без платежа, якорь = событие журнала.
    if (anchor.action === "debt_manual") {
      if (typeof meta.entryId !== "number") return null; // legacy-записи
      return {
        kind: "manual_debt",
        anchorId: anchor.id,
        activityId: anchor.id,
        amount: Number(meta.amount ?? 0),
      };
    }

    // Прощение штрафа.
    if (anchor.action === "debt_overdue_fine_forgiven") {
      if (typeof meta.entryId !== "number") return null;
      return {
        kind: "forgive_fine",
        anchorId: anchor.id,
        activityId: anchor.id,
        amount: Number(meta.amount ?? 0),
      };
    }

    // Прощение дней (+авто-штраф, со сдвигом возврата).
    if (anchor.action === "debt_overdue_days_forgiven") {
      if (!Array.isArray(meta.entryIds) || meta.entryIds.length === 0)
        return null;
      return {
        kind: "forgive_days",
        anchorId: anchor.id,
        activityId: anchor.id,
        amount: Number(meta.amount ?? 0),
        fineAmount: Number(meta.fineAmount ?? 0),
        daysShift: Number(meta.daysToShift ?? 0),
      };
    }

    // Сброс всей просрочки (дни + штраф, со сдвигом возврата).
    if (anchor.action === "debt_overdue_forgiven") {
      if (!Array.isArray(meta.entryIds) || meta.entryIds.length === 0)
        return null;
      return {
        kind: "forgive_all",
        anchorId: anchor.id,
        activityId: anchor.id,
        amountDays: Number(meta.amountDays ?? 0),
        amountFine: Number(meta.amountFine ?? 0),
        daysShift: Number(meta.daysShift ?? 0),
      };
    }

    // Замена скутера (свап) — без платежа, якорь = событие журнала.
    if (anchor.action === "scooter_swapped") {
      if (typeof meta.swapId !== "number") return null; // legacy
      return {
        kind: "swap",
        anchorId: anchor.id,
        activityId: anchor.id,
        feeAmount: Number(meta.feeAmount ?? 0),
        refundAmount: Number(meta.refundAmount ?? 0),
      };
    }

    // Постановка на паркинг.
    if (anchor.action === "parking_set") {
      if (typeof meta.sessionId !== "number") return null;
      const p = (meta.parking ?? {}) as Record<string, unknown>;
      return {
        kind: "parking_set",
        anchorId: anchor.id,
        activityId: anchor.id,
        days: Number(p.days ?? 0),
        amount: Number(p.amount ?? 0),
      };
    }

    // Снятие с паркинга.
    if (anchor.action === "parking_ended") {
      if (typeof meta.sessionId !== "number" || !meta.before) return null;
      return { kind: "parking_end", anchorId: anchor.id, activityId: anchor.id };
    }

    // Оплата паркинга — платёж с пометкой «Оплата паркинга».
    if (anchor.action === "parking_paid") {
      if (!lastPay || !payToday) return null;
      if (!/оплата\s+паркинга/i.test(note)) return null;
      // Ближайшее state-событие НИЖЕ оплаты: если это постановка (parking_set)
      // того же дня — паркинг поставили и сразу оплатили одним потоком. Тогда
      // дадим выбрать, откатывать ли заодно и постановку.
      let underlyingSet:
        | { activityId: number; days: number; amount: number }
        | undefined;
      const anchorIdx = activity.findIndex((r) => r.id === anchor.id);
      for (let j = anchorIdx + 1; j < activity.length; j++) {
        const r = activity[j];
        if (!STATE_ACTIONS.has(r.action)) continue;
        const sm = (r.meta ?? {}) as Record<string, unknown>;
        if (
          r.action === "parking_set" &&
          mskDay(r.createdAt) === today &&
          typeof sm.sessionId === "number"
        ) {
          const p = (sm.parking ?? {}) as Record<string, unknown>;
          underlyingSet = {
            activityId: r.id,
            days: Number(p.days ?? 0),
            amount: Number(p.amount ?? 0),
          };
        }
        break; // только ближайшее state-событие ниже оплаты
      }
      return {
        kind: "parking_paid",
        anchorId: anchor.id,
        paymentId: lastPay.id,
        amount: lastPay.amount,
        underlyingSet,
      };
    }

    return null;
  }
}

export function useRollbackTarget(
  rental: Rental,
  activity: ApiActivityItem[],
): RollbackTarget | null {
  const { data: payments } = useApiPayments(rental.id);
  return useMemo<RollbackTarget | null>(
    () => computeRollbackTarget(rental, activity, payments ?? []),
    [activity, payments, rental.id, rental.status],
  );
}

/**
 * Выполнить откат по target (БЕЗ тостов). Единая точка диспетчеризации —
 * используется и кнопкой «Откатить» в таймлайне (doRollback ниже), и тостовой
 * «Отменой» (undoLastRentalAction). Менять диспетчеризацию — ТОЛЬКО здесь;
 * doRollback тоже зовёт эту функцию.
 *   parkScope (для оплаченного паркинга со связкой постановки): "both" —
 *   снять и оплату, и постановку (дефолт); "payment" — только оплату.
 */
export async function executeRollbackTarget(
  rental: Pick<Rental, "id">,
  target: RollbackTarget,
  opts?: { parkScope?: "payment" | "both" },
): Promise<void> {
  if (target.kind === "completed") {
    await rollbackCompletion(rental.id);
    return;
  }
  if (
    target.kind === "manual_debt" ||
    target.kind === "forgive_fine" ||
    target.kind === "forgive_days" ||
    target.kind === "forgive_all" ||
    target.kind === "swap" ||
    target.kind === "parking_set" ||
    target.kind === "parking_end"
  ) {
    await rollbackAction(rental.id, target.activityId);
    return;
  }
  if (target.kind === "parking_paid") {
    await rollbackLastPayment(rental.id, target.paymentId);
    if (target.underlyingSet && (opts?.parkScope ?? "both") === "both") {
      await rollbackAction(rental.id, target.underlyingSet.activityId);
    }
    return;
  }
  // extend / created / payment / security / equipment
  await rollbackLastPayment(rental.id, target.paymentId);
}

/* ───────────────────────────── Кнопка + модал ───────────────────────── */

const TITLE_BY_KIND: Record<RollbackKind, string> = {
  extend: "Откатить продление?",
  equipment: "Откатить изменение экипировки?",
  created: "Откатить создание аренды?",
  payment: "Откатить оплату?",
  security: "Откатить пополнение залога?",
  completed: "Откатить завершение аренды?",
  manual_debt: "Откатить начисление долга?",
  forgive_fine: "Откатить прощение штрафа?",
  forgive_days: "Откатить прощение дней?",
  forgive_all: "Откатить прощение просрочки?",
  swap: "Откатить замену скутера?",
  parking_set: "Откатить постановку на паркинг?",
  parking_end: "Откатить снятие с паркинга?",
  parking_paid: "Откатить оплату паркинга?",
};

const LOCK_BY_KIND: Record<RollbackKind, string> = {
  extend: "Платёж продления удалится, период вернётся. ",
  equipment: "Прежний набор экипировки вернётся, платёж удалится. ",
  created: "Аренда уйдёт в архив, скутер освободится, платёж создания удалится. ",
  payment: "Платёж удалится, долг снова станет открытым. ",
  security: "Платёж пополнения удалится, залог вернётся к прежней сумме. ",
  completed:
    "Аренда снова станет активной, возврат залога отменится, скутер — занят. ",
  manual_debt: "Начисленная запись долга удалится. ",
  forgive_fine: "Списание удалится — штраф снова появится в долге. ",
  forgive_days:
    "Списание удалится, дата возврата сдвинется назад — долг снова появится. ",
  forgive_all:
    "Списания удалятся, дата возврата сдвинется назад — долг снова появится. ",
  swap: "Вернётся прежний скутер, доплата/возврат разницы отменятся. ",
  parking_set:
    "Сессия паркинга удалится, дата возврата вернётся назад, стикер исчезнет. ",
  parking_end: "Сессия паркинга снова станет открытой. ",
  parking_paid: "Платёж удалится, долг по паркингу снова станет открытым. ",
};

export function RollbackButton({
  rental,
  target,
  onClose,
}: {
  rental: Rental;
  target: RollbackTarget;
  /** Откат создания аренды архивирует её — карточку нужно закрыть. */
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Для оплаченного паркинга со связанной постановкой: что откатывать —
  // только оплату или ещё и постановку. По умолчанию — всё (частый случай:
  // паркинг поставили по ошибке).
  const [parkScope, setParkScope] = useState<"payment" | "both">("both");

  const doRollback = async () => {
    setBusy(true);
    try {
      await executeRollbackTarget(rental, target, { parkScope });
      if (target.kind === "completed") {
        toast.success("Завершение откачено", "Аренда снова активная");
      } else if (target.kind === "manual_debt") {
        toast.success(
          "Начисление откачено",
          `Долг ${fmtRub(target.amount)} ₽ удалён`,
        );
      } else if (target.kind === "swap") {
        toast.success("Замена скутера откачена", "Вернулся прежний скутер");
      } else if (target.kind === "parking_set") {
        toast.success("Постановка на паркинг откачена", "Сессия удалена");
      } else if (target.kind === "parking_end") {
        toast.success("Снятие с паркинга откачено", "Сессия снова открыта");
      } else if (
        target.kind === "forgive_fine" ||
        target.kind === "forgive_days" ||
        target.kind === "forgive_all"
      ) {
        toast.success("Прощение откачено", "Долг снова в работе");
      } else if (target.kind === "parking_paid") {
        toast.success(
          target.underlyingSet && parkScope === "both"
            ? "Паркинг откачен"
            : "Оплата паркинга откачена",
          target.underlyingSet && parkScope === "both"
            ? `Снято ${fmtRub(target.amount)} ₽, постановка отменена`
            : target.underlyingSet
              ? `Снято ${fmtRub(target.amount)} ₽ — паркинг остался в долг`
              : `Снято ${fmtRub(target.amount)} ₽`,
        );
      } else if (target.kind === "extend") {
        toast.success("Продление откачено", `Вернулось ${fmtRub(target.amount)} ₽`);
      } else if (target.kind === "created") {
        toast.success("Создание аренды откачено", "Аренда отправлена в архив");
      } else if (target.kind === "payment") {
        toast.success("Оплата откачена", `Снято ${fmtRub(target.amount)} ₽`);
      } else if (target.kind === "security") {
        toast.success(
          "Пополнение залога откачено",
          `${fmtRub(target.amount)} ₽ — платёж удалён`,
        );
      } else if (target.kind === "equipment") {
        toast.success(
          "Изменение экипировки откачено",
          target.isRefund
            ? `Возврат ${fmtRub(target.amount)} ₽ отменён`
            : `Доплата ${fmtRub(target.amount)} ₽ отменена`,
        );
      }
      setOpen(false);
      // Аренда ушла в архив — закрываем карточку (её больше нет в активных).
      if (target.kind === "created") onClose?.();
    } catch (e) {
      toast.error(
        "Не удалось откатить",
        e instanceof ApiError ? e.message : (e as Error)?.message ?? "",
      );
    } finally {
      setBusy(false);
    }
  };

  // Заголовок/подсказка зависят от того, оплаченный ли это паркинг со связкой
  // (тогда речь про весь паркинг, а не только платёж) и что выбрано откатить.
  const hasParkChoice =
    target.kind === "parking_paid" && !!target.underlyingSet;
  const dialogTitle = hasParkChoice
    ? "Откатить паркинг?"
    : TITLE_BY_KIND[target.kind];
  const lockText = hasParkChoice
    ? parkScope === "both"
      ? "Платёж удалится, сессия паркинга удалится, дата возврата вернётся назад. "
      : "Платёж удалится, долг по паркингу снова откроется (паркинг останется). "
    : LOCK_BY_KIND[target.kind];

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setParkScope("both");
          setOpen(true);
        }}
        title="Откатить это действие (доступно только сегодня)"
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 shadow-sm ring-1 ring-inset ring-amber-200 transition-colors hover:bg-amber-100 hover:text-amber-800"
      >
        <Undo2 size={11} /> Откатить
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-sm animate-modal-in rounded-2xl bg-surface p-5 shadow-card-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[15px] font-bold text-ink">
                {dialogTitle}
              </div>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                aria-label="Закрыть"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-2 hover:bg-surface-soft"
              >
                <X size={16} />
              </button>
            </div>

            {target.kind === "extend" ? (
              <ExtendPreview rental={rental} target={target} />
            ) : target.kind === "created" ? (
              <CreatedPreview target={target} />
            ) : target.kind === "payment" ? (
              <PaymentPreview target={target} />
            ) : target.kind === "equipment" ? (
              <EquipmentPreview target={target} />
            ) : target.kind === "security" ? (
              <SecurityPreview target={target} />
            ) : target.kind === "completed" ? (
              <CompletedPreview />
            ) : target.kind === "manual_debt" ? (
              <ManualDebtPreview target={target} />
            ) : target.kind === "swap" ? (
              <SwapPreview target={target} />
            ) : target.kind === "parking_set" ? (
              <ParkingSetPreview target={target} />
            ) : target.kind === "parking_end" ? (
              <ParkingEndPreview />
            ) : target.kind === "parking_paid" ? (
              <ParkingPaidPreview
                target={target}
                scope={parkScope}
                onScope={setParkScope}
              />
            ) : (
              <ForgivePreview rental={rental} target={target} />
            )}

            <div className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted">
              <Lock size={13} className="mt-px shrink-0" />
              {lockText}
              Доступно только сегодня — завтра откатить уже нельзя.
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-soft disabled:opacity-50"
              >
                Оставить
              </button>
              <button
                type="button"
                onClick={doRollback}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-amber-600 px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                <Undo2 size={14} /> {busy ? "Откатываем…" : "Откатить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ───────────────────────────── Превью видов ─────────────────────────── */

function ExtendPreview({
  rental,
  target,
}: {
  rental: Rental;
  target: Extract<RollbackTarget, { kind: "extend" }>;
}) {
  const curEnd = parseRu(rental.endPlanned);
  const newEnd = curEnd
    ? new Date(curEnd.getTime() - target.extraDays * 86_400_000)
    : null;
  const sumAfter = rental.sum - target.amount;
  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <Row label="Продление" before={`+${target.extraDays} дн`} after="убрать" />
      {curEnd && newEnd && (
        <Row label="Возврат" before={fmtRu(curEnd)} after={fmtRu(newEnd)} />
      )}
      <Row
        label="Сумма аренды"
        before={`${fmtRub(rental.sum)} ₽`}
        after={`${fmtRub(sumAfter)} ₽`}
        accent
      />
    </div>
  );
}

function PaymentPreview({
  target,
}: {
  target: Extract<RollbackTarget, { kind: "payment" }>;
}) {
  const label =
    target.payKind === "overdue_days"
      ? "Выкуп просрочки"
      : target.payKind === "overdue_fine"
        ? "Оплата штрафа"
        : "Оплата долга";
  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <Row
        label={label}
        before={`${fmtRub(target.amount)} ₽`}
        after="отменить"
        accent
      />
    </div>
  );
}

function CreatedPreview({
  target,
}: {
  target: Extract<RollbackTarget, { kind: "created" }>;
}) {
  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <Row label="Аренда" before="создана" after="в архив" />
      <Row
        label="Платёж создания"
        before={`${fmtRub(target.amount)} ₽`}
        after="удалить"
        accent
      />
    </div>
  );
}

function EquipmentPreview({
  target,
}: {
  target: Extract<RollbackTarget, { kind: "equipment" }>;
}) {
  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <Row label="Экипировка" before="изменена" after="вернуть прежнюю" />
      <Row
        label={target.isRefund ? "Возврат клиенту" : "Доплата"}
        before={`${fmtRub(target.amount)} ₽`}
        after="отменить"
        accent
      />
    </div>
  );
}

function SecurityPreview({
  target,
}: {
  target: Extract<RollbackTarget, { kind: "security" }>;
}) {
  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <Row
        label="Пополнение залога"
        before={`${fmtRub(target.amount)} ₽`}
        after="отменить"
        accent
      />
    </div>
  );
}

function CompletedPreview() {
  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <Row label="Аренда" before="завершена" after="снова активная" />
      <Row label="Возврат залога" before="оформлен" after="отменить" />
      <Row label="Скутер" before="свободен" after="занят арендой" accent />
    </div>
  );
}

function ManualDebtPreview({
  target,
}: {
  target: Extract<RollbackTarget, { kind: "manual_debt" }>;
}) {
  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <Row
        label="Начисленный долг"
        before={`${fmtRub(target.amount)} ₽`}
        after="удалить"
        accent
      />
    </div>
  );
}

function ForgivePreview({
  rental,
  target,
}: {
  rental: Rental;
  target: Extract<
    RollbackTarget,
    { kind: "forgive_fine" | "forgive_days" | "forgive_all" }
  >;
}) {
  const total =
    target.kind === "forgive_all"
      ? target.amountDays + target.amountFine
      : target.kind === "forgive_days"
        ? target.amount + target.fineAmount
        : target.amount;
  const daysShift = target.kind === "forgive_fine" ? 0 : target.daysShift;
  const curEnd = parseRu(rental.endPlanned);
  const backEnd =
    curEnd && daysShift > 0
      ? new Date(curEnd.getTime() - daysShift * 86_400_000)
      : null;
  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <Row
        label="Прощено"
        before={`${fmtRub(total)} ₽`}
        after="вернуть в долг"
        accent
      />
      {target.kind === "forgive_days" && target.fineAmount > 0 && (
        <Row
          label="в т.ч. авто-штраф"
          before={`${fmtRub(target.fineAmount)} ₽`}
          after="тоже вернётся"
        />
      )}
      {curEnd && backEnd && (
        <Row label="Возврат" before={fmtRu(curEnd)} after={fmtRu(backEnd)} />
      )}
    </div>
  );
}

function SwapPreview({
  target,
}: {
  target: Extract<RollbackTarget, { kind: "swap" }>;
}) {
  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <Row label="Скутер" before="заменён" after="вернуть прежний" />
      {target.feeAmount > 0 && (
        <Row
          label="Доплата за модель"
          before={`${fmtRub(target.feeAmount)} ₽`}
          after="отменить"
          accent
        />
      )}
      {target.refundAmount > 0 && (
        <Row
          label="Возврат в депозит"
          before={`${fmtRub(target.refundAmount)} ₽`}
          after="снять обратно"
          accent
        />
      )}
    </div>
  );
}

function ParkingSetPreview({
  target,
}: {
  target: Extract<RollbackTarget, { kind: "parking_set" }>;
}) {
  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <Row label="Паркинг" before="поставлен" after="отменить" />
      {target.days > 0 && (
        <Row
          label="Сдвиг возврата"
          before={`+${target.days} дн`}
          after="вернуть"
          accent
        />
      )}
    </div>
  );
}

function ParkingEndPreview() {
  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <Row label="Паркинг" before="снят" after="снова идёт" accent />
    </div>
  );
}

function ParkingPaidPreview({
  target,
  scope,
  onScope,
}: {
  target: Extract<RollbackTarget, { kind: "parking_paid" }>;
  scope: "payment" | "both";
  onScope: (s: "payment" | "both") => void;
}) {
  // Оплата отдельно от постановки — простой превью, без выбора.
  if (!target.underlyingSet) {
    return (
      <div className="space-y-2 rounded-xl bg-surface-soft p-3">
        <Row
          label="Оплата паркинга"
          before={`${fmtRub(target.amount)} ₽`}
          after="отменить"
          accent
        />
      </div>
    );
  }
  // Паркинг поставлен и сразу оплачен — спрашиваем, что откатывать (иначе
  // оператор не догадается, что нужно два отката).
  const days = target.underlyingSet.days;
  return (
    <div className="space-y-2.5">
      <p className="text-[12.5px] leading-snug text-muted">
        Этот паркинг поставили и сразу оплатили. Что откатить?
      </p>
      <div className="space-y-2">
        <ScopeOption
          active={scope === "payment"}
          onClick={() => onScope("payment")}
          title="Только оплату"
          desc={`Снять ${fmtRub(target.amount)} ₽ — паркинг останется (в долг).`}
        />
        <ScopeOption
          active={scope === "both"}
          onClick={() => onScope("both")}
          title="Оплату и постановку"
          desc={`Снять ${fmtRub(target.amount)} ₽ и убрать паркинг${days > 0 ? ` (возврат −${days} дн)` : ""}.`}
        />
      </div>
    </div>
  );
}

function ScopeOption({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
        active
          ? "border-amber-300 bg-amber-50 ring-1 ring-inset ring-amber-200"
          : "border-border bg-surface hover:bg-surface-soft",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
          active ? "border-amber-500" : "border-border",
        )}
      >
        {active && <span className="h-2 w-2 rounded-full bg-amber-500" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-ink">{title}</span>
        <span className="block text-[11.5px] leading-snug text-muted-2">
          {desc}
        </span>
      </span>
    </button>
  );
}

function Row({
  label,
  before,
  after,
  accent,
}: {
  label: string;
  before: string;
  after: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12.5px]">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-muted-2 line-through">{before}</span>
        <span className="text-muted-2">→</span>
        <span className={cn("font-bold", accent ? "text-green-ink" : "text-ink")}>
          {after}
        </span>
      </span>
    </div>
  );
}
