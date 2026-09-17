import { useEffect, useMemo, useState } from "react";
import { HandCoins, X } from "lucide-react";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { ApiError } from "@/lib/api";
import { usePersistedFormState } from "@/lib/usePersistedState";
import { Switch } from "@/components/ui/switch";
import { PayMethodPicker, splitByMethod, type PayMethod } from "@/components/PayMethodPicker";
import { TABLET_WIZARD_PANEL } from "@/mobile/tablet";
import { useCreateServiceOrder, type SavedToPrice, type ServiceOrder } from "@/lib/api/service-orders";
import { ItemsSection, PricePicker, type ItemPatch, type NewRowValue } from "./ServiceItemsEditor";
import { digits, money } from "./serviceOrderUi";

/**
 * Новый сторонний ремонт (2.0.2).
 *
 * Заказчик: «когда прописали перечень работ и запчастей, нужна возможность
 * сохранить сделку в статусе „в работе“ с возможностью редактирования».
 * Раньше окно приёма спрашивало только технику и клиента, а работы
 * добавлялись уже в карточке — казалось, что ремонт не сохранён, пока не
 * оплачен. Теперь всё в одной форме: кто, что, работы, запчасти, аванс —
 * и одна кнопка «Сохранить — в работе». Черновик переживает обновление
 * страницы.
 */

type DraftItem = {
  key: string;
  kind: "work" | "part";
  name: string;
  qty: number;
  price: number;
  cost: number;
  priceItemId: number | null;
  /** Своя позиция — сохранить в прайс при сохранении ремонта. */
  saveToPrice?: boolean;
};

type Draft = {
  customerName: string;
  customerPhone: string;
  vehicle: string;
  vehicleNumber: string;
  complaint: string;
  items: DraftItem[];
  advanceOn: boolean;
  advance: string;
  advMethod: PayMethod;
  advCash: number;
};

const fresh = (): Draft => ({
  customerName: "",
  customerPhone: "",
  vehicle: "",
  vehicleNumber: "",
  complaint: "",
  items: [],
  advanceOn: false,
  advance: "",
  advMethod: "cash",
  advCash: 0,
});

const hasData = (d: Draft) =>
  !!(d.customerName || d.customerPhone || d.vehicle || d.vehicleNumber || d.complaint || d.items.length || d.advance);

let seq = 0;
const newKey = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

export function ServiceOrderForm({
  touch,
  onClose,
  onCreated,
}: {
  touch: boolean;
  onClose: () => void;
  onCreated: (order: ServiceOrder, savedToPrice: SavedToPrice[]) => void;
}) {
  const canRepairProfit = useCan("data.repairProfit");
  const create = useCreateServiceOrder();
  const [draft, setDraft, clearDraft] = usePersistedFormState<Draft>("service-order-new", fresh);
  const [restored, setRestored] = useState(() => hasData(draft));
  const [pickerOpen, setPickerOpen] = useState<"work" | "part" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pickerOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pickerOpen]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const totals = useMemo(() => {
    let works = 0;
    let parts = 0;
    for (const i of draft.items) {
      if (i.kind === "work") works += i.price * i.qty;
      else parts += i.price * i.qty;
    }
    return { works, parts, due: works + parts };
  }, [draft.items]);

  const addItem = (kind: DraftItem["kind"], v: Omit<NewRowValue, "saveToPrice"> & { saveToPrice?: boolean }) =>
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        {
          key: newKey(),
          kind,
          name: v.name,
          qty: v.qty,
          price: v.price,
          cost: kind === "part" ? v.cost : 0,
          priceItemId: v.priceItemId ?? null,
          saveToPrice: v.saveToPrice ?? false,
        },
      ],
    }));
  const patchItem = (key: string | number, p: ItemPatch) =>
    setDraft((d) => ({ ...d, items: d.items.map((i) => (i.key === key ? { ...i, ...p } : i)) }));
  const removeItem = (key: string | number) =>
    setDraft((d) => ({ ...d, items: d.items.filter((i) => i.key !== key) }));

  const advance = draft.advanceOn ? Number(draft.advance || 0) : 0;
  const advSplit = splitByMethod(advance, draft.advMethod, draft.advCash);
  const nameOk = draft.customerName.trim().length > 0;
  const vehicleOk = draft.vehicle.trim().length > 0;
  let advProblem: string | null = null;
  if (draft.advanceOn) {
    if (advance < 1) advProblem = "Укажите сумму аванса или выключите его";
    else if (totals.due === 0) advProblem = "Аванс берут, когда в ремонте есть работы или запчасти";
    else if (advance >= totals.due)
      advProblem = `Аванс меньше суммы ремонта (${money(totals.due)}). Полную оплату примете при выдаче`;
    else if (draft.advMethod === "mixed" && (advSplit.cash < 1 || advSplit.transfer < 1))
      advProblem = "Обе части смешанной оплаты больше нуля";
  }
  const canSave = nameOk && vehicleOk && !advProblem && !create.isPending;

  const save = async () => {
    setTried(true);
    if (!canSave) return;
    setError(null);
    try {
      const r = await create.mutateAsync({
        customerName: draft.customerName.trim(),
        customerPhone: draft.customerPhone.trim() || null,
        vehicle: draft.vehicle.trim(),
        vehicleNumber: draft.vehicleNumber.trim() || null,
        complaint: draft.complaint.trim() || null,
        items: draft.items.map((i) => ({
          kind: i.kind,
          name: i.name,
          qty: i.qty,
          price: i.price,
          cost: i.kind === "part" && canRepairProfit ? i.cost : undefined,
          priceItemId: i.priceItemId,
          saveToPrice: i.saveToPrice ?? false,
        })),
        advance: advance > 0 ? { amount: advance, method: draft.advMethod, cashAmount: advSplit.cash } : undefined,
      });
      clearDraft();
      onCreated(r.order, r.savedToPrice ?? []);
    } catch (e) {
      const b = (e as ApiError)?.body as { message?: string } | undefined;
      setError(b?.message ?? (e as Error).message ?? "Не удалось сохранить");
    }
  };

  const input = cn(
    "w-full rounded-xl border bg-surface px-3 text-ink outline-none placeholder:text-muted-2 focus:border-blue-600",
    touch ? "h-12 text-[16px]" : "h-11 text-[14px]",
  );
  const bad = (ok: boolean) => (tried && !ok ? "border-red-ink/60 bg-red-soft/30" : "border-border");

  const body = (
    <>
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[20px] font-extrabold text-ink">Новый ремонт</div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            Чужая техника: в парк не заводится. Сохраните — ремонт будет «в работе», работы и запчасти можно менять потом.
          </div>
        </div>
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

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-service-form>
        {restored && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-blue-50 px-4 py-2.5 text-[12.5px] text-blue-800">
            <span className="min-w-0 flex-1">Продолжаем черновик — введённое не потерялось.</span>
            <button
              type="button"
              onClick={() => {
                clearDraft();
                setDraft(fresh());
                setRestored(false);
              }}
              className="h-9 shrink-0 rounded-lg px-2 font-bold hover:bg-blue-100"
            >
              Очистить
            </button>
          </div>
        )}

        <Group title="Клиент">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Имя" required>
              <input
                autoFocus={!touch}
                value={draft.customerName}
                onChange={(e) => set("customerName", e.target.value)}
                placeholder="Как зовут клиента"
                autoComplete="off"
                className={cn(input, bad(nameOk))}
              />
            </Field>
            <Field label="Телефон">
              <input
                value={draft.customerPhone}
                onChange={(e) => set("customerPhone", e.target.value)}
                placeholder="+7 ..."
                inputMode="tel"
                autoComplete="off"
                className={cn(input, "border-border")}
              />
            </Field>
          </div>
        </Group>

        <Group title="Техника">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Марка и модель" required>
              <input
                value={draft.vehicle}
                onChange={(e) => set("vehicle", e.target.value)}
                placeholder="Honda Dio AF62"
                className={cn(input, bad(vehicleOk))}
              />
            </Field>
            <Field label="Номер или VIN">
              <input
                value={draft.vehicleNumber}
                onChange={(e) => set("vehicleNumber", e.target.value)}
                placeholder="если есть"
                className={cn(input, "border-border")}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="С чем приехали">
                <textarea
                  value={draft.complaint}
                  onChange={(e) => set("complaint", e.target.value)}
                  rows={2}
                  placeholder="Не заводится, стучит вариатор…"
                  className={cn(input, "h-auto resize-none border-border py-2.5")}
                />
              </Field>
            </div>
          </div>
        </Group>

        <ItemsSection
          kind="work"
          items={draft.items.filter((i) => i.kind === "work")}
          sum={totals.works}
          touch={touch}
          locked={false}
          withCost={false}
          onPatch={patchItem}
          onRemove={removeItem}
          onAdd={(v) => addItem("work", v)}
          onPickFromPrice={() => setPickerOpen("work")}
        />
        <ItemsSection
          kind="part"
          items={draft.items.filter((i) => i.kind === "part")}
          sum={totals.parts}
          touch={touch}
          locked={false}
          withCost={canRepairProfit}
          onPatch={patchItem}
          onRemove={removeItem}
          onAdd={(v) => addItem("part", v)}
          onPickFromPrice={() => setPickerOpen("part")}
        />

        <div className="rounded-2xl bg-surface-soft p-4" data-form-money>
          <div className="flex items-baseline justify-between gap-3 text-[12.5px] text-muted">
            <span>Работы · запчасти</span>
            <span className="tabular-nums">
              {money(totals.works)} · {money(totals.parts)}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-bold text-ink">К оплате</span>
            <span className="font-display text-[22px] font-extrabold tabular-nums text-ink">{money(totals.due)}</span>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-soft text-green-ink">
                <HandCoins size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-ink">Клиент вносит аванс</span>
                <span className="block text-[12px] text-muted">Часть суммы сейчас — остаток при выдаче</span>
              </span>
              <Switch checked={draft.advanceOn} onChange={(v) => set("advanceOn", v)} label="Аванс" />
            </label>
            {draft.advanceOn && (
              <div className="mt-3">
                <span className="flex items-center rounded-2xl border border-border bg-surface px-4 focus-within:border-blue-600">
                  <input
                    inputMode="numeric"
                    value={draft.advance}
                    onChange={(e) => set("advance", digits(e.target.value))}
                    placeholder="Сумма аванса"
                    aria-label="Сумма аванса"
                    className="h-12 min-w-0 flex-1 bg-transparent text-right font-display text-[22px] font-extrabold tabular-nums text-ink outline-none placeholder:text-[15px] placeholder:font-semibold placeholder:text-muted-2"
                  />
                  <span className="ml-2 text-[16px] font-bold text-muted-2">₽</span>
                </span>
                {totals.due > 1 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[...new Set([Math.floor(totals.due / 2), 1000, 2000, 5000])]
                      .filter((v) => v >= 1 && v < totals.due)
                      .slice(0, 4)
                      .map((v, i) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => set("advance", String(v))}
                          className={cn(
                            "rounded-full px-3.5 font-semibold",
                            touch ? "h-10 text-[13.5px]" : "h-8 text-[12.5px]",
                            advance === v ? "bg-ink text-white" : "bg-surface text-ink-2 shadow-card-sm hover:bg-border",
                          )}
                        >
                          {i === 0 ? `Половина · ${money(v)}` : money(v)}
                        </button>
                      ))}
                  </div>
                )}
                {advance > 0 && (
                  <div className="mt-3">
                    <PayMethodPicker
                      total={advance}
                      method={draft.advMethod}
                      onMethod={(m) => set("advMethod", m)}
                      cash={draft.advCash}
                      onCash={(v) => set("advCash", v)}
                      compact={!touch}
                      touch={touch}
                    />
                  </div>
                )}
                {advProblem ? (
                  advance > 0 || tried ? (
                    <div className="mt-2 text-[12.5px] font-semibold text-red-ink">{advProblem}</div>
                  ) : null
                ) : (
                  <div className="mt-2 text-[12.5px] text-muted">
                    Останется к оплате <b className="text-ink">{money(totals.due - advance)}</b>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      <footer
        className={cn(
          "flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 py-3",
          touch && "pb-[calc(12px+env(safe-area-inset-bottom))]",
        )}
      >
        {(error || (tried && (!nameOk || !vehicleOk))) && (
          <div className="w-full rounded-xl bg-red-soft px-3 py-2 text-[12.5px] font-semibold text-red-ink">
            {error ?? "Заполните имя клиента и технику"}
          </div>
        )}
        {!touch && (
          <span className="mr-auto text-[12px] text-muted-2">
            {draft.items.length
              ? `${draft.items.length} ${plural(draft.items.length)} · ${money(totals.due)}`
              : "Позиции можно добавить и потом"}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "shrink-0 rounded-xl bg-surface-soft font-bold text-muted hover:text-ink",
            touch ? "h-12 px-4 text-[14px]" : "h-11 px-5 text-[13px]",
          )}
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={save}
          disabled={create.isPending}
          className={cn(
            "whitespace-nowrap rounded-xl bg-ink font-bold text-white disabled:opacity-50",
            touch ? "h-12 flex-1 px-3 text-[14px]" : "h-11 px-6 text-[13.5px]",
            !canSave && !create.isPending && "opacity-60",
          )}
        >
          {create.isPending ? "Сохраняем…" : "Сохранить — в работе"}
        </button>
      </footer>
      {/* Выбор из прайса накрывает всю панель, а не прокручиваемую часть. */}
      {pickerOpen && (
        <PricePicker
          kind={pickerOpen}
          touch={touch}
          withCost={canRepairProfit}
          onClose={() => setPickerOpen(null)}
          onPick={(i) =>
            addItem(pickerOpen, { name: i.name, qty: 1, price: i.priceA ?? 0, cost: i.cost ?? 0, priceItemId: i.id })
          }
        />
      )}
    </>
  );

  if (touch) {
    return (
      <div
        className="fixed inset-0 z-[70] flex flex-col bg-surface lg:items-center lg:bg-ink/45 lg:backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Новый ремонт"
      >
        <div className={cn(TABLET_WIZARD_PANEL, "relative")}>{body}</div>
      </div>
    );
  }
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Новый ремонт"
    >
      <div className="relative flex max-h-[min(920px,94vh)] w-full max-w-[860px] flex-col overflow-hidden rounded-3xl bg-surface shadow-card-lg">
        {body}
      </div>
    </div>
  );
}

function plural(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "позиция";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "позиции";
  return "позиций";
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-2">{title}</div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold text-ink-2">
        {label}
        {required && <span className="text-red-ink"> *</span>}
      </span>
      {children}
    </label>
  );
}
