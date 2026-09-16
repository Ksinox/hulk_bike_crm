import { useEffect, useState } from "react";
import {
  Banknote,
  Check,
  CheckCircle2,
  HandCoins,
  Pencil,
  Phone,
  Printer,
  RotateCcw,
  X,
} from "lucide-react";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { ApiError } from "@/lib/api";
import { confirmDialog, pickAction, toast } from "@/lib/toast";
import {
  serviceInvoiceUrl,
  useAddServiceOrderItem,
  useCancelServiceOrder,
  useCompleteServiceOrder,
  useDeleteServiceOrderItem,
  usePatchServiceOrder,
  usePatchServiceOrderItem,
  useReopenServiceOrder,
  useServiceAdvance,
  useServiceRefund,
  useSettleServiceOrder,
  useUndoServicePayment,
  type ServiceOrder,
} from "@/lib/api/service-orders";
import { DocumentPreviewModal } from "@/pages/rentals/DocumentPreviewModal";
import { ItemsSection, WorkPricePicker, type ItemPatch } from "./ServiceItemsEditor";
import { ServicePaySheet, type PayMode, type PaySubmit } from "./ServicePaySheet";
import { fmtDay, METHOD_LABEL, money, orderNo, StatusBadge, STATUS_LABEL } from "./serviceOrderUi";

/**
 * Заказ-наряд стороннего ремонта (06.09, переделан в 2.0.2).
 *
 * Сверху — кто и с чем (правится кнопкой «Изменить»), ниже работы и
 * запчасти: каждая правка сохраняется сразу, в шапке загорается
 * «Сохранено». Внизу деньги: к оплате, внесённый аванс, остаток. Ремонт
 * остаётся «в работе» сколько угодно — список работ и запчастей меняют по
 * ходу, пока ремонт не оплачен.
 */
export function ServiceOrderCard({
  order,
  touch,
  onClose,
}: {
  order: ServiceOrder;
  /** Телефон и планшет: крупные поля и кнопки. */
  touch: boolean;
  onClose: () => void;
}) {
  // 14.09: без права на прибыль ремонтов нет ни закупа запчастей, ни прибыли.
  const canRepairProfit = useCan("data.repairProfit");
  const addItem = useAddServiceOrderItem();
  const patchItem = usePatchServiceOrderItem();
  const delItem = useDeleteServiceOrderItem();
  const complete = useCompleteServiceOrder();
  const advance = useServiceAdvance();
  const settle = useSettleServiceOrder();
  const refund = useServiceRefund();
  const undoPay = useUndoServicePayment();
  const cancel = useCancelServiceOrder();
  const reopen = useReopenServiceOrder();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pay, setPay] = useState<PayMode | null>(null);
  const [docOpen, setDocOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (savedAt == null) return;
    const t = window.setTimeout(() => setSavedAt(null), 2500);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  const t = order.totals;
  const active = order.status === "in_work" || order.status === "done";
  const locked = !active;
  const works = order.items.filter((i) => i.kind === "work");
  const parts = order.items.filter((i) => i.kind === "part");
  const no = orderNo(order.number);

  /** Любая правка: ошибку — в уведомление, успех — «Сохранено». */
  const run = async (p: Promise<unknown>): Promise<boolean> => {
    try {
      await p;
      setSavedAt(Date.now());
      return true;
    } catch (e) {
      const b = (e as ApiError)?.body as { message?: string } | undefined;
      toast.error("Не сохранилось", b?.message ?? (e as Error).message);
      return false;
    }
  };

  const patch = (id: number, p: ItemPatch) => run(patchItem.mutateAsync({ itemId: id, ...p }));
  const remove = (id: number) => run(delItem.mutateAsync(id));

  const undoToast = (title: string, message: string, paymentId?: number) => {
    if (!paymentId) {
      toast.success(title, message);
      return;
    }
    toast.action({
      title,
      message,
      onAction: async () => {
        try {
          await undoPay.mutateAsync(paymentId);
          toast.success("Отменено", "Запись о деньгах убрана, ремонт вернулся как был.");
        } catch (e) {
          const b = (e as ApiError)?.body as { message?: string } | undefined;
          toast.error("Не удалось отменить", b?.message ?? (e as Error).message);
        }
      },
    });
  };

  const submitPay = async (v: PaySubmit) => {
    if (v.mode === "advance") {
      const r = await advance.mutateAsync({ id: order.id, amount: v.amount, method: v.method, cashAmount: v.cashAmount });
      setPay(null);
      undoToast(`Аванс ${money(v.amount)} принят`, `Ремонт ${no} · остаток ${money(r.order.totals.left)}`, r.paymentId);
    } else if (v.mode === "settle") {
      const r = await settle.mutateAsync({
        id: order.id,
        method: v.method,
        cashAmount: v.cashAmount,
        discount: v.discount,
        expected: t.left,
      });
      setPay(null);
      undoToast(
        `Ремонт ${no} оплачен`,
        [
          v.amount > 0 ? `${money(v.amount)} · ${METHOD_LABEL[v.method]}` : null,
          t.paid > 0 ? `с авансом ${money(r.order.totals.paid)}` : null,
          v.discount > 0 ? `скидка ${money(v.discount)}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        r.paymentId,
      );
    } else {
      const r = await refund.mutateAsync({ id: order.id, amount: v.amount, method: v.method, cashAmount: v.cashAmount });
      setPay(null);
      undoToast(`Возврат ${money(v.amount)} отмечен`, `Ремонт ${no}`, r.paymentId);
    }
  };

  const doCancel = async () => {
    const ok = await confirmDialog({
      title: `Отменить ремонт ${no}?`,
      message:
        t.paid > 0
          ? `Клиент вносил ${money(t.paid)}. Отмена отметит, что деньги ему вернули, — из выручки они уйдут. Ремонт останется в списке «Отменённые», его можно вернуть в работу.`
          : "Ремонт останется в списке «Отменённые» и в статистику не попадёт. Его можно вернуть в работу.",
      confirmText: t.paid > 0 ? "Вернули деньги — отменить" : "Отменить ремонт",
      danger: true,
    });
    if (!ok) return;
    if (await run(cancel.mutateAsync(order.id)))
      toast.success(`Ремонт ${no} отменён`, "Вернуть его можно из списка «Отменённые».");
  };

  // Возврат аванса, записанный именно последней отменой (как на сервере).
  const cancelledMs = order.cancelledAt ? new Date(order.cancelledAt).getTime() : null;
  const cancelRefund = order.payments
    .filter(
      (p) =>
        p.kind === "refund" &&
        p.note === "аванс вернули при отмене" &&
        cancelledMs != null &&
        Math.abs(new Date(p.createdAt).getTime() - cancelledMs) < 60_000,
    )
    .reduce((s, p) => s - p.amount, 0);

  const doReopen = async () => {
    let keepAdvance: boolean | undefined;
    if (cancelRefund > 0) {
      const choice = await pickAction<"keep" | "gone">({
        title: `Вернуть ремонт ${no} в работу`,
        message: `При отмене аванс ${money(cancelRefund)} отметили как возвращённый клиенту. Где эти деньги?`,
        options: [
          { id: "keep", label: "Деньги у нас", hint: "Отменили по ошибке — аванс снова засчитан в ремонт", tone: "primary" },
          { id: "gone", label: "Клиент их забрал", hint: "Остаток к оплате — полная сумма ремонта" },
        ],
      });
      if (!choice) return;
      keepAdvance = choice === "keep";
    } else {
      const ok = await confirmDialog({
        title: `Вернуть ремонт ${no} в работу?`,
        message: `Статус станет «${STATUS_LABEL[(order.statusBeforeCancel as "in_work" | "done") ?? "in_work"] ?? "В работе"}», работы и запчасти можно будет снова менять.`,
        confirmText: "Вернуть в работу",
      });
      if (!ok) return;
    }
    setBusy(true);
    const ok = await run(reopen.mutateAsync({ id: order.id, keepAdvance }));
    setBusy(false);
    if (ok) toast.success(`Ремонт ${no} снова в работе`);
  };

  const saveAndClose = () => {
    toast.success(`Ремонт ${no} сохранён`, `${STATUS_LABEL[order.status]} · ${t.left > 0 ? `остаток ${money(t.left)}` : `к оплате ${money(t.due)}`}`);
    onClose();
  };

  const btn = touch ? "h-12 text-[14px]" : "h-10 text-[13px]";

  return (
    <div className="relative flex h-full min-h-0 flex-col" data-service-card={order.id}>
      {/* ---- Шапка ---- */}
      <header className="flex shrink-0 items-start gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[19px] font-extrabold text-ink">Ремонт {no}</h2>
            <StatusBadge status={order.status} />
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11.5px] font-semibold text-green-ink transition-opacity",
                savedAt ? "opacity-100" : "opacity-0",
              )}
              aria-live="polite"
            >
              <CheckCircle2 size={13} /> Сохранено
            </span>
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-muted">
            принят {fmtDay(order.acceptedAt)}
            {order.completedAt && order.status !== "in_work" ? ` · готов ${fmtDay(order.completedAt)}` : ""}
            {active ? " · правки сохраняются сразу" : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDocOpen(true)}
          className={cn(
            "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-surface-soft font-bold text-ink hover:bg-border",
            touch ? "h-11 w-11" : "h-9 px-3 text-[12.5px]",
          )}
          title="Накладная по ремонту"
          aria-label="Накладная"
        >
          <Printer size={touch ? 18 : 15} />
          {!touch && "Накладная"}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl text-muted-2 hover:bg-surface-soft hover:text-ink",
            touch ? "h-11 w-11" : "h-9 w-9",
          )}
        >
          <X size={touch ? 20 : 17} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {order.status === "cancelled" && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-soft px-4 py-3">
            <div className="min-w-0 flex-1 text-[13px] text-ink-2">
              <b className="text-ink">Ремонт отменён{order.cancelledAt ? ` ${fmtDay(order.cancelledAt)}` : ""}.</b>{" "}
              В статистику не идёт. Если отменили по ошибке или клиент вернулся — верните его в работу.
            </div>
            <button
              type="button"
              onClick={doReopen}
              disabled={busy}
              className={cn("inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 font-bold text-white disabled:opacity-50", btn)}
            >
              <RotateCcw size={15} /> Вернуть в работу
            </button>
          </div>
        )}

        <ClientBlock order={order} touch={touch} editable={order.status !== "cancelled"} onSaved={() => setSavedAt(Date.now())} />

        <ItemsSection
          kind="work"
          items={works.map((i) => ({ key: i.id, name: i.name, qty: i.qty, price: i.price }))}
          sum={t.works}
          touch={touch}
          locked={locked}
          withCost={false}
          onPatch={(k, p) => patch(Number(k), p)}
          onRemove={(k) => remove(Number(k))}
          onAdd={(v) => run(addItem.mutateAsync({ orderId: order.id, kind: "work", name: v.name, qty: v.qty, price: v.price }))}
          onPickFromPrice={() => setPickerOpen(true)}
        />
        <ItemsSection
          kind="part"
          items={parts.map((i) => ({ key: i.id, name: i.name, qty: i.qty, price: i.price, cost: i.cost }))}
          sum={t.parts}
          touch={touch}
          locked={locked}
          withCost={canRepairProfit}
          onPatch={(k, p) => patch(Number(k), p)}
          onRemove={(k) => remove(Number(k))}
          onAdd={(v) =>
            run(addItem.mutateAsync({ orderId: order.id, kind: "part", name: v.name, qty: v.qty, price: v.price, cost: v.cost }))
          }
        />

        <MoneyBlock order={order} showProfit={canRepairProfit} onRefund={() => setPay("refund")} />

        {active && (
          <button
            type="button"
            onClick={doCancel}
            className="mt-4 inline-flex h-11 items-center rounded-xl px-3 text-[13px] font-semibold text-muted hover:bg-red-soft hover:text-red-ink"
          >
            Отменить ремонт
          </button>
        )}
      </div>

      {/* ---- Действия ---- */}
      {active ? (
        <footer
          className={cn(
            "shrink-0 border-t border-border px-4 py-3",
            touch ? "grid grid-cols-2 gap-2 pb-[calc(12px+env(safe-area-inset-bottom))]" : "flex flex-wrap items-center gap-2",
          )}
        >
          <button
            type="button"
            onClick={() => setPay("advance")}
            disabled={t.left <= 1}
            className={cn("inline-flex items-center justify-center gap-1.5 rounded-xl bg-surface px-4 font-bold text-ink shadow-card-sm hover:bg-surface-soft disabled:opacity-40", btn)}
          >
            <HandCoins size={16} /> Аванс
          </button>
          {order.status === "in_work" ? (
            <button
              type="button"
              onClick={() =>
                run(complete.mutateAsync(order.id)).then((ok) => ok && toast.success(`Ремонт ${no} готов к выдаче`))
              }
              className={cn("inline-flex items-center justify-center gap-1.5 rounded-xl bg-surface px-4 font-bold text-ink shadow-card-sm hover:bg-surface-soft", btn)}
            >
              <Check size={16} /> Готов к выдаче
            </button>
          ) : (
            touch && <span />
          )}
          <button
            type="button"
            onClick={saveAndClose}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-xl bg-surface-soft px-4 font-bold text-ink-2 hover:bg-border",
              btn,
              !touch && "ml-auto",
            )}
          >
            Сохранить и закрыть
          </button>
          <button
            type="button"
            onClick={() => setPay("settle")}
            disabled={t.revenue <= 0 || t.overpaid > 0}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-xl bg-green px-4 font-bold text-white disabled:opacity-40",
              btn,
            )}
          >
            <Banknote size={16} />
            {t.left > 0 ? `Принять оплату · ${money(t.left)}` : "Закрыть — оплачен"}
          </button>
        </footer>
      ) : order.status === "paid" ? (
        <footer className="flex shrink-0 gap-2 border-t border-border px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setDocOpen(true)}
            className={cn("inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink px-4 font-bold text-white", btn)}
          >
            <Printer size={16} /> Накладная
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn("flex-1 rounded-xl bg-surface-soft px-4 font-bold text-ink-2", btn)}
          >
            Закрыть
          </button>
        </footer>
      ) : null}

      {pickerOpen && (
        <WorkPricePicker
          touch={touch}
          onClose={() => setPickerOpen(false)}
          onPick={(name, price, priceItemId) =>
            run(addItem.mutateAsync({ orderId: order.id, kind: "work", name, price, priceItemId }))
          }
        />
      )}

      {pay && (
        <ServicePaySheet
          order={order}
          initialMode={pay}
          touch={touch}
          onClose={() => setPay(null)}
          onSubmit={submitPay}
        />
      )}

      {docOpen && (
        <DocumentPreviewModal
          title={`Накладная по ремонту ${no}`}
          htmlUrl={serviceInvoiceUrl(order.id, "html")}
          docxUrl={serviceInvoiceUrl(order.id, "docx")}
          docxFilename={`Накладная по ремонту ${String(order.number).padStart(4, "0")}.doc`}
          onClose={() => setDocOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Кто и с чем: правка имени, телефона, техники и жалобы (2.0.2). */
function ClientBlock({
  order,
  touch,
  editable,
  onSaved,
}: {
  order: ServiceOrder;
  touch: boolean;
  editable: boolean;
  onSaved: () => void;
}) {
  const patchOrder = usePatchServiceOrder();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => formOf(order));
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setForm(formOf(order));
    setError(null);
    setEditing(true);
  };
  const valid = form.customerName.trim() && form.vehicle.trim();
  const save = async () => {
    if (!valid) {
      setError("Имя клиента и техника — обязательны");
      return;
    }
    try {
      await patchOrder.mutateAsync({
        id: order.id,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim() || null,
        vehicle: form.vehicle.trim(),
        vehicleNumber: form.vehicleNumber.trim() || null,
        complaint: form.complaint.trim() || null,
      });
      setEditing(false);
      onSaved();
    } catch (e) {
      const b = (e as ApiError)?.body as { message?: string } | undefined;
      setError(b?.message ?? (e as Error).message);
    }
  };

  const input = cn(
    "w-full rounded-xl border border-border bg-surface px-3 text-ink outline-none focus:border-blue-600",
    touch ? "h-12 text-[16px]" : "h-10 text-[13.5px]",
  );

  if (editing) {
    return (
      <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50/40 p-3" data-client-edit>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Клиент">
            <input
              autoFocus={!touch}
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              autoComplete="off"
              className={input}
            />
          </Field>
          <Field label="Телефон">
            <input
              value={form.customerPhone}
              onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
              inputMode="tel"
              autoComplete="off"
              placeholder="+7 ..."
              className={input}
            />
          </Field>
          <Field label="Техника">
            <input
              value={form.vehicle}
              onChange={(e) => setForm({ ...form, vehicle: e.target.value })}
              className={input}
            />
          </Field>
          <Field label="Номер или VIN">
            <input
              value={form.vehicleNumber}
              onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })}
              className={input}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="С чем приехали">
              <textarea
                value={form.complaint}
                onChange={(e) => setForm({ ...form, complaint: e.target.value })}
                rows={3}
                className={cn(input, "h-auto resize-none py-2")}
              />
            </Field>
          </div>
        </div>
        {error && <div className="mt-2 text-[12.5px] font-semibold text-red-ink">{error}</div>}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className={cn("flex-1 rounded-xl bg-surface font-bold text-muted shadow-card-sm", touch ? "h-12 text-[14px]" : "h-10 text-[13px]")}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={save}
            disabled={patchOrder.isPending}
            className={cn("flex-[1.6] rounded-xl bg-ink font-bold text-white disabled:opacity-50", touch ? "h-12 text-[14px]" : "h-10 text-[13px]")}
          >
            {patchOrder.isPending ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-2xl bg-surface-soft px-4 py-3" data-client-block>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">{order.customerName}</div>
          {order.customerPhone ? (
            <a
              href={`tel:${order.customerPhone.replace(/[^\d+]/g, "")}`}
              className="mt-0.5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-blue-700"
            >
              <Phone size={13} /> {order.customerPhone}
            </a>
          ) : (
            <div className="mt-0.5 text-[12.5px] text-muted-2">телефон не указан</div>
          )}
          <div className="mt-1.5 text-[13px] text-ink-2">
            {order.vehicle}
            {order.vehicleNumber ? <span className="text-muted"> · {order.vehicleNumber}</span> : null}
          </div>
        </div>
        {editable && (
          <button
            type="button"
            onClick={start}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-surface px-3 font-bold text-ink shadow-card-sm hover:bg-border",
              touch ? "h-11 text-[13.5px]" : "h-9 text-[12.5px]",
            )}
          >
            <Pencil size={14} /> Изменить
          </button>
        )}
      </div>
      {order.complaint && (
        <div className="mt-2.5 border-t border-border pt-2.5">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">С чем приехали</div>
          <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{order.complaint}</div>
        </div>
      )}
    </div>
  );
}

function formOf(o: ServiceOrder) {
  return {
    customerName: o.customerName,
    customerPhone: o.customerPhone ?? "",
    vehicle: o.vehicle,
    vehicleNumber: o.vehicleNumber ?? "",
    complaint: o.complaint ?? "",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">{label}</span>
      {children}
    </label>
  );
}

/** Деньги: к оплате → аванс → остаток; прибыль — с правом. */
function MoneyBlock({
  order,
  showProfit,
  onRefund,
}: {
  order: ServiceOrder;
  showProfit: boolean;
  onRefund: () => void;
}) {
  const t = order.totals;
  const pays = order.payments.filter((p) => p.amount !== 0 || p.discount > 0);
  return (
    <div className="rounded-2xl bg-surface-soft p-4" data-money-block>
      <Row label="Работы" value={money(t.works)} />
      <Row label="Запчасти" value={money(t.parts)} />
      {t.discount > 0 && <Row label="Скидка" value={`− ${money(t.discount)}`} />}
      <div className="my-2 h-px bg-border" />
      <Row label="К оплате" value={money(t.due)} strong />
      {pays.map((p) => (
        <Row
          key={p.id}
          label={`${p.kind === "advance" ? "Аванс" : p.kind === "refund" ? "Возврат" : "Оплата"} · ${fmtDay(p.paidAt)} · ${METHOD_LABEL[p.method] ?? p.method}`}
          value={`${p.amount < 0 ? "+ " : "− "}${money(Math.abs(p.amount))}`}
          tone={p.amount < 0 ? "bad" : "good"}
        />
      ))}
      {order.status === "paid" ? (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-green-soft px-3 py-2 text-[13px] font-bold text-green-ink">
          <CheckCircle2 size={16} /> Оплачено полностью · {money(t.paid)}
          {order.paidAt ? ` · ${fmtDay(order.paidAt)}` : ""}
        </div>
      ) : order.status !== "cancelled" ? (
        <div className="mt-2 flex items-baseline justify-between gap-3 rounded-xl bg-surface px-3 py-2.5 shadow-card-sm">
          <span className="text-[13.5px] font-bold text-ink">Остаток к оплате</span>
          <span
            className={cn(
              "font-display text-[22px] font-extrabold tabular-nums",
              t.left > 0 ? "text-orange-ink" : "text-green-ink",
            )}
            data-left={t.left}
          >
            {money(t.left)}
          </span>
        </div>
      ) : null}
      {t.overpaid > 0 && order.status !== "cancelled" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-red-soft px-3 py-2 text-[12.5px] text-red-ink">
          <span className="min-w-0 flex-1">
            Внесено больше суммы ремонта на <b>{money(t.overpaid)}</b> — позиции стали дешевле. Верните разницу клиенту.
          </span>
          <button
            type="button"
            onClick={onRefund}
            className="h-10 rounded-xl bg-surface px-3 text-[12.5px] font-bold text-red-ink shadow-card-sm"
          >
            Вернул разницу
          </button>
        </div>
      )}
      {showProfit && t.cost !== undefined && t.profit !== undefined && (
        <div className="mt-3 border-t border-border pt-2">
          <Row label="Закуп запчастей" value={`− ${money(t.cost)}`} muted />
          <Row label="Прибыль" value={money(t.profit)} strong tone={t.profit >= 0 ? "good" : "bad"} />
        </div>
      )}
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
      <span className={cn("min-w-0", strong ? "text-[13.5px] font-bold text-ink" : "text-[12.5px] text-muted")}>
        {label}
      </span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          strong ? "text-[15px] font-extrabold" : "text-[13px] font-semibold",
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
