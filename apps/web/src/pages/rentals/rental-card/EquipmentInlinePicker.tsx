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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
        className="h-full w-full bg-white object-contain"
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
  localEquipment,
  onLocalChange,
}: {
  rental: Rental;
  replacingIdx: number;
  onClose: () => void;
  onPreviewChange?: (
    item: { itemId: number | null; name: string; price: number; free: boolean } | null,
  ) => void;
  // #177: local-mode — редактируем ПЕРЕДАННЫЙ набор через колбэк, без мутации
  // аренды и equipmentChangeAsync. Используется в PaymentAcceptDialog
  // «экипировка на новый период»: стоимость (equip × дни продления) считает
  // сам диалог, picker лишь меняет состав. Обычный режим (карточка аренды) —
  // эти пропсы не заданы, работает старый equipmentChangeAsync-путь.
  localEquipment?: Array<{
    itemId?: number | null;
    name: string;
    price: number;
    free: boolean;
  }>;
  onLocalChange?: (
    next: Array<{
      itemId?: number | null;
      name: string;
      price: number;
      free: boolean;
    }>,
  ) => void;
}) {
  const localMode = !!onLocalChange;
  const equipment = localEquipment ?? rental.equipmentJson ?? [];
  const replacing = replacingIdx >= 0 ? equipment[replacingIdx] : null;
  const isAddMode = replacingIdx === -1;
  const { data: catalog = [] } = useApiEquipment();
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  // Правка 1: выбор «куда вернуть разницу» при удешевлении.
  // refundStep: какой возврат подтверждаем (replace/remove) + сколько.
  const [refundStep, setRefundStep] = useState<{
    amount: number;
    newJson: Array<{
      itemId: number | null;
      name: string;
      price: number;
      free: boolean;
    }>;
    kind: "replace" | "remove";
  } | null>(null);
  const [refundMethod, setRefundMethod] = useState<"cash" | "transfer" | null>(
    null,
  );
  const ref = useRef<HTMLDivElement | null>(null);
  // v0.6.53: «якорь» — приёмник позиции popover'а. Раньше popover
  // позиционировался как absolute внутри тайла-родителя; при близости
  // тайла к границе overflow:hidden родителя popover обрезался.
  // Теперь рендерим popover через React Portal в body, position:fixed.
  // anchorRef — невидимый span, который рендерим в исходной точке
  // (для совместимости со старым API: родитель просто рендерит
  // <EquipmentInlinePicker/> как сейчас, не передавая rect извне).
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const updatePos = () => {
      const el = anchorRef.current?.parentElement;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const popW = 340;
      const popH = 380;
      const gap = 6;
      let left = r.left;
      let top = r.bottom + gap;
      if (left + popW > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - popW - 8);
      }
      if (top + popH > window.innerHeight - 8) {
        top = Math.max(8, r.top - popH - gap);
      }
      setPos({ top, left });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, []);

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
    rental.status === "active" ||
    rental.status === "overdue" ||
    rental.status === "returning";
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

  // Подписанный totalDelta (может быть < 0 при удешевлении/удалении).
  // remainingDays здесь = daysRemaining (Math.max(0,…)).
  const signedTotalDelta = (() => {
    if (!previewItem || !canCharge) return 0;
    const newPrice = previewItem.free ? 0 : previewItem.price;
    const oldPrice =
      !isAddMode && replacing && !replacing.free ? replacing.price : 0;
    return (newPrice - oldPrice) * daysRemaining;
  })();

  const removeTotalDelta = (() => {
    if (isAddMode || !replacing || replacing.free || !canCharge) return 0;
    return -replacing.price * daysRemaining;
  })();

  const performChange = async (
    newJson: Array<{
      itemId: number | null;
      name: string;
      price: number;
      free: boolean;
    }>,
    opts: {
      payNow: boolean;
      refundTo?: "cash" | "deposit";
      refundMethod?: "cash" | "transfer";
    },
    okMsg: string,
    errMsg: string,
  ) => {
    setSaving(true);
    try {
      await equipmentChangeAsync({
        rentalId: rental.id,
        newEquipmentJson: newJson,
        payNow: opts.payNow,
        refundTo: opts.refundTo,
        refundMethod: opts.refundMethod,
      });
      toast.success(okMsg, "");
      onClose();
    } catch (e) {
      toast.error(errMsg, (e as Error).message ?? "");
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
    if (saving || !previewItem) return;
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
    // #177: local-mode — отдаём новый набор родителю и закрываемся. Никаких
    // финансовых операций: стоимость (equip × дни продления) посчитает и
    // соберёт PaymentAcceptDialog. Возврат/доплата здесь не нужны.
    if (localMode) {
      onLocalChange?.(newJson);
      onClose();
      return;
    }
    // Удешевление → спрашиваем, куда вернуть разницу.
    if (signedTotalDelta < 0) {
      setRefundStep({
        amount: -signedTotalDelta,
        newJson,
        kind: "replace",
      });
      return;
    }
    // #179: добавление/замена ПЛАТНОЙ экипировки на живой аренде. Раньше тут
    // был payNow=true БЕЗ способа оплаты → бэк падал «method required for
    // immediate payment». Теперь доплату за остаток текущего периода вешаем
    // ДОЛГОМ (payNow=false → manual_charge): оператор примет её через
    // «Принять оплату». Бесплатная/без доплаты — просто меняем набор.
    await performChange(
      newJson,
      { payNow: false },
      isAddMode
        ? previewDoplata > 0
          ? `Позиция добавлена · доплата ${fmt(previewDoplata)} ₽ в долг`
          : "Позиция добавлена"
        : previewDoplata > 0
          ? `Экипировка заменена · доплата ${fmt(previewDoplata)} ₽ в долг`
          : "Экипировка заменена",
      "Не удалось изменить",
    );
  };

  const handleRemove = async () => {
    if (saving || isAddMode) return;
    const next = equipment
      .filter((_, i) => i !== replacingIdx)
      .map((e) => ({
        itemId: e.itemId ?? null,
        name: e.name,
        price: e.price,
        free: e.free,
      }));
    // #177: local-mode — убираем позицию из набора нового периода локально.
    if (localMode) {
      onLocalChange?.(next);
      onClose();
      return;
    }
    // Удаление платной позиции → возврат, спрашиваем куда.
    if (removeTotalDelta < 0) {
      setRefundStep({
        amount: -removeTotalDelta,
        newJson: next,
        kind: "remove",
      });
      return;
    }
    await performChange(
      next,
      { payNow: false },
      "Позиция убрана",
      "Не удалось убрать",
    );
  };

  const submitRefund = async (refundTo: "cash" | "deposit") => {
    if (!refundStep || saving) return;
    await performChange(
      refundStep.newJson,
      {
        payNow: false,
        refundTo,
        refundMethod:
          refundTo === "cash" ? refundMethod ?? "cash" : undefined,
      },
      refundStep.kind === "remove" ? "Позиция убрана" : "Экипировка заменена",
      "Не удалось изменить",
    );
  };

  if (!isAddMode && !replacing) return null;

  // v0.6.53: невидимый «якорь» в исходной точке + portal в body.
  return (
    <>
      <span ref={anchorRef} aria-hidden style={{ display: "none" }} />
      {pos && createPortal(
        <div
          ref={ref}
          role="dialog"
          aria-label={isAddMode ? "Добавить экипировку" : `Заменить ${replacing?.name}`}
          className="fixed z-[100] w-[340px] rounded-2xl border border-border bg-surface shadow-card-lg overflow-hidden animate-fade-in"
          style={{ top: pos.top, left: pos.left }}
        >
      <div className="border-b border-border px-3 pt-3 pb-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2 truncate">
              {refundStep
                ? "Возврат за экипировку"
                : isAddMode
                  ? "Добавить экипировку"
                  : `Заменить «${replacing?.name}»`}
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
        {!refundStep && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
            placeholder="Найти…"
            className="mt-2 h-8 w-full rounded-[8px] border border-border bg-white px-2.5 text-[12px] text-ink outline-none focus:border-blue-600"
          />
        )}
      </div>
      {refundStep && (
        <div className="px-3 py-3">
          <div className="text-[12px] text-ink">
            Возврат{" "}
            <span className="font-bold tabular-nums">
              {fmt(refundStep.amount)} ₽
            </span>{" "}
            — куда?
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void submitRefund("deposit")}
              className="rounded-[10px] border-2 border-blue-200 bg-blue-50 px-2 py-2.5 text-[11.5px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              В депозит клиента
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                setRefundMethod((v) => (v == null ? "cash" : v))
              }
              className={cn(
                "rounded-[10px] border-2 px-2 py-2.5 text-[11.5px] font-semibold disabled:opacity-50",
                refundMethod != null
                  ? "border-green bg-green-soft/40 text-green-ink"
                  : "border-border bg-surface text-ink-2 hover:bg-surface-soft",
              )}
            >
              Вернуть налом
            </button>
          </div>
          {refundMethod != null && (
            <div className="mt-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-2">
                Способ выдачи
              </div>
              <div className="mt-1.5 flex gap-2">
                {(["cash", "transfer"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setRefundMethod(m)}
                    className={cn(
                      "flex-1 rounded-[8px] border px-2 py-1.5 text-[11px] font-semibold",
                      refundMethod === m
                        ? "border-green bg-green-soft/40 text-green-ink"
                        : "border-border bg-surface text-ink-2 hover:bg-surface-soft",
                    )}
                  >
                    {m === "cash" ? "Наличные" : "Перевод"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitRefund("cash")}
                className="mt-3 w-full rounded-[8px] bg-blue-600 text-white px-3 py-1.5 text-[11px] font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                Подтвердить возврат налом
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setRefundStep(null);
              setRefundMethod(null);
            }}
            className="mt-3 w-full rounded-[8px] bg-surface border border-border px-2.5 py-1.5 text-[11px] font-semibold text-ink-2 hover:bg-surface-soft disabled:opacity-50"
          >
            Назад
          </button>
        </div>
      )}
      {/* hover-плашка с расчётом. #177: в local-mode не показываем «за остаток
          текущего периода» — стоимость продления (× дни продления) считает
          диалог приёма платежа. */}
      {!refundStep && !localMode && hoverItem && hoverDoplata > 0 && (
        <div className="border-b border-border bg-blue-50 px-3 py-1.5 text-[11px] text-blue-700">
          Доплатить за оставшиеся {daysRemaining} дн:{" "}
          <span className="font-bold tabular-nums">{fmt(hoverDoplata)} ₽</span>
        </div>
      )}
      {!refundStep && (
      <>
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
                      className="h-full w-full rounded-[6px] bg-white object-contain"
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
          {!localMode && previewItem && previewDoplata > 0 && (
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
      </>
      )}
        </div>,
        document.body,
      )}
    </>
  );
}
