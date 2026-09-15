import { cn } from "@/lib/utils";
import type { ServiceOrderStatus } from "@/lib/api/service-orders";

/** Общие мелочи блока сторонних ремонтов: статусы, деньги, период. */

export const money = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

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
