import { useEffect, useMemo, useState } from "react";
import { useCan } from "@/lib/permissions";
import {
  Banknote,
  Bike,
  ChevronRight,
  HardHat,
  Hourglass,
  Plus,
  Search,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { useMe } from "@/lib/api/auth";
import { isFullAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useIsMobile } from "@/lib/useIsMobile";
import { consumePending, onNavigate } from "@/app/navigationStore";
import {
  useServiceOrders,
  type ServiceOrder,
  type ServiceOrderStatus,
} from "@/lib/api/service-orders";
import { serviceMoney, serviceMoneyRows } from "@/lib/serviceMoney";
import { TABLET_WIZARD_PANEL } from "@/mobile/tablet";
import { ServiceOrderCard } from "./ServiceOrderCard";
import { ServiceOrderForm } from "./ServiceOrderForm";
import { MechanicsSheet } from "./ServiceMechanics";
import { ServiceMoneySheet } from "./ServiceMoneySheet";
import {
  money,
  moneyState,
  orderNo,
  periodBounds,
  PERIOD_LABEL,
  StatusBadge,
  STATUS_LABEL,
  type ServicePeriod,
} from "./serviceOrderUi";

/**
 * Сторонние ремонты (задание 06.09) — главная вкладка раздела «Ремонты».
 *
 * Экран отвечает на два вопроса сразу: что сейчас в работе и сколько блок
 * заработал за календарный период. Поэтому сверху — три цифры за период
 * (сколько ремонтов, выручка, прибыль), ниже — очередь заказ-нарядов.
 * Выручка отсюда намеренно не подмешивается в дашборд: заказчик просил
 * держать её внутри блока, как у партнёрки.
 *
 * 2.0.2: выручка — это принятые деньги по дате оплаты (аванс — в день
 * аванса), а не цена ремонтов «в работе». Формула — lib/serviceMoney.
 */

const PERIODS: ServicePeriod[] = ["month", "quarter", "year", "all"];
const FILTERS: { id: ServiceOrderStatus | "all"; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "in_work", label: "В работе" },
  { id: "done", label: "Готовы" },
  { id: "paid", label: "Оплачены" },
  { id: "cancelled", label: "Отменённые" },
];

export function ServiceOrders() {
  const isMobile = useIsMobile();
  // 14.09: прибыль ремонтов — отдельное право. Без него плашки нет, а три
  // оставшиеся делят ряд (на телефоне последняя растягивается на две колонки).
  const canRepairProfit = useCan("data.repairProfit");
  const ordersQ = useServiceOrders();
  const orders = ordersQ.data ?? [];

  const [period, setPeriod] = useState<ServicePeriod>("month");
  const [filter, setFilter] = useState<ServiceOrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  /** Правки 7.0: справочник механиков (директор) и разбивка денег. */
  const [mechanicsOpen, setMechanicsOpen] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const { data: me } = useMe();
  const canManageMechanics = isFullAccess(me?.role);

  // «Новая сделка» → «Ремонт» (и на компьютере, и на телефоне) ведёт сюда
  // и сразу открывает приём чужой техники.
  useEffect(() => {
    if (consumePending("service")?.newSale) setCreating(true);
    return onNavigate((req) => {
      if (req.route === "service" && req.newSale) {
        consumePending("service");
        setCreating(true);
      }
    });
  }, []);

  const bounds = periodBounds(period);

  /** Деньги за период — по дате оплаты (2.0.2). */
  const stats = useMemo(() => serviceMoney(orders, bounds.from), [orders, bounds.from]);
  const moneyRows = useMemo(() => serviceMoneyRows(orders, bounds.from), [orders, bounds.from]);

  const list = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter !== "all" && o.status !== filter) return false;
      if (bounds.from && new Date(o.acceptedAt) < bounds.from) return false;
      if (!needle) return true;
      return [
        String(o.number),
        o.customerName,
        o.customerPhone ?? "",
        o.vehicle,
        o.vehicleNumber ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [orders, filter, search, bounds.from]);

  const open = orders.find((o) => o.id === openId) ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* ---- Цифры за период ---- */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full bg-surface p-1 shadow-card-sm">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                  period === p ? "bg-ink text-white" : "text-muted hover:text-ink",
                )}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
          <span className="text-[12.5px] text-muted">{bounds.label}</span>
          <div className="ml-auto flex gap-2">
            {canManageMechanics && (
              <button
                type="button"
                onClick={() => setMechanicsOpen(true)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full bg-surface px-4 font-bold text-ink shadow-card-sm hover:bg-surface-soft",
                  isMobile ? "h-11 text-[13.5px]" : "h-9 text-[12.5px]",
                )}
              >
                <HardHat size={15} /> Механики
              </button>
            )}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full bg-ink px-4 font-bold text-white hover:bg-ink-2",
                isMobile ? "h-11 text-[13.5px]" : "h-9 text-[12.5px]",
              )}
            >
              <Plus size={15} /> Новый ремонт
            </button>
          </div>
        </div>

        <div
          className={cn(
            "grid grid-cols-2 gap-3 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2",
            canRepairProfit ? "lg:grid-cols-4" : "lg:grid-cols-3",
          )}
        >
          <Kpi
            icon={<Wrench size={14} />}
            label="Ремонтов"
            value={String(stats.accepted)}
            caption={`принято · ${bounds.label}`}
          />
          <Kpi
            icon={<Banknote size={14} />}
            label="Выручка"
            onClick={() => setMoneyOpen(true)}
            value={money(stats.revenue)}
            caption={
              stats.payments > 0
                ? `нал ${money(stats.cash)} · перевод ${money(stats.transfer)}`
                : "денег за период не принимали"
            }
            tone="good"
          />
          {canRepairProfit && (
            <Kpi
              icon={<TrendingUp size={14} />}
              label="Прибыль"
              onClick={() => setMoneyOpen(true)}
              value={money(stats.profit)}
              caption={
                stats.mechanicShare > 0
                  ? `наша · механикам ${money(stats.mechanicShare)}`
                  : `по оплаченным: ${stats.paidOrders}`
              }
              tone={stats.profit >= 0 ? "good" : "bad"}
            />
          )}
          <Kpi
            icon={<Hourglass size={14} />}
            label="Ждём оплату"
            value={money(stats.waiting)}
            caption={
              stats.waitingOrders > 0
                ? `${stats.waitingOrders} в работе${stats.advances > 0 ? ` · аванс ${money(stats.advances)}` : ""}`
                : "все ремонты оплачены"
            }
            tone={stats.waiting > 0 ? "warn" : undefined}
          />
        </div>
      </section>

      {/* ---- Фильтры + поиск ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const n =
              f.id === "all"
                ? orders.length
                : orders.filter((o) => o.status === f.id).length;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                  filter === f.id
                    ? "bg-ink text-white"
                    : "bg-surface text-muted shadow-card-sm hover:text-ink",
                )}
              >
                {f.label}
                <span className={cn("tabular-nums", filter === f.id ? "text-white/60" : "text-muted-2")}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-[280px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Номер, клиент, техника"
            className="h-9 w-full rounded-full bg-surface pl-8 pr-3 text-[12.5px] shadow-card-sm outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
      </div>

      {/* ---- Список ---- */}
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
          <div className="text-[14px] font-bold text-ink">
            {orders.length === 0 ? "Сторонних ремонтов ещё не было" : "Ничего не нашлось"}
          </div>
          <div className="mx-auto mt-1 max-w-[420px] text-[12.5px] leading-relaxed text-muted">
            {orders.length === 0
              ? "Нажмите «Новый ремонт»: запишите чью технику приняли и с чем, потом добавьте работы из прайса и запчасти — CRM посчитает выручку и прибыль."
              : "Попробуйте другой период или снимите фильтр."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 tab:grid-cols-2 tab:gap-3">
          {list.map((o) => (
            <OrderRow key={o.id} order={o} onOpen={() => setOpenId(o.id)} />
          ))}
        </div>
      )}

      {/* ---- Карточка ---- */}
      {open &&
        (isMobile ? (
          <div
            className="fixed inset-0 z-[60] flex flex-col bg-surface lg:items-center lg:bg-ink/45 lg:backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <div className={cn(TABLET_WIZARD_PANEL, "relative")}>
              <ServiceOrderCard order={open} touch onClose={() => setOpenId(null)} />
            </div>
          </div>
        ) : (
          <div
            className="fixed inset-0 z-[60] flex justify-end bg-ink/25"
            onClick={() => setOpenId(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="relative flex h-full w-full max-w-[760px] flex-col overflow-hidden bg-surface shadow-card-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <ServiceOrderCard order={open} touch={false} onClose={() => setOpenId(null)} />
            </div>
          </div>
        ))}

      {mechanicsOpen && <MechanicsSheet touch={isMobile} onClose={() => setMechanicsOpen(false)} />}

      {moneyOpen && (
        <ServiceMoneySheet
          rows={moneyRows}
          stats={stats}
          periodLabel={bounds.label}
          showProfit={canRepairProfit}
          touch={isMobile}
          onOpen={(id) => {
            setMoneyOpen(false);
            setOpenId(id);
          }}
          onClose={() => setMoneyOpen(false)}
        />
      )}

      {creating && (
        <ServiceOrderForm
          touch={isMobile}
          onClose={() => setCreating(false)}
          onCreated={(o, saved) => {
            setCreating(false);
            if (saved.length)
              toast.success(
                "Сохранено в прайс",
                saved.map((x) => `«${x.name}»`).join(", ") + " — в следующий раз выберите из списка",
              );
            setFilter("all");
            const t = o.totals;
            toast.action({
              title: `Ремонт ${orderNo(o.number)} сохранён — в работе`,
              message: [
                `${o.vehicle} · ${o.customerName}`,
                t.due > 0 ? `к оплате ${money(t.due)}` : "позиции добавите в карточке",
                t.paid > 0 ? `аванс ${money(t.paid)} · остаток ${money(t.left)}` : null,
              ]
                .filter(Boolean)
                .join(" · "),
              actionLabel: "Открыть",
              actionKind: "open",
              onAction: () => setOpenId(o.id),
            });
          }}
        />
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  caption,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  caption: string;
  tone?: "good" | "bad" | "warn";
  /** Правки 7.0: плашка открывает разбивку по ремонтам. */
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-2xl bg-surface p-4 text-left shadow-card-sm",
        onClick && "transition-shadow hover:shadow-card active:scale-[0.99]",
      )}
      data-kpi={label}
    >
      <div className="flex w-full items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
        {icon} {label}
        {onClick && <ChevronRight size={14} className="ml-auto text-muted-2" aria-hidden />}
      </div>
      <div
        className={cn(
          "font-display text-[27px] font-extrabold leading-none tabular-nums",
          tone === "good" && "text-green-ink",
          tone === "bad" && "text-red-ink",
          tone === "warn" && "text-orange-ink",
          !tone && "text-ink",
        )}
      >
        {value}
      </div>
      <div className="w-full truncate text-[11.5px] text-muted-2">{caption}</div>
    </Tag>
  );
}

function OrderRow({
  order,
  onOpen,
}: {
  order: ServiceOrder;
  onOpen: () => void;
}) {
  const canRepairProfit = useCan("data.repairProfit");
  const ms = moneyState(order);
  const msTone =
    ms.tone === "warn"
      ? "text-orange-ink"
      : ms.tone === "good"
        ? "text-green-ink"
        : ms.tone === "bad"
          ? "text-red-ink"
          : "text-muted-2";
  return (
    <button
      type="button"
      onClick={onOpen}
      data-order-row={order.number}
      className="flex w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-left shadow-card-sm transition-shadow hover:shadow-card"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-soft text-muted">
        <Bike size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[10.5px] font-bold tabular-nums text-muted-2">
            {orderNo(order.number)}
          </span>
          <span className="truncate text-[14px] font-bold text-ink">
            {order.vehicle}
          </span>
          <StatusBadge status={order.status} />
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-muted">
          {order.customerName}
          {order.customerPhone ? ` · ${order.customerPhone}` : ""} ·{" "}
          {new Date(order.acceptedAt).toLocaleDateString("ru-RU")}
        </span>
        {/* Телефон: аванс и остаток — своей строкой, иначе имя и техника
            сжимались до «Honda Di…». */}
        <span className={cn("mt-0.5 block truncate text-[12px] font-semibold tabular-nums sm:hidden", msTone)}>
          {ms.text}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[15px] font-extrabold tabular-nums text-ink">
          {money(order.totals.due)}
        </span>
        <span className={cn("hidden text-[11.5px] font-semibold tabular-nums sm:block", msTone)}>
          {ms.text}
        </span>
        {canRepairProfit && order.totals.profit !== undefined && order.status !== "cancelled" && (
          <span className="hidden text-[11px] tabular-nums text-muted-2 sm:block">
            {/* Правки 7.0: с механиком — наша прибыль, за вычетом его доли. */}
            {order.mechanicId != null && order.totals.ourProfit !== undefined
              ? `наша прибыль ${money(order.totals.ourProfit)}`
              : `прибыль ${money(order.totals.profit)}`}
          </span>
        )}
      </span>
    </button>
  );
}

export { STATUS_LABEL };
