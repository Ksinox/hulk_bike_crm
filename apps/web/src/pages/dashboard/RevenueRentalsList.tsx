import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useApiRentals, useApiRentalsArchived } from "@/lib/api/rentals";
import { useApiPayments, type ApiPayment } from "@/lib/api/payments";
import { useApiClients } from "@/lib/api/clients";
import { useApiScooters } from "@/lib/api/scooters";
import { useBillingPeriodAnchors } from "@/lib/api/billing-period";
import { currentBillingPeriod } from "@/lib/billingPeriod";
import { useDashboardDrawer } from "./DashboardDrawer";

export type RevenuePeriod = "day" | "week" | "month";

/** Фильтр по способу оплаты для сверки бухгалтерии. */
export type MethodFilter = "all" | "cash" | "cashless";

/**
 * Вычисляет окно [start; end] для выбранного периода.
 *  - day:   сегодня 00:00 — завтра 00:00
 *  - week:  ПОСЛЕДНИЕ 7 ДНЕЙ (включая сегодня), скользящее окно
 *  - month: РАСЧЁТНЫЙ ПЕРИОД БИЗНЕСА (15→14, или другой день из настроек).
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
    // «Неделя» = последние 7 дней (включая сегодня), а НЕ календарная
    // неделя с понедельника. Иначе в понедельник окно почти пустое: платежи
    // конца прошлой недели (или датированные «датой оплаты» на пару дней
    // назад — частый кейс при продлении) проваливались в «прошлую неделю»
    // и вкладка показывала нули.
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const start = new Date(end.getTime() - 7 * 86_400_000);
    return { start, end };
  }
  const bp = currentBillingPeriod(now);
  return { start: bp.start, end: bp.end };
}

/**
 * Единый резолвер окна выручки: произвольный диапазон → конкретный день
 * (клик по графику) → период (день/неделя/месяц). Используется и списком,
 * и аналитикой дашборда — чтобы цифры совпадали.
 */
export function resolveRevenueWindow(opts: {
  period: RevenuePeriod;
  range?: { from: string; to: string } | null;
  dayFilter?: string | null;
}): { start: Date; end: Date } {
  const { period, range, dayFilter } = opts;
  if (range) {
    const s = new Date(range.from + "T00:00:00");
    const e = new Date(new Date(range.to + "T00:00:00").getTime() + 86_400_000);
    return { start: s, end: e };
  }
  if (dayFilter) {
    const d = new Date(dayFilter + "T00:00:00");
    return { start: d, end: new Date(d.getTime() + 86_400_000) };
  }
  return periodWindow(period);
}

/** Лейбл расчётного периода для UI (используется в фильтре «Месяц»). */
export function billingPeriodLabel(): string {
  return currentBillingPeriod().label;
}

/** Область выручки: только аренды или все операции (на будущее — рассрочки/продажи). */
export type RevenueScope = "rentals" | "all";

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

/** true — платёж это «наличные»; false — безнал (перевод/карта). */
export function isCashPayment(p: { method: string }): boolean {
  return p.method === "cash";
}

/** Считать ли платёж выручкой нал/безнал (не залог/возврат, не из депозита). */
export function isRevenuePayment(p: ApiPayment): boolean {
  if (!p.paid || !p.paidAt) return false;
  if (p.type === "deposit" || p.type === "refund") return false;
  // method='deposit' — оплата из депозита клиента: не нал и не безнал
  // (реальные деньги уже были выручкой раньше). В сверку не идёт.
  if (p.method === "deposit") return false;
  return true;
}

// Человекочитаемый тип платежа.
const TYPE_LABEL: Record<string, string> = {
  rent: "Аренда",
  fine: "Штраф",
  damage: "Ущерб",
  swap_fee: "Замена скутера",
  equipment_fee: "Экипировка",
  parking: "Паркинг",
};

/**
 * v0.9: список ПЛАТЕЖЕЙ за период (раньше группировался по арендам). Каждый
 * платёж помечен нал/безнал — для сверки бухгалтерии. Клик по платежу
 * открывает карточку аренды (drawer). Понятие «смешанный» убрано: платёж
 * всегда либо наличный, либо безналичный.
 *
 * Окно: range (произвольный диапазон) → dayFilter (конкретный день из
 * графика) → periodWindow(period). methodFilter сужает до нал/безнал.
 */
export function RevenueRentalsList({
  period,
  onRowClick,
  compact = true,
  dayFilter,
  range,
  methodFilter = "all",
  scope = "all",
}: {
  period: RevenuePeriod;
  onRowClick?: (rentalId: number) => void;
  compact?: boolean;
  /** Конкретный день (YYYY-MM-DD) — фильтр по клику на столбик графика. */
  dayFilter?: string | null;
  /** Произвольный диапазон (YYYY-MM-DD) — приоритетнее period/dayFilter. */
  range?: { from: string; to: string } | null;
  /** Способ оплаты: всё / только наличные / только безнал. */
  methodFilter?: MethodFilter;
  /** Область: только аренды или все операции (на будущее). */
  scope?: RevenueScope;
}) {
  const { data: activeRentals = [] } = useApiRentals();
  const { data: archivedRentals = [] } = useApiRentalsArchived();
  const rentals = useMemo(
    () => [...activeRentals, ...archivedRentals],
    [activeRentals, archivedRentals],
  );
  const { data: payments = [] } = useApiPayments();
  const { data: clients = [] } = useApiClients();
  const drawer = useDashboardDrawer();
  const { data: scooters = [] } = useApiScooters();
  // Якоря расчётного периода грузятся с сервера асинхронно и пишутся в
  // глобал billingPeriod. Подписываемся, чтобы окно ниже пересчиталось,
  // когда они догрузятся (иначе список фильтровал бы по стале-периоду).
  const anchorsQ = useBillingPeriodAnchors();

  // Окно: произвольный диапазон → конкретный день → период (общий резолвер).
  const { start, end } = useMemo(
    () => resolveRevenueWindow({ period, range, dayFilter }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period, dayFilter, range, anchorsQ.data],
  );

  const rows = useMemo(() => {
    const rentalById = new Map(rentals.map((r) => [r.id, r]));
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const scooterById = new Map(scooters.map((s) => [s.id, s]));
    return payments
      .filter((p) => {
        if (!isRevenuePayment(p)) return false;
        if (scope === "rentals" && p.rentalId == null) return false;
        const t = new Date(p.paidAt!).getTime();
        if (t < start.getTime() || t >= end.getTime()) return false;
        if (methodFilter === "cash" && !isCashPayment(p)) return false;
        if (methodFilter === "cashless" && isCashPayment(p)) return false;
        return true;
      })
      .map((p) => {
        const r = rentalById.get(p.rentalId);
        const client = r ? clientById.get(r.clientId) : undefined;
        const scooter = r ? scooterById.get(r.scooterId ?? -1) : undefined;
        return {
          paymentId: p.id,
          rentalId: p.rentalId,
          paidAt: p.paidAt!,
          amount: p.amount,
          cash: isCashPayment(p),
          typeLabel: TYPE_LABEL[p.type] ?? p.type,
          clientName: client?.name ?? "—",
          scooterName: scooter?.name ?? "—",
        };
      })
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  }, [rentals, payments, clients, scooters, start, end, methodFilter, scope]);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const cashTotal = rows
    .filter((r) => r.cash)
    .reduce((s, r) => s + r.amount, 0);
  const cashlessTotal = total - cashTotal;

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-border bg-white py-8 text-center",
          compact && "py-6",
        )}
      >
        <div className="text-[13px] font-semibold text-ink">
          {methodFilter === "cash"
            ? "Наличных платежей нет"
            : methodFilter === "cashless"
              ? "Безналичных платежей нет"
              : "За период платежей не было"}
        </div>
        <div className="text-[11px] text-muted-2">
          Здесь появятся платежи за выбранный период.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-2">
        <span>
          {rows.length}{" "}
          {plural(rows.length, ["платёж", "платежа", "платежей"])}
        </span>
        <span>
          {methodFilter === "cash" ? (
            <>
              наличные:{" "}
              <b className="text-green-ink tabular-nums">{fmt(cashTotal)} ₽</b>
            </>
          ) : methodFilter === "cashless" ? (
            <>
              безнал:{" "}
              <b className="text-blue-700 tabular-nums">
                {fmt(cashlessTotal)} ₽
              </b>
            </>
          ) : (
            <>
              получено:{" "}
              <b className="text-ink tabular-nums">{fmt(total)} ₽</b>
            </>
          )}
        </span>
      </div>
      <div className="flex flex-col divide-y divide-border rounded-[10px] border border-border bg-white">
        {rows.map((r) => (
          <button
            key={r.paymentId}
            type="button"
            onClick={() => {
              if (onRowClick) onRowClick(r.rentalId);
              else drawer.openRental(r.rentalId);
            }}
            className="flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-soft"
          >
            <div className="w-[68px] shrink-0 text-[11px] font-medium tabular-nums leading-tight text-muted-2">
              {fmtDateTime(r.paidAt)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-ink">
                {r.scooterName} · {r.clientName}
              </div>
              <div className="text-[11px] text-muted-2">{r.typeLabel}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  r.cash
                    ? "bg-green-soft text-green-ink"
                    : "bg-blue-50 text-blue-700",
                )}
              >
                {r.cash ? "нал" : "безнал"}
              </span>
              <div className="w-[72px] text-right text-[13px] font-bold tabular-nums text-ink">
                {fmt(r.amount)} ₽
              </div>
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

/** «2026-06-06T14:30:00…» → «06.06 14:30». */
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm} ${hh}:${mi}`;
}
