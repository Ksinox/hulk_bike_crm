import { cn } from "@/lib/utils";
import type { ServiceOrder, ServiceOrderStatus } from "@/lib/api/service-orders";

/** Общие мелочи блока сторонних ремонтов: статусы, деньги, период. */

export const money = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

export const orderNo = (n: number) => `№${String(n).padStart(4, "0")}`;

export const fmtDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export const METHOD_LABEL: Record<string, string> = {
  cash: "наличные",
  transfer: "перевод",
  mixed: "смешанно",
};

export const STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  in_work: "В работе",
  done: "Готов к выдаче",
  paid: "Оплачен",
  cancelled: "Отменён",
};

const STATUS_CLASS: Record<ServiceOrderStatus, string> = {
  in_work: "bg-blue-50 text-blue-700",
  done: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-surface-soft text-muted-2",
};

export function StatusBadge({
  status,
  className,
}: {
  status: ServiceOrderStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold",
        STATUS_CLASS[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Денежное состояние наряда одной строкой — для списка и шапки карточки:
 * «аванс 2 000 ₽ · остаток 2 450 ₽», «оплачен», «к оплате 4 450 ₽».
 */
export function moneyState(o: ServiceOrder): {
  text: string;
  tone: "muted" | "warn" | "good" | "bad";
} {
  const t = o.totals;
  if (o.status === "cancelled")
    return { text: t.paid < 0 ? "возврат" : "отменён", tone: "muted" };
  if (o.status === "paid") return { text: "оплачен", tone: "good" };
  if (t.overpaid > 0) return { text: `переплата ${money(t.overpaid)}`, tone: "bad" };
  if (t.paid > 0) return { text: `аванс ${money(t.paid)} · остаток ${money(t.left)}`, tone: "warn" };
  if (t.due > 0) return { text: `к оплате ${money(t.due)}`, tone: "muted" };
  return { text: "без позиций", tone: "muted" };
}

export type ServicePeriod = "month" | "quarter" | "year" | "all";

export const PERIOD_LABEL: Record<ServicePeriod, string> = {
  month: "Месяц",
  quarter: "Квартал",
  year: "Год",
  all: "Всё время",
};

/** Календарный период — заказчик просил именно календарный, не «за 30 дней». */
export function periodBounds(
  p: ServicePeriod,
  now = new Date(),
): { from: Date | null; label: string } {
  if (p === "all") return { from: null, label: "за всё время" };
  if (p === "month")
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      label: now.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }),
    };
  if (p === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return {
      from: new Date(now.getFullYear(), q * 3, 1),
      label: `${q + 1}-й квартал ${now.getFullYear()}`,
    };
  }
  return {
    from: new Date(now.getFullYear(), 0, 1),
    label: `${now.getFullYear()} год`,
  };
}

/** Только цифры из ввода. */
export const digits = (v: string) => v.replace(/[^\d]/g, "");
