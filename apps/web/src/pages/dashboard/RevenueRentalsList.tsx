import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { changePaymentMethod } from "@/pages/rentals/rentalsStore";
import { toast } from "@/lib/toast";
import { useApiRentals, useApiRentalsArchived } from "@/lib/api/rentals";
import { useApiPayments, type ApiPayment } from "@/lib/api/payments";
import { usePartnerInfo } from "@/lib/partner";
import { useApiClients } from "@/lib/api/clients";
import { useApiScooters } from "@/lib/api/scooters";
import { useBillingPeriodAnchors } from "@/lib/api/billing-period";
import { currentBillingPeriod } from "@/lib/billingPeriod";
import { useScooterNaming } from "@/lib/scooterNaming";
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
  // Пункт 2: оплаты удалённых аренд исключены из выручки (бэк ставит флаг
  // при ручном удалении и снимает при восстановлении из архива).
  if (p.excludedFromRevenue) return false;
  if (!p.paid || !p.paidAt) return false;
  if (p.type === "deposit" || p.type === "refund") return false;
  // method='deposit' — оплата из депозита клиента: не нал и не безнал
  // (реальные деньги уже были выручкой раньше). В сверку не идёт.
  // ИСКЛЮЧЕНИЕ: deposit_forfeit — удержанный в счёт ущерба залог = доход,
  // учитываем в выручке (в нал/безнал-разбивке попадёт в «безнал»).
  if (p.method === "deposit" && p.type !== "deposit_forfeit") return false;
  return true;
}

/** Тип-фильтр списка платежей (сверка по видам операций). */
export type RevenueTypeFilter =
  | "all"
  | "rent"
  | "extend"
  | "fine"
  | "damage"
  | "equipment_fee"
  | "swap_fee"
  | "parking";

/** Конкретный вид операции (без «all») — для мультифильтра выручки. */
export type RevenueTypeKey = Exclude<RevenueTypeFilter, "all">;

/** Метка вида операции (без «all»). Продление выделено из аренды. */
export const REVENUE_TYPE_LABEL: Record<RevenueTypeKey, string> = {
  rent: "Новые аренды",
  extend: "Продление",
  fine: "Штраф",
  damage: "Ущерб",
  equipment_fee: "Экипировка",
  swap_fee: "Замена скутера",
  parking: "Паркинг",
};

/** Классифицирует платёж по виду; продление = rent с пометкой в note. */
function paymentTypeKey(p: ApiPayment): Exclude<RevenueTypeFilter, "all"> {
  if (p.type === "rent")
    return p.note && /продлен/i.test(p.note) ? "extend" : "rent";
  if (p.type === "fine") return "fine";
  if (p.type === "damage") return "damage";
  if (p.type === "equipment_fee") return "equipment_fee";
  if (p.type === "swap_fee") return "swap_fee";
  if (p.type === "parking") return "parking";
  return "rent";
}

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
  types,
  scope = "all",
  hideSummary,
}: {
  period: RevenuePeriod;
  onRowClick?: (rentalId: number) => void;
  compact?: boolean;
  /** Итоговая строка не нужна: те же числа уже стоят в шапке блока (01.09). */
  hideSummary?: boolean;
  /** Конкретный день (YYYY-MM-DD) — фильтр по клику на столбик графика. */
  dayFilter?: string | null;
  /** Произвольный диапазон (YYYY-MM-DD) — приоритетнее period/dayFilter. */
  range?: { from: string; to: string } | null;
  /** Способ оплаты: всё / только наличные / только безнал. */
  methodFilter?: MethodFilter;
  /** Мультифильтр по видам операций (пусто/undefined = все виды). */
  types?: Set<RevenueTypeKey>;
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
  const { shareByRental } = usePartnerInfo();
  const { data: clients = [] } = useApiClients();
  const drawer = useDashboardDrawer();
  // v0.9.7: раскрытие состава аренды (тело) у платежа по клику на шеврон.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data: scooters = [] } = useApiScooters();
  const naming = useScooterNaming();
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
        // Правка 31.08: в списке выручки не должно быть НИ ОДНОЙ операции
        // по партнёрскому электротранспорту — ни аренды, ни просрочки, ни
        // штрафов. Эти деньги живут в разделе «Партнёрка».
        if (p.rentalId != null && shareByRental.has(p.rentalId)) return false;
        if (scope === "rentals" && p.rentalId == null) return false;
        const t = new Date(p.paidAt!).getTime();
        if (t < start.getTime() || t >= end.getTime()) return false;
        if (methodFilter === "cash" && !isCashPayment(p)) return false;
        if (methodFilter === "cashless" && isCashPayment(p)) return false;
        if (types && types.size > 0 && !types.has(paymentTypeKey(p)))
          return false;
        return true;
      })
      .map((p) => {
        const r = rentalById.get(p.rentalId);
        const client = r ? clientById.get(r.clientId) : undefined;
        const scooter = r ? scooterById.get(r.scooterId ?? -1) : undefined;
        const tk = paymentTypeKey(p);
        // v0.9.7: «тело» аренды для раскрытия — только у платежей аренды/
        // продления (где состав имеет смысл). Берём из самой аренды.
        const comp =
          (tk === "rent" || tk === "extend") && r
            ? {
                sum: r.sum,
                deposit: r.deposit,
                days: r.days,
                rate: r.rate,
                rateUnit: r.rateUnit ?? ("day" as const),
                customTariff: r.customTariff ?? false,
                equipment: r.equipmentJson ?? [],
              }
            : null;
        return {
          paymentId: p.id,
          rentalId: p.rentalId,
          paidAt: p.paidAt!,
          amount: p.amount,
          cash: isCashPayment(p),
          // Пункт 8: исходный способ — оплаты из залога/депозита формат
          // не меняют (это не деньги клиента).
          method: p.method,
          typeLabel: REVENUE_TYPE_LABEL[tk],
          clientName: client?.name ?? "—",
          scooterName: scooter?.name ?? "—",
          comp,
        };
      })
      // v0.9.7: свежие сверху — по id платежа (= порядку фиксации), а НЕ по
      // «дате оплаты». Иначе платёж, датированный задним числом (частый кейс
      // при продлении), тонул вниз, хотя приняли его только что.
      .sort((a, b) => b.paymentId - a.paymentId);
  }, [
    shareByRental,
    rentals,
    payments,
    clients,
    scooters,
    start,
    end,
    methodFilter,
    types,
    scope,
  ]);

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
      <div
        className={cn(
          "items-center justify-between text-[11px] text-muted-2",
          hideSummary ? "hidden" : "flex",
        )}
      >
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
      <div className="@container flex flex-col divide-y divide-border rounded-[10px] border border-border bg-white">
        {rows.map((r) => {
          const expanded = expandedId === r.paymentId;
          return (
            <div key={r.paymentId} className="flex flex-col">
              <div className="flex items-center transition-colors hover:bg-surface-soft">
                <button
                  type="button"
                  onClick={() => {
                    if (onRowClick) onRowClick(r.rentalId);
                    else drawer.openRental(r.rentalId);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left @[380px]:gap-3"
                >
                  {/* Узкая колонка (01.09): дата уезжает во вторую строку,
                      иначе на имя клиента остаётся два символа. */}
                  <div className="hidden w-[68px] shrink-0 text-[11px] font-medium tabular-nums leading-tight text-muted-2 @[380px]:block">
                    {fmtDateTime(r.paidAt)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-ink">
                      {naming.render(r.scooterName, { size: "sm" })} ·{" "}
                      {r.clientName}
                    </div>
                    <div className="truncate text-[11px] text-muted-2">
                      <span className="tabular-nums @[380px]:hidden">
                        {fmtDateTime(r.paidAt)} ·{" "}
                      </span>
                      {r.typeLabel}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[13px] font-bold tabular-nums text-ink @[380px]:w-[72px]">
                    {fmt(r.amount)} ₽
                  </div>
                </button>
                {/* Пункт 8: бейдж способа — кликабельный (нал ↔ безнал).
                    Вынесен из кнопки-строки: кнопка в кнопке невалидна. */}
                <MethodBadge
                  paymentId={r.paymentId}
                  method={r.method}
                  cash={r.cash}
                  amount={r.amount}
                />
                {/* Шеврон «состав аренды» — только у платежей аренды/продления. */}
                {r.comp ? (
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : r.paymentId)}
                    title="Состав аренды"
                    className="mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-2 transition-colors hover:bg-border hover:text-ink"
                  >
                    <ChevronDown
                      size={15}
                      className={cn(
                        "transition-transform",
                        expanded && "rotate-180",
                      )}
                    />
                  </button>
                ) : (
                  <span className="mr-1.5 w-7 shrink-0" />
                )}
              </div>
              {expanded &&
                r.comp &&
                (() => {
                  const days = r.comp!.days || 0;
                  // Сумма платной экипировки за весь срок (цена/сут × дни).
                  const paidEquipTotal = r.comp!.equipment.reduce(
                    (s, e) => s + (e.free || !e.price ? 0 : e.price * days),
                    0,
                  );
                  // Аренда (база) = сумма аренды − платная экипировка, чтобы не
                  // задвоить (sum уже включает экипировку).
                  const base = r.comp!.sum - paidEquipTotal;
                  return (
                    <div className="mx-3 mb-2 rounded-[10px] bg-surface-soft px-3 py-2 text-[12px]">
                      {r.comp!.customTariff && (
                        <span className="mb-1.5 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                          Свой тариф · не по стандартным ценам
                        </span>
                      )}
                      <CompositionRow
                        label={`Аренда${days ? ` · ${days} ${plural(days, ["день", "дня", "дней"])} · ${fmt(r.comp!.rate)} ₽/${r.comp!.rateUnit === "week" ? "нед" : "сут"}` : ""}`}
                        value={`${fmt(base)} ₽`}
                        strong
                      />
                      {r.comp!.equipment.map((e, i) => (
                        <CompositionRow
                          key={i}
                          label={`Экипировка · ${e.name}${e.free || !e.price ? "" : ` · ${fmt(e.price)} ₽/сут × ${days}`}`}
                          value={
                            e.free || !e.price
                              ? "бесплатно"
                              : `${fmt(e.price * days)} ₽`
                          }
                        />
                      ))}
                      {r.comp!.deposit > 0 && (
                        <CompositionRow
                          label="Залог (возвратный)"
                          value={`${fmt(r.comp!.deposit)} ₽`}
                          muted
                        />
                      )}
                      <CompositionRow
                        label="Итого аренды"
                        value={`${fmt(r.comp!.sum)} ₽`}
                        strong
                      />
                    </div>
                  );
                })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Строка состава аренды в раскрытии платежа: «лейбл … значение». */
function CompositionRow({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className={muted ? "text-muted-2" : "text-muted"}>{label}</span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          strong
            ? "font-bold text-ink"
            : muted
              ? "font-medium text-muted-2"
              : "font-semibold text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Пункт 8: кликабельный бейдж способа оплаты в строке платежа.
 * Клик открывает мини-меню «Наличные / Безнал»; выбор — PATCH платежа,
 * бэк пишет запись в журнал с diff «было → стало». Оплаты из
 * залога/депозита (method='deposit') формат не меняют — бейдж статичен.
 */
function MethodBadge({
  paymentId,
  method,
  cash,
  amount,
}: {
  paymentId: number;
  method: ApiPayment["method"];
  cash: boolean;
  amount: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const badge = (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        cash ? "bg-green-soft text-green-ink" : "bg-blue-50 text-blue-700",
      )}
    >
      {cash ? "нал" : "безнал"}
    </span>
  );
  if (method === "deposit") return <span className="shrink-0">{badge}</span>;

  const pick = async (m: "cash" | "transfer") => {
    setOpen(false);
    if ((m === "cash") === cash) return;
    setBusy(true);
    await changePaymentMethod(paymentId, m);
    setBusy(false);
    toast.success(
      "Способ оплаты изменён",
      `${amount.toLocaleString("ru-RU")} ₽ — теперь ${m === "cash" ? "наличные" : "безнал"}. Запись в журнале.`,
    );
  };

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        title="Сменить способ оплаты (нал ↔ безнал)"
        className="rounded-full transition-transform hover:scale-105 disabled:opacity-50"
      >
        {badge}
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <span className="absolute right-0 top-full z-50 mt-1 flex w-[140px] flex-col overflow-hidden rounded-xl border border-border bg-white py-1 shadow-card-lg">
            {(
              [
                ["cash", "Наличные"],
                ["transfer", "Безнал"],
              ] as const
            ).map(([m, lbl]) => {
              const active = (m === "cash") === cash;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pick(m)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold transition-colors",
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-ink-2 hover:bg-surface-soft",
                  )}
                >
                  {active && <Check size={12} />}
                  {lbl}
                </button>
              );
            })}
          </span>
        </>
      )}
    </span>
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
