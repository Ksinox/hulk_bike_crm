import { useState } from "react";
import {
  Banknote,
  Check,
  CreditCard,
  Package,
  Plus,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { confirmDialog, toast } from "@/lib/toast";
import {
  useAddServiceOrderItem,
  useCancelServiceOrder,
  useCompleteServiceOrder,
  useDeleteServiceOrderItem,
  usePatchServiceOrderItem,
  usePayServiceOrder,
  type ServiceOrder,
  type ServiceOrderItem,
} from "@/lib/api/service-orders";
import { usePriceList } from "@/lib/api/price-list";
import { money, StatusBadge } from "./serviceOrderUi";

/**
 * Заказ-наряд стороннего ремонта (06.09).
 *
 * Экран сделан как счёт, который заполняют сверху вниз: сначала работы —
 * их берут из прайса одним кликом, цену можно поправить прямо в строке;
 * потом запчасти — там кроме цены клиенту есть закуп, из него и считается
 * прибыль. Внизу итог и две кнопки: «Готов к выдаче» и «Принять оплату».
 */
export function ServiceOrderCard({
  order,
  onClose,
}: {
  order: ServiceOrder;
  onClose: () => void;
}) {
  const addItem = useAddServiceOrderItem();
  const patchItem = usePatchServiceOrderItem();
  const delItem = useDeleteServiceOrderItem();
  const complete = useCompleteServiceOrder();
  const pay = usePayServiceOrder();
  const cancel = useCancelServiceOrder();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const locked = order.status === "paid" || order.status === "cancelled";
  const works = order.items.filter((i) => i.kind === "work");
  const parts = order.items.filter((i) => i.kind === "part");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[19px] font-extrabold text-ink">
              Ремонт №{String(order.number).padStart(4, "0")}
            </h2>
            <StatusBadge status={order.status} />
          </div>
          <div className="mt-0.5 truncate text-[13px] text-muted">
            {order.vehicle}
            {order.vehicleNumber ? ` · ${order.vehicleNumber}` : ""} ·{" "}
            {order.customerName}
            {order.customerPhone ? ` · ${order.customerPhone}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-2 hover:bg-surface-soft hover:text-ink"
        >
          <X size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {order.complaint && (
          <div className="mb-4 rounded-2xl bg-surface-soft px-3.5 py-3">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
              С чем приехали
            </div>
            <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
              {order.complaint}
            </div>
          </div>
        )}

        {/* ---- Работы ---- */}
        <Section
          icon={<Wrench size={13} />}
          title="Работы"
          sum={order.totals.works}
          action={
            !locked && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-[12px] font-bold text-white hover:bg-ink-2"
              >
                <Plus size={13} /> Из прайса
              </button>
            )
          }
        >
          {works.length === 0 ? (
            <Empty text="Работ пока нет. Возьмите их из прайса — цена подставится сама." />
          ) : (
            works.map((it) => (
              <ItemRow
                key={it.id}
                item={it}
                locked={locked}
                onPatch={(b) => patchItem.mutate({ itemId: it.id, ...b })}
                onDelete={() => delItem.mutate(it.id)}
              />
            ))
          )}
          {!locked && (
            <FreeRow
              placeholder="Своя работа — название"
              withCost={false}
              onAdd={(v) =>
                addItem.mutate({
                  orderId: order.id,
                  kind: "work",
                  name: v.name,
                  qty: v.qty,
                  price: v.price,
                })
              }
            />
          )}
        </Section>

        {/* ---- Запчасти ---- */}
        <Section
          icon={<Package size={13} />}
          title="Запчасти"
          sum={order.totals.parts}
          hint="Закуп нужен, чтобы посчитать прибыль. Цена клиенту по умолчанию равна закупу."
        >
          {parts.length === 0 ? (
            <Empty text="Запчастей нет — значит, ремонт только из работы." />
          ) : (
            parts.map((it) => (
              <ItemRow
                key={it.id}
                item={it}
                locked={locked}
                withCost
                onPatch={(b) => patchItem.mutate({ itemId: it.id, ...b })}
                onDelete={() => delItem.mutate(it.id)}
              />
            ))
          )}
          {!locked && (
            <FreeRow
              placeholder="Запчасть — наименование"
              withCost
              onAdd={(v) =>
                addItem.mutate({
                  orderId: order.id,
                  kind: "part",
                  name: v.name,
                  qty: v.qty,
                  price: v.price,
                  cost: v.cost,
                })
              }
            />
          )}
        </Section>

        {/* ---- Итог ---- */}
        <div className="mt-4 rounded-2xl bg-surface-soft p-4">
          <Row label="Работы" value={money(order.totals.works)} />
          <Row label="Запчасти" value={money(order.totals.parts)} />
          <div className="my-2 h-px bg-border" />
          <Row label="Выручка" value={money(order.totals.revenue)} strong />
          <Row
            label="Себестоимость запчастей"
            value={`− ${money(order.totals.cost)}`}
            muted
          />
          <Row
            label="Прибыль"
            value={money(order.totals.profit)}
            strong
            tone={order.totals.profit >= 0 ? "good" : "bad"}
          />
          {order.status === "paid" && (
            <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-800">
              Оплачено {money(order.paidAmount ?? order.totals.revenue)} ·{" "}
              {order.paymentMethod === "transfer" ? "перевод" : "наличные"}
              {order.paidAt
                ? ` · ${new Date(order.paidAt).toLocaleDateString("ru-RU")}`
                : ""}
            </div>
          )}
        </div>
      </div>

      {/* ---- Действия ---- */}
      {!locked && (
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          {order.status === "in_work" && (
            <button
              type="button"
              onClick={async () => {
                await complete.mutateAsync(order.id);
                toast.success("Ремонт готов к выдаче");
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-surface px-4 text-[13px] font-bold text-ink shadow-card-sm hover:bg-surface-soft"
            >
              <Check size={15} /> Готов к выдаче
            </button>
          )}
          <button
            type="button"
            onClick={() => setPayOpen(true)}
            disabled={order.totals.revenue <= 0}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-green px-4 text-[13px] font-bold text-white disabled:opacity-40"
          >
            <Banknote size={15} /> Принять оплату · {money(order.totals.revenue)}
          </button>
          <button
            type="button"
            onClick={async () => {
              const ok = await confirmDialog({
                title: "Отменить ремонт?",
                message: "Заказ-наряд останется в списке, но в статистику не попадёт.",
                confirmText: "Отменить ремонт",
                danger: true,
              });
              if (ok) {
                await cancel.mutateAsync(order.id);
                toast.success("Ремонт отменён");
              }
            }}
            className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold text-muted hover:bg-red-soft hover:text-red-ink"
          >
            Отменить
          </button>
        </footer>
      )}

      {pickerOpen && (
        <WorkPricePicker
          onClose={() => setPickerOpen(false)}
          onPick={(name, price, priceItemId) => {
            addItem.mutate({
              orderId: order.id,
              kind: "work",
              name,
              price,
              priceItemId,
            });
          }}
        />
      )}

      {payOpen && (
        <PayDialog
          total={order.totals.revenue}
          onClose={() => setPayOpen(false)}
          onPay={async (amount, method) => {
            await pay.mutateAsync({ id: order.id, amount, method });
            setPayOpen(false);
            toast.success(
              "Оплата подтверждена",
              `${money(amount)} · ${method === "cash" ? "наличные" : "перевод"}`,
            );
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Section({
  icon,
  title,
  sum,
  hint,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sum: number;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
          {icon} {title}
        </div>
        <span className="text-[13px] font-bold tabular-nums text-ink">
          {money(sum)}
        </span>
        <div className="ml-auto">{action}</div>
      </div>
      {hint && <div className="mb-2 text-[11.5px] text-muted-2">{hint}</div>}
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-3 py-3 text-[12.5px] text-muted-2">
      {text}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span
        className={cn(
          strong ? "text-[13px] font-bold text-ink" : "text-[12.5px] text-muted",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "text-[15px] font-extrabold" : "text-[13px]",
          muted && "text-muted-2",
          tone === "good" && "text-green-ink",
          tone === "bad" && "text-red-ink",
          !tone && !muted && "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ItemRow({
  item,
  locked,
  withCost,
  onPatch,
  onDelete,
}: {
  item: ServiceOrderItem;
  locked: boolean;
  withCost?: boolean;
  onPatch: (b: { qty?: number; price?: number; cost?: number }) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 shadow-card-sm">
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
        {item.name}
      </span>
      <NumInput
        title="Количество"
        value={item.qty}
        disabled={locked}
        width={52}
        onChange={(v) => onPatch({ qty: Math.max(1, v) })}
      />
      {withCost && (
        <NumInput
          title="Закуп за штуку"
          value={item.cost}
          disabled={locked}
          width={82}
          suffix="закуп"
          onChange={(v) => onPatch({ cost: v })}
        />
      )}
      <NumInput
        title="Цена клиенту за штуку"
        value={item.price}
        disabled={locked}
        width={92}
        suffix="₽"
        onChange={(v) => onPatch({ price: v })}
      />
      <span className="w-[92px] shrink-0 text-right text-[13px] font-bold tabular-nums text-ink">
        {money(item.price * item.qty)}
      </span>
      {!locked && (
        <button
          type="button"
          title="Убрать"
          onClick={onDelete}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-2 hover:bg-red-soft hover:text-red-ink"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  disabled,
  width,
  title,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  width: number;
  title: string;
  suffix?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className="relative shrink-0" style={{ width }}>
      <input
        title={title}
        inputMode="numeric"
        disabled={disabled}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={() => {
          if (draft != null && draft !== String(value)) onChange(Number(draft || 0));
          setDraft(null);
        }}
        className="h-8 w-full rounded-lg border border-border bg-surface px-2 text-right text-[12.5px] font-bold tabular-nums text-ink outline-none focus:border-blue-600 disabled:bg-surface-soft disabled:text-muted"
      />
      {suffix && (
        <span className="pointer-events-none absolute -top-1.5 left-1.5 rounded bg-surface px-1 text-[9px] font-bold uppercase text-muted-2">
          {suffix}
        </span>
      )}
    </span>
  );
}

/** Свободная строка: вписал название и цену — добавилось. */
function FreeRow({
  placeholder,
  withCost,
  onAdd,
}: {
  placeholder: string;
  withCost: boolean;
  onAdd: (v: { name: string; qty: number; price: number; cost: number }) => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    const c = Number(cost || 0);
    // Не поставили цену клиенту — значит, продаём по закупу.
    const p = price ? Number(price) : withCost ? c : 0;
    onAdd({ name: name.trim(), qty: Math.max(1, Number(qty || 1)), price: p, cost: c });
    setName("");
    setQty("1");
    setCost("");
    setPrice("");
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted-2"
      />
      <input
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
        title="Количество"
        className="h-8 w-[52px] shrink-0 rounded-lg border border-border bg-surface px-2 text-right text-[12.5px] font-bold tabular-nums outline-none focus:border-blue-600"
      />
      {withCost && (
        <input
          value={cost}
          onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="закуп"
          title="Закуп за штуку"
          className="h-8 w-[82px] shrink-0 rounded-lg border border-border bg-surface px-2 text-right text-[12.5px] font-bold tabular-nums outline-none focus:border-blue-600"
        />
      )}
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="₽"
        title="Цена клиенту за штуку"
        className="h-8 w-[92px] shrink-0 rounded-lg border border-border bg-surface px-2 text-right text-[12.5px] font-bold tabular-nums outline-none focus:border-blue-600"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!name.trim()}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-white disabled:opacity-30"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

/** Выбор работы из прайса — тот же прайс, что и у ущерба, только вид «работы». */
function WorkPricePicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (name: string, price: number, priceItemId: number) => void;
}) {
  const { data } = usePriceList("service");
  const [q, setQ] = useState("");
  const groups = data?.groups ?? [];
  const needle = q.trim().toLowerCase();

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-surface">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Найти работу в прайсе"
          className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-[13px] outline-none focus:border-blue-600"
        />
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-2 hover:bg-surface-soft hover:text-ink"
        >
          <X size={16} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {groups.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted">
            Прайс работ пока пуст. Он заводится в «Документах» →
            «Прейскурант» → «Прайс работ»: строка «что делали» и цена по
            умолчанию.
          </div>
        )}
        {groups.map((g) => {
          const items = g.items.filter(
            (i) => !needle || i.name.toLowerCase().includes(needle),
          );
          if (items.length === 0) return null;
          return (
            <div key={g.id} className="mb-4">
              <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
                {g.name}
              </div>
              <div className="flex flex-col gap-1">
                {items.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => {
                      onPick(i.name, i.priceA ?? 0, i.id);
                      onClose();
                    }}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-blue-50"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                      {i.name}
                    </span>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums text-ink-2">
                      {money(i.priceA ?? 0)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PayDialog({
  total,
  onClose,
  onPay,
}: {
  total: number;
  onClose: () => void;
  onPay: (amount: number, method: "cash" | "transfer") => void;
}) {
  const [amount, setAmount] = useState(String(total));
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-ink/30 p-4 sm:items-center">
      <div className="w-full max-w-[380px] rounded-3xl bg-surface p-4 shadow-card-lg">
        <div className="font-display text-[17px] font-extrabold text-ink">
          Подтвердить оплату
        </div>
        <div className="mt-1 text-[12.5px] text-muted">
          Отметим, что деньги за ремонт получены. Сумма попадёт в выручку блока.
        </div>
        <input
          autoFocus
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
          className="mt-3 h-12 w-full rounded-xl border border-border bg-surface px-3 text-right font-display text-[22px] font-extrabold tabular-nums outline-none focus:border-blue-600"
        />
        <div className="mt-2 flex gap-2">
          {(
            [
              { id: "cash", label: "Наличные", icon: <Banknote size={14} /> },
              { id: "transfer", label: "Перевод", icon: <CreditCard size={14} /> },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethod(m.id)}
              className={cn(
                "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold transition-colors",
                method === m.id
                  ? "bg-ink text-white"
                  : "bg-surface-soft text-muted hover:text-ink",
              )}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl bg-surface-soft text-[13px] font-bold text-muted hover:text-ink"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => onPay(Number(amount || 0), method)}
            className="h-11 flex-[1.4] rounded-xl bg-green text-[13px] font-bold text-white"
          >
            Оплата прошла
          </button>
        </div>
      </div>
    </div>
  );
}
