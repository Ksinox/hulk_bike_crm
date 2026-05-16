/**
 * EquipmentInlinePicker — общий inline-popover для замены/добавления
 * экипировки. Изначально извлечён из MasterBlock.tsx (v0.6.16
 * EquipmentSwapPopover) — теперь переиспользуется и в
 * PaymentAcceptDialog Step 3 (v0.6.12+).
 *
 * Дизайн (rental-card.jsx + pickers.jsx):
 *   • Заголовок «Заменить «X»» / «Добавить экипировку»
 *   • Поиск по каталогу
 *   • Сетка квадратных тайлов (аватарка + подпись) — как в карточке
 *   • При наведении на тайл — плашка «Доплатить за N дн X ₽»
 *   • Footer: [Убрать (если заменяем)] · [Отмена] [Подтвердить]
 *
 * Preview-режим: setPendingItem(тайл) — родитель показывает мерцающую
 * позицию в карточке. При [Подтвердить] вызывается equipmentChangeAsync.
 *
 * replacingIdx === -1 → add-режим.
 *
 * Позиционирование: компонент использует `absolute left-0 top-full`,
 * поэтому контейнер-родитель должен быть `relative`.
 */
import { useEffect, useRef, useState } from "react";
import { Package, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiEquipment } from "@/lib/api/equipment";
import { fileUrl } from "@/lib/files";
import { toast } from "@/lib/toast";
import { equipmentChangeAsync } from "@/pages/rentals/rentalsStore";
import type { Rental } from "@/lib/mock/rentals";

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "0";
  return n.toLocaleString("ru-RU");
}

/**
 * Миниатюра экипировки внутри 2×2 grid карточки.
 * Если у элемента нет itemId или картинки — показываем иконку Package.
 */
export function EquipmentThumb({
  item,
}: {
  item: { itemId?: number | null; name: string; free: boolean };
}) {
  const { data: catalog = [] } = useApiEquipment();
  const cat = item.itemId
    ? catalog.find((c) => c.id === item.itemId)
    : null;
  const src = fileUrl(cat?.avatarThumbKey ?? cat?.avatarKey ?? null, {
    variant: "view",
  });
  if (src) {
    return (
      <img
        src={src}
        alt={item.name}
        className="h-full w-full object-contain"
      />
    );
  }
  return (
    <div
      className={cn(
        "h-full w-full flex items-center justify-center",
        item.free ? "text-green-ink/60" : "text-blue-700/60",
      )}
    >
      <Package size={40} strokeWidth={1.5} />
    </div>
  );
}

export function EquipmentInlinePicker({
  rental,
  replacingIdx,
  onClose,
  onPreviewChange,
}: {
  rental: Rental;
  replacingIdx: number;
  onClose: () => void;
  onPreviewChange?: (
    item: { itemId: number | null; name: string; price: number; free: boolean } | null,
  ) => void;
}) {
  const equipment = rental.equipmentJson ?? [];
  const replacing = replacingIdx >= 0 ? equipment[replacingIdx] : null;
  const isAddMode = replacingIdx === -1;
  const { data: catalog = [] } = useApiEquipment();
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  // ESC + клик мимо закрывают
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (e.target instanceof Node && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", onDocClick);
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDocClick);
    };
  }, [onClose]);

  // оставшиеся дни до конца аренды — для расчёта доплаты.
  const daysRemaining = (() => {
    const m = rental.endPlanned.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return 0;
    const end = new Date(+m[3], +m[2] - 1, +m[1]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((end.getTime() - today.getTime()) / 86400000);
    return Math.max(0, diff);
  })();
  const isLiveRental =
    rental.status === "active" || rental.status === "overdue";
  const canCharge = isLiveRental && daysRemaining > 0;

  const items = catalog.filter(
    (c) =>
      c.name.toLowerCase().includes(filter.toLowerCase()) &&
      (isAddMode || c.id !== replacing?.itemId),
  );

  const previewItem = (() => {
    if (pendingId == null) return null;
    const cat = catalog.find((c) => c.id === pendingId);
    if (!cat) return null;
    return {
      itemId: cat.id,
      name: cat.name,
      price: cat.price,
      free: cat.isFree,
    };
  })();

  // Уведомляем родителя об изменении preview.
  useEffect(() => {
    onPreviewChange?.(previewItem);
    return () => onPreviewChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId]);

  const hoverItem = (() => {
    if (hoverId == null) return null;
    return catalog.find((c) => c.id === hoverId) ?? null;
  })();

  // Расчёт «доплатить за оставшиеся дни» — если позиция платная и live
  // аренда. При замене вычитаем старую стоимость (delta), при добавлении —
  // полная стоимость.
  const calcDoplata = (
    target: { price: number; isFree: boolean } | null,
  ): number => {
    if (!target || target.isFree || !canCharge) return 0;
    const newPrice = target.price;
    const oldPrice =
      !isAddMode && replacing && !replacing.free ? replacing.price : 0;
    const delta = Math.max(0, newPrice - oldPrice);
    return delta * daysRemaining;
  };

  const previewDoplata = calcDoplata(
    previewItem ? { price: previewItem.price, isFree: previewItem.free } : null,
  );
  const hoverDoplata = calcDoplata(hoverItem);

  const confirm = async () => {
    if (saving || !previewItem) return;
    setSaving(true);
    try {
      const newJson = isAddMode
        ? [
            ...equipment.map((e) => ({
              itemId: e.itemId ?? null,
              name: e.name,
              price: e.price,
              free: e.free,
            })),
            previewItem,
          ]
        : equipment.map((e, i) =>
            i === replacingIdx
              ? previewItem
              : {
                  itemId: e.itemId ?? null,
                  name: e.name,
                  price: e.price,
                  free: e.free,
                },
          );
      await equipmentChangeAsync({
        rentalId: rental.id,
        newEquipmentJson: newJson,
        // payNow=true когда есть остаток дней и позиция платная —
        // оператор сразу принимает деньги. Иначе через manual_charge.
        payNow: previewDoplata > 0,
      });
      toast.success(isAddMode ? "Позиция добавлена" : "Экипировка заменена", "");
      onClose();
    } catch (e) {
      toast.error("Не удалось изменить", (e as Error).message ?? "");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (saving || isAddMode) return;
    setSaving(true);
    try {
      const next = equipment
        .filter((_, i) => i !== replacingIdx)
        .map((e) => ({
          itemId: e.itemId ?? null,
          name: e.name,
          price: e.price,
          free: e.free,
        }));
      await equipmentChangeAsync({
        rentalId: rental.id,
        newEquipmentJson: next,
        payNow: false,
      });
      toast.success("Позиция убрана", "");
      onClose();
    } catch (e) {
      toast.error("Не удалось убрать", (e as Error).message ?? "");
    } finally {
      setSaving(false);
    }
  };

  if (!isAddMode && !replacing) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={isAddMode ? "Добавить экипировку" : `Заменить ${replacing?.name}`}
      className="absolute left-0 top-full z-50 mt-1.5 w-[340px] rounded-2xl border border-border bg-surface shadow-card-lg overflow-hidden animate-fade-in"
    >
      <div className="border-b border-border px-3 pt-3 pb-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2 truncate">
              {isAddMode ? "Добавить экипировку" : `Заменить «${replacing?.name}»`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface-soft hover:text-ink"
            aria-label="Закрыть"
          >
            <X size={12} />
          </button>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
          placeholder="Найти…"
          className="mt-2 h-8 w-full rounded-[8px] border border-border bg-white px-2.5 text-[12px] text-ink outline-none focus:border-blue-600"
        />
      </div>
      {/* hover-плашка с расчётом */}
      {hoverItem && hoverDoplata > 0 && (
        <div className="border-b border-border bg-blue-50 px-3 py-1.5 text-[11px] text-blue-700">
          Доплатить за оставшиеся {daysRemaining} дн:{" "}
          <span className="font-bold tabular-nums">{fmt(hoverDoplata)} ₽</span>
        </div>
      )}
      <div className="max-h-[280px] overflow-y-auto scrollbar-thin px-2 py-2">
        {items.length === 0 && (
          <div className="px-3 py-4 text-center text-[12px] text-muted-2">
            Ничего не найдено
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {items.map((it) => {
            const isPending = pendingId === it.id;
            const src = fileUrl(it.avatarThumbKey ?? it.avatarKey ?? null, {
              variant: "view",
            });
            return (
              <button
                key={it.id}
                type="button"
                disabled={saving}
                onClick={() => setPendingId(it.id)}
                onMouseEnter={() => setHoverId(it.id)}
                onMouseLeave={() => setHoverId((v) => (v === it.id ? null : v))}
                className={cn(
                  "relative flex flex-col items-center disabled:opacity-50 group",
                )}
                title={it.name}
              >
                <div
                  className={cn(
                    "w-full aspect-square rounded-[10px] border-2 p-1.5 flex items-center justify-center transition-colors",
                    it.isFree
                      ? "border-green/60 bg-green-soft/40 group-hover:bg-green-soft"
                      : "border-blue-200 bg-blue-50 group-hover:bg-blue-100",
                    isPending &&
                      (it.isFree
                        ? "ring-2 ring-green ring-offset-1"
                        : "ring-2 ring-blue-600 ring-offset-1"),
                  )}
                >
                  {src ? (
                    <img
                      src={src}
                      alt={it.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Package
                      size={26}
                      strokeWidth={1.5}
                      className={
                        it.isFree ? "text-green-ink/60" : "text-blue-700/60"
                      }
                    />
                  )}
                  {!it.isFree && it.price > 0 && (
                    <span className="absolute top-0.5 right-0.5 rounded-full bg-blue-600 text-white px-1 py-0.5 text-[8.5px] font-bold tabular-nums">
                      +{it.price}
                    </span>
                  )}
                  {it.isFree && (
                    <span className="absolute top-0.5 right-0.5 rounded-full bg-green text-white px-1 py-0.5 text-[8.5px] font-bold">
                      free
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "mt-1 text-[9.5px] font-semibold text-center leading-tight px-0.5 break-words w-full",
                    it.isFree ? "text-green-ink" : "text-blue-700",
                  )}
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {it.name}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="border-t border-border bg-surface-soft px-3 py-2 flex items-center justify-between gap-2">
        {!isAddMode ? (
          <button
            type="button"
            onClick={handleRemove}
            disabled={saving}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-ink hover:underline disabled:opacity-50"
          >
            <Trash2 size={11} /> Убрать
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1.5">
          {previewItem && previewDoplata > 0 && (
            <span className="text-[10.5px] font-semibold text-blue-700 tabular-nums">
              +{fmt(previewDoplata)} ₽
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-[8px] bg-surface border border-border px-2.5 py-1 text-[11px] font-semibold text-ink-2 hover:bg-surface-soft disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={saving || !previewItem}
            className="rounded-[8px] bg-blue-600 text-white px-3 py-1 text-[11px] font-bold hover:bg-blue-700 disabled:opacity-50"
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
}
