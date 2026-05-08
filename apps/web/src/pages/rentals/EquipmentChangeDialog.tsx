/**
 * v0.4.49 — диалог изменения экипировки активной аренды.
 *
 * Бизнес-логика:
 *   • Оператор может убрать существующий пункт (✕) или добавить новый
 *     из useApiEquipment().
 *   • Пересчитывается дельта на оставшиеся дни:
 *       delta = (Σ новых не-free) − (Σ старых не-free) × remainingDays
 *   • delta > 0  → доплата:
 *       • payNow=true  → payment(type='equipment_fee', paid=true)
 *       • payNow=false → debt_entry(kind='manual_charge')
 *   • delta < 0 → возврат на clients.deposit_balance + payment(refund)
 *   • delta = 0 → просто обновить equipmentJson
 *
 * Доступно только на active/overdue/returning. На completed/archived
 * бэк вернёт 409.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Loader2,
  Plus,
  Shirt,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useApiEquipment } from "@/lib/api/equipment";
import { equipmentChangeAsync } from "./rentalsStore";
import type { Rental } from "@/lib/mock/rentals";

type EquipItem = {
  itemId?: number | null;
  name: string;
  price: number;
  free: boolean;
};

export function EquipmentChangeDialog({
  rental,
  onClose,
}: {
  rental: Rental;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: catalog = [] } = useApiEquipment();
  const initial: EquipItem[] = useMemo(
    () =>
      ((rental as { equipmentJson?: EquipItem[] }).equipmentJson ?? []).map(
        (it) => ({
          itemId: it.itemId ?? null,
          name: it.name,
          price: it.price,
          free: it.free,
        }),
      ),
    [rental],
  );
  const [items, setItems] = useState<EquipItem[]>(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [payNow, setPayNow] = useState<boolean>(true);
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [saving, setSaving] = useState(false);

  // Сумма не-free / день
  const sumPerDay = (arr: EquipItem[]): number =>
    arr.reduce((s, it) => s + (it.free ? 0 : it.price), 0);
  const oldDaily = sumPerDay(initial);
  const newDaily = sumPerDay(items);
  const dailyDelta = newDaily - oldDaily;

  // Оставшиеся дни до endPlannedAt
  const remainingDays = useMemo(() => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(rental.endPlanned);
    if (!m) return 0;
    const end = new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      23,
      59,
      59,
    );
    const now = new Date();
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
  }, [rental.endPlanned]);

  const totalDelta = dailyDelta * remainingDays;
  const fmt = (n: number) => n.toLocaleString("ru-RU");

  const removeItem = (index: number) => {
    setItems((arr) => arr.filter((_, i) => i !== index));
  };

  const addFromCatalog = (catId: number) => {
    const cat = catalog.find((c) => c.id === catId);
    if (!cat) return;
    setItems((arr) => [
      ...arr,
      {
        itemId: cat.id,
        name: cat.name,
        price: cat.price,
        free: cat.isFree,
      },
    ]);
    setPickerOpen(false);
  };

  const submit = async () => {
    if (saving) return;
    if (totalDelta > 0 && payNow && !method) {
      toast.error("Выберите способ оплаты");
      return;
    }
    setSaving(true);
    try {
      await equipmentChangeAsync({
        rentalId: rental.id,
        newEquipmentJson: items,
        payNow,
        method: payNow ? method : undefined,
      });
      const msg =
        totalDelta === 0
          ? "Состав экипировки обновлён"
          : totalDelta > 0
            ? `Доплата ${fmt(totalDelta)} ₽${payNow ? " зафиксирована" : " — в долг"}`
            : `Возврат ${fmt(-totalDelta)} ₽ → депозит клиента`;
      toast.success("Экипировка изменена", msg);
      requestClose();
    } catch (e) {
      toast.error("Не удалось изменить", (e as Error).message ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-ink/55 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
    >
      <div
        className={cn(
          "mt-12 w-full max-w-[480px] overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <Shirt size={16} className="text-blue-600" />
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            Изменить экипировку · аренда #{String(rental.id).padStart(4, "0")}
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 text-[13px] text-ink-2">
          <div className="rounded-[10px] bg-surface-soft px-3 py-2">
            <div className="flex justify-between text-[11px] text-muted">
              <span>Оставшихся дней до возврата</span>
              <span className="font-bold text-ink">{remainingDays}</span>
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>Дельта стоимости / сутки</span>
              <span
                className={cn(
                  "font-bold",
                  dailyDelta > 0
                    ? "text-amber-700"
                    : dailyDelta < 0
                      ? "text-green-700"
                      : "text-ink",
                )}
              >
                {dailyDelta > 0 ? "+" : ""}
                {fmt(dailyDelta)} ₽
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1">
              <span className="text-[11px] font-bold text-ink">
                Итого на оставшийся срок
              </span>
              <span
                className={cn(
                  "tabular-nums font-bold",
                  totalDelta > 0
                    ? "text-amber-700"
                    : totalDelta < 0
                      ? "text-green-700"
                      : "text-ink",
                )}
              >
                {totalDelta > 0 ? "+" : ""}
                {fmt(totalDelta)} ₽
              </span>
            </div>
          </div>

          {/* Текущий состав */}
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Состав
            </div>
            {items.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-border px-3 py-3 text-center text-[12px] text-muted">
                Без экипировки
              </div>
            ) : (
              items.map((it, i) => (
                <div
                  key={`${it.itemId ?? "free"}-${i}`}
                  className="flex items-center gap-2 rounded-[10px] bg-white px-3 py-2 ring-1 ring-border"
                >
                  <span className="flex-1 text-[13px] text-ink">
                    {it.name}
                  </span>
                  {it.free ? (
                    <span className="rounded-full bg-green-soft px-2 py-0.5 text-[10px] font-bold text-green-ink">
                      бесплатно
                    </span>
                  ) : (
                    <span className="text-[11px] tabular-nums text-amber-700 font-semibold">
                      +{fmt(it.price)} ₽/сут
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-2 hover:bg-red-soft hover:text-red-ink"
                    title="Убрать"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border bg-white px-3 py-2 text-[12px] font-semibold text-blue-600 hover:border-blue-400 hover:bg-blue-50/40"
            >
              <Plus size={12} /> Добавить из каталога
            </button>
            {pickerOpen && (
              <div className="rounded-[10px] bg-surface-soft p-2">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
                  Каталог экипировки
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {catalog.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => addFromCatalog(c.id)}
                      className="flex flex-col items-start gap-0.5 rounded-[8px] bg-white px-2 py-1.5 text-left text-[11px] hover:bg-blue-50"
                    >
                      <span className="font-semibold text-ink">{c.name}</span>
                      <span
                        className={cn(
                          "text-[10px]",
                          c.isFree
                            ? "text-green-ink"
                            : "text-amber-700 font-semibold",
                        )}
                      >
                        {c.isFree ? "бесплатно" : `+${fmt(c.price)} ₽/сут`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Решение про оплату при totalDelta > 0 */}
          {totalDelta > 0 && (
            <div className="flex flex-col gap-2 rounded-[10px] border border-amber-200 bg-amber-50/40 px-3 py-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Доплата {fmt(totalDelta)} ₽
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setPayNow(true)}
                  className={cn(
                    "flex-1 rounded-[8px] border px-2 py-1.5 text-[11px] font-semibold transition-colors",
                    payNow
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-border bg-white text-muted hover:border-blue-300",
                  )}
                >
                  Принять сейчас
                </button>
                <button
                  type="button"
                  onClick={() => setPayNow(false)}
                  className={cn(
                    "flex-1 rounded-[8px] border px-2 py-1.5 text-[11px] font-semibold transition-colors",
                    !payNow
                      ? "border-amber-500 bg-amber-50 text-amber-800"
                      : "border-border bg-white text-muted hover:border-amber-300",
                  )}
                >
                  Зафиксировать в долг
                </button>
              </div>
              {payNow && (
                <div className="flex gap-1.5">
                  {(["cash", "transfer"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={cn(
                        "flex-1 rounded-[6px] border px-2 py-1 text-[10px] font-semibold transition-colors",
                        method === m
                          ? "border-blue-500 bg-white text-blue-700"
                          : "border-border bg-white text-muted",
                      )}
                    >
                      {m === "cash" ? "Наличные" : "Перевод"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {totalDelta < 0 && (
            <div className="rounded-[10px] border border-green-200 bg-green-50/40 px-3 py-2 text-[11px] text-green-ink">
              Возврат {fmt(-totalDelta)} ₽ зачислится на депозит клиента —
              использует при следующей аренде или продлении.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-[12px] font-semibold text-muted hover:bg-border"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[12px] font-bold text-white transition-colors",
              saving
                ? "cursor-not-allowed bg-blue-200"
                : "bg-blue-600 hover:bg-blue-700",
            )}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
