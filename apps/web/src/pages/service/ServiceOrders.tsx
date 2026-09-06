import { useMemo, useState } from "react";
import {
  Banknote,
  Bike,
  Plus,
  Search,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useIsMobile } from "@/lib/useIsMobile";
import {
  useCreateServiceOrder,
  useServiceOrders,
  type ServiceOrder,
  type ServiceOrderStatus,
} from "@/lib/api/service-orders";
import { ServiceOrderCard } from "./ServiceOrderCard";
import {
  money,
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
  const ordersQ = useServiceOrders();
  const orders = ordersQ.data ?? [];

  const [period, setPeriod] = useState<ServicePeriod>("month");
  const [filter, setFilter] = useState<ServiceOrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const bounds = periodBounds(period);

  /** Статистика за период — только по неотменённым. */
  const stats = useMemo(() => {
    const inPeriod = orders.filter((o) => {
      if (o.status === "cancelled") return false;
      if (!bounds.from) return true;
      return new Date(o.acceptedAt) >= bounds.from;
    });
    return {
      count: inPeriod.length,
      revenue: inPeriod.reduce((s, o) => s + o.totals.revenue, 0),
      profit: inPeriod.reduce((s, o) => s + o.totals.profit, 0),
      unpaid: inPeriod
        .filter((o) => o.status !== "paid")
        .reduce((s, o) => s + o.totals.revenue, 0),
    };
  }, [orders, bounds.from]);

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
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[12.5px] font-bold text-white hover:bg-ink-2"
          >
            <Plus size={15} /> Новый ремонт
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            icon={<Wrench size={14} />}
            label="Ремонтов"
            value={String(stats.count)}
            caption={bounds.label}
          />
          <Kpi
            icon={<Banknote size={14} />}
            label="Выручка"
            value={money(stats.revenue)}
            caption="работы и запчасти"
            tone="good"
          />
          <Kpi
            icon={<TrendingUp size={14} />}
            label="Прибыль"
            value={money(stats.profit)}
            caption="за вычетом закупа запчастей"
            tone={stats.profit >= 0 ? "good" : "bad"}
          />
          <Kpi
            icon={<Banknote size={14} />}
            label="Ждём оплату"
            value={money(stats.unpaid)}
            caption="ещё не подтверждена"
            tone={stats.unpaid > 0 ? "warn" : undefined}
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
        <div className="flex flex-col gap-2">
          {list.map((o) => (
            <OrderRow key={o.id} order={o} onOpen={() => setOpenId(o.id)} />
          ))}
        </div>
      )}

      {/* ---- Карточка ---- */}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex justify-end bg-ink/25"
          onClick={() => setOpenId(null)}
        >
          <div
            className={cn(
              "relative flex h-full flex-col overflow-hidden bg-surface shadow-card-lg",
              isMobile ? "w-full" : "w-full max-w-[720px]",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <ServiceOrderCard order={open} onClose={() => setOpenId(null)} />
          </div>
        </div>
      )}

      {creating && (
        <NewOrderDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setOpenId(id);
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  caption: string;
  tone?: "good" | "bad" | "warn";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl bg-surface p-4 shadow-card-sm">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
        {icon} {label}
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
      <div className="truncate text-[11.5px] text-muted-2">{caption}</div>
    </div>
  );
}

function OrderRow({
  order,
  onOpen,
}: {
  order: ServiceOrder;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-left shadow-card-sm transition-shadow hover:shadow-card"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-soft text-muted">
        <Bike size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[10.5px] font-bold tabular-nums text-muted-2">
            №{String(order.number).padStart(4, "0")}
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
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[15px] font-extrabold tabular-nums text-ink">
          {money(order.totals.revenue)}
        </span>
        <span className="block text-[11.5px] tabular-nums text-muted-2">
          прибыль {money(order.totals.profit)}
        </span>
      </span>
    </button>
  );
}

/** Приём техники: минимум полей, остальное дозаполняется в карточке. */
function NewOrderDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const create = useCreateServiceOrder();
  const [vehicle, setVehicle] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [complaint, setComplaint] = useState("");

  const canSave = vehicle.trim().length > 0 && name.trim().length > 0;

  const submit = async () => {
    if (!canSave) return;
    try {
      const r = await create.mutateAsync({
        vehicle: vehicle.trim(),
        vehicleNumber: vehicleNumber.trim() || null,
        customerName: name.trim(),
        customerPhone: phone.trim() || null,
        complaint: complaint.trim() || null,
      });
      toast.success(
        `Ремонт №${String(r.order.number).padStart(4, "0")} принят`,
        "Добавьте работы из прайса и запчасти",
      );
      onCreated(r.order.id);
    } catch {
      toast.error("Не удалось создать ремонт");
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/30 p-4 sm:items-center">
      <div className="w-full max-w-[460px] rounded-3xl bg-surface p-5 shadow-card-lg">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-display text-[19px] font-extrabold text-ink">
              Принять технику в ремонт
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted">
              Это чужой скутер — записываем словами, в парк он не заводится.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-2 hover:bg-surface-soft hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          <Field label="Техника" hint="марка и модель">
            <input
              autoFocus
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              placeholder="Honda Dio AF62"
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-[14px] outline-none focus:border-blue-600"
            />
          </Field>
          <Field label="Номер или VIN" hint="если есть">
            <input
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              placeholder="AF62-1234567"
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-[14px] outline-none focus:border-blue-600"
            />
          </Field>
          <Field label="Клиент">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя"
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-[14px] outline-none focus:border-blue-600"
            />
          </Field>
          <Field label="Телефон" hint="если есть">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 ..."
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-[14px] outline-none focus:border-blue-600"
            />
          </Field>
          <Field label="С чем приехали" hint="жалоба клиента">
            <textarea
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              rows={2}
              placeholder="Не заводится, стучит вариатор…"
              className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-blue-600"
            />
          </Field>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl bg-surface-soft text-[13px] font-bold text-muted hover:text-ink"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSave || create.isPending}
            className="h-11 flex-[1.6] rounded-xl bg-ink text-[13px] font-bold text-white disabled:opacity-40"
          >
            Принять в ремонт
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
        {label}
        {hint && <span className="ml-1.5 font-semibold normal-case text-muted-2/70">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export { STATUS_LABEL };
