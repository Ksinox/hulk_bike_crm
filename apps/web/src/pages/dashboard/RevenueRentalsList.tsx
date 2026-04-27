import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useApiRentals } from "@/lib/api/rentals";
import { useApiPayments } from "@/lib/api/payments";
import { useApiClients } from "@/lib/api/clients";
import { useApiScooters } from "@/lib/api/scooters";
import { navigate } from "@/app/navigationStore";
import { revenueFromPayments } from "@/lib/revenue";

export type RevenuePeriod = "day" | "week" | "month";

/**
 * Вычисляет окно [start; end] для выбранного периода.
 *  - day:   сегодня 00:00 — завтра 00:00
 *  - week:  понедельник этой недели — следующий понедельник
 *  - month: 1-е число этого месяца — 1-е следующего
 */
export function periodWindow(period: RevenuePeriod): {
  start: Date;
  end: Date;
} {
  const now = new Date();
  if (period === "day") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 86_400_000);
    return { start, end };
  }
  if (period === "week") {
    // Понедельник этой недели (ISO: понедельник = 1, воскресенье = 0/7)
    const dow = now.getDay() === 0 ? 7 : now.getDay();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - (dow - 1));
    const end = new Date(start.getTime() + 7 * 86_400_000);
    return { start, end };
  }
  // month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

const STATUS_LABEL: Record<string, string> = {
  active: "активна",
  overdue: "просрочка",
  returning: "возврат",
  completed: "завершена",
  completed_damage: "с ущербом",
  cancelled: "отменена",
  meeting: "встреча",
  new_request: "заявка",
  police: "в полиции",
  court: "суд",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-green-soft text-green-ink",
  overdue: "bg-red-soft text-red-ink",
  returning: "bg-orange-soft text-orange-ink",
  completed: "bg-surface-soft text-muted",
  completed_damage: "bg-red-soft text-red-ink",
  cancelled: "bg-surface-soft text-muted",
  meeting: "bg-blue-50 text-blue-700",
  new_request: "bg-blue-50 text-blue-700",
};

/**
 * Список аренд за выбранный период.
 *  - В период попадают аренды, у которых startAt в окне периода.
 *  - В колонке «Сумма» показываем фактически полученные платежи по этой
 *    аренде (revenueFromPayments). Если ничего не оплачено — показываем
 *    плановую rental.sum светлым.
 *  - Клик по строке — переход в карточку аренды.
 */
export function RevenueRentalsList({
  period,
  onRowClick,
  compact = true,
}: {
  period: RevenuePeriod;
  onRowClick?: (rentalId: number) => void;
  compact?: boolean;
}) {
  const { data: rentals = [] } = useApiRentals();
  const { data: payments = [] } = useApiPayments();
  const { data: clients = [] } = useApiClients();
  const { data: scooters = [] } = useApiScooters();

  const { start, end } = periodWindow(period);

  const rows = useMemo(() => {
    const inWindow = rentals.filter((r) => {
      if (!r.startAt) return false;
      const t = new Date(r.startAt).getTime();
      return t >= start.getTime() && t < end.getTime();
    });
    return inWindow
      .map((r) => {
        const client = clients.find((c) => c.id === r.clientId);
        const scooter = scooters.find((s) => s.id === r.scooterId);
        const paidForRental = revenueFromPayments(
          payments.filter((p) => p.rentalId === r.id),
        );
        return {
          id: r.id,
          startAt: r.startAt,
          clientName: client?.name ?? "—",
          scooterName: scooter?.name ?? "—",
          plannedSum: r.sum ?? 0,
          paidSum: paidForRental,
          status: r.status,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
      );
  }, [rentals, payments, clients, scooters, start, end]);

  const totalPaid = rows.reduce((s, r) => s + r.paidSum, 0);

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-border bg-white py-8 text-center",
          compact && "py-6",
        )}
      >
        <div className="text-[13px] font-semibold text-ink">
          За{" "}
          {period === "day"
            ? "сегодня"
            : period === "week"
              ? "неделю"
              : "месяц"}{" "}
          аренд не было
        </div>
        <div className="text-[11px] text-muted-2">
          Здесь появятся сделки за выбранный период.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-2">
        <span>
          {rows.length} {plural(rows.length, ["аренда", "аренды", "аренд"])}
        </span>
        <span>
          получено: <b className="text-ink tabular-nums">{fmt(totalPaid)} ₽</b>
        </span>
      </div>
      <div className="flex flex-col divide-y divide-border rounded-[10px] border border-border bg-white">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => {
              if (onRowClick) onRowClick(r.id);
              navigate({ route: "rentals", rentalId: r.id });
            }}
            className="flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-soft"
          >
            <div className="text-[11px] font-semibold tabular-nums text-muted-2">
              #{String(r.id).padStart(4, "0")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-ink">
                {r.scooterName} · {r.clientName}
              </div>
              <div className="text-[11px] text-muted-2">
                {new Date(r.startAt).toLocaleDateString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </div>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                STATUS_TONE[r.status] ?? "bg-surface-soft text-muted",
              )}
            >
              {STATUS_LABEL[r.status] ?? r.status}
            </span>
            <div className="text-right">
              <div className="text-[13px] font-bold tabular-nums text-ink">
                {fmt(r.paidSum)} ₽
              </div>
              {r.paidSum < r.plannedSum && (
                <div className="text-[10px] text-muted-2 tabular-nums">
                  план {fmt(r.plannedSum)} ₽
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}
