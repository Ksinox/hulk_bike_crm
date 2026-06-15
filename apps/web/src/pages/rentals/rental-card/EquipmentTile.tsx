/**
 * EquipmentTile / EquipmentAddTile — ЕДИНЫЙ компонент тайла экипировки.
 *
 * v0.8.32 (J3): раньше один и тот же тайл был трижды скопирован вручную
 * (MasterBlock: компактная 60px-сетка и 72px-сетка; PaymentAcceptDialog:
 * шаг «Экипировка»). Любая правка стиля приходилось дублировать в 3
 * местах. Теперь — один источник истины: меняем тут → применяется везде.
 *
 * Состояние выбора/наведения/preview живёт в родителе (swapIdx, hoverEqIdx,
 * pendingItem) — тайл его только отображает и дёргает колбэки. Открытый
 * тайл рендерит общий EquipmentInlinePicker под собой.
 *
 * size: "sm" (60px, карточка компактная) | "md" (72px, остальное).
 */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Repeat, Plus, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EquipmentInlinePicker, EquipmentThumb } from "./EquipmentInlinePicker";
import type { Rental } from "@/lib/mock/rentals";

// R11: позиция ущерба по этой экипировке (название + сумма).
export type TileDamageItem = {
  name: string;
  finalPrice: number;
  quantity?: number;
};

const rub = (n: number) => n.toLocaleString("ru-RU");

// Элемент для ОТОБРАЖЕНИЯ тайла (itemId может отсутствовать у легаси-записей).
type EquipItem = {
  itemId?: number | null;
  name: string;
  price: number;
  free: boolean;
};

// Элемент preview из EquipmentInlinePicker — itemId всегда задан (null для
// беспредметных). Совпадает с типом setPendingItem в родителях.
type PreviewItem = {
  itemId: number | null;
  name: string;
  price: number;
  free: boolean;
};

type TileSize = "sm" | "md";

const SIZE = {
  sm: { box: "h-[60px]", thumb: "h-10 w-10", pad: "p-1.5", plus: 20 },
  md: { box: "h-[72px]", thumb: "h-12 w-12", pad: "p-2", plus: 22 },
} as const;

function PriceBadge({ item }: { item: EquipItem }) {
  if (item.free) {
    return (
      <span className="absolute right-0.5 top-0.5 rounded-full bg-green px-1 py-0 text-[8.5px] font-bold tabular-nums text-white shadow-card-sm">
        free
      </span>
    );
  }
  if (item.price > 0) {
    return (
      <span className="absolute right-0.5 top-0.5 rounded-full bg-blue-600 px-1 py-0 text-[8.5px] font-bold tabular-nums text-white shadow-card-sm">
        +{item.price}
      </span>
    );
  }
  return null;
}

function TileLabel({ text }: { text: string }) {
  return (
    <div
      className="mt-1 w-full break-words px-0.5 text-center text-[10px] font-bold leading-tight text-ink-2"
      style={{
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}
    >
      {text}
    </div>
  );
}

export function EquipmentTile({
  rental,
  item,
  idx,
  size = "md",
  canSwap,
  isOpen,
  isHover,
  showingPending,
  wrapperClassName,
  onHover,
  onToggleOpen,
  onClose,
  onPreviewChange,
  localEquipment,
  onLocalChange,
  damageItems = [],
}: {
  rental: Rental;
  item: EquipItem;
  idx: number;
  size?: TileSize;
  canSwap: boolean;
  isOpen: boolean;
  isHover: boolean;
  showingPending: boolean;
  wrapperClassName?: string;
  onHover: (idx: number | null) => void;
  onToggleOpen: (idx: number | null) => void;
  onClose: () => void;
  onPreviewChange: (item: PreviewItem | null) => void;
  // #177: local-mode (PaymentAcceptDialog «экипировка на новый период») —
  // когда заданы, picker редактирует этот набор через колбэк, без мутации
  // аренды/equipmentChangeAsync. Не заданы — обычный режим (карточка аренды).
  localEquipment?: EquipItem[];
  onLocalChange?: (next: EquipItem[]) => void;
  // R11: позиции ущерба, сопоставленные этой экипировке по названию. Когда
  // не пусто — на тайле жёлтый значок ⚠, по наведению — поповер «что сломано».
  damageItems?: TileDamageItem[];
}) {
  const s = SIZE[size];
  const hasDamage = damageItems.length > 0;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dmgPos, setDmgPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const showDmg = () => {
    if (!hasDamage) return;
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) {
      const vw = window.innerWidth;
      setDmgPos({
        top: r.bottom + 6,
        left: Math.max(8, Math.min(r.left - 90, vw - 300)),
      });
    }
  };
  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative flex flex-col items-center",
        wrapperClassName,
        showingPending && "animate-pulse opacity-80",
      )}
      onMouseEnter={() => {
        if (canSwap) onHover(idx);
        showDmg();
      }}
      onMouseLeave={() => {
        onHover(null);
        setDmgPos(null);
      }}
    >
      {/* R11: поповер «что повреждено по этой экипировке» (порталом). */}
      {hasDamage &&
        dmgPos &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: dmgPos.top,
              left: dmgPos.left,
              minWidth: 220,
              maxWidth: 300,
              zIndex: 1000,
            }}
            className="pointer-events-none rounded-xl border border-amber-200 bg-surface p-3 shadow-card-lg"
          >
            <div className="mb-1.5 inline-flex items-center gap-1.5 text-[12px] font-bold text-amber-800">
              <AlertTriangle size={13} /> Повреждения · {item.name}
            </div>
            <div className="flex flex-col gap-1">
              {damageItems.map((d, i) => (
                <div
                  key={`${d.name}-${i}`}
                  className="flex items-center justify-between gap-2 text-[12px]"
                >
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {d.name}
                    {(d.quantity ?? 1) > 1 ? ` ×${d.quantity}` : ""}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-ink">
                    {rub(d.finalPrice * (d.quantity ?? 1))} ₽
                  </span>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
      <button
        type="button"
        onClick={() => {
          if (!canSwap) return;
          onToggleOpen(isOpen ? null : idx);
        }}
        disabled={!canSwap}
        className={cn(
          // нейтральный тайл — без зелёной/синей рамки и фона; подсветка
          // только при наведении/выборе.
          "relative flex w-full items-center justify-center rounded-[12px] border transition-colors",
          s.box,
          s.pad,
          "border-border bg-surface",
          isHover && !isOpen && "border-blue-300 bg-surface-soft/60",
          isOpen && "border-blue-400 ring-2 ring-blue-200 ring-offset-1",
          canSwap ? "cursor-pointer" : "cursor-default",
        )}
        title={canSwap ? "Заменить или убрать" : item.name}
      >
        <span className={cn("flex shrink-0 items-center justify-center", s.thumb)}>
          <EquipmentThumb item={item} />
        </span>
        <PriceBadge item={item} />
        {/* R11: значок «есть повреждение по акту» — жёлтый ⚠ слева сверху. */}
        {hasDamage && (
          <span className="pointer-events-none absolute left-0.5 top-0.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-amber-500 text-white shadow-card-sm ring-2 ring-amber-50">
            <AlertTriangle size={10} strokeWidth={2.4} />
          </span>
        )}
        {/* hover → иконка Repeat в правом нижнем углу */}
        {canSwap && isHover && !isOpen && (
          <span className="pointer-events-none absolute bottom-0.5 right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow-card-sm">
            <Repeat size={11} />
          </span>
        )}
      </button>
      <TileLabel text={item.name} />
      {isOpen && (
        <EquipmentInlinePicker
          rental={rental}
          replacingIdx={idx}
          onClose={onClose}
          onPreviewChange={onPreviewChange}
          localEquipment={localEquipment}
          onLocalChange={onLocalChange}
        />
      )}
    </div>
  );
}

export function EquipmentAddTile({
  rental,
  size = "md",
  isOpen,
  pendingItem,
  wrapperClassName,
  onToggleOpen,
  onClose,
  onPreviewChange,
  localEquipment,
  onLocalChange,
}: {
  rental: Rental;
  size?: TileSize;
  isOpen: boolean;
  pendingItem: PreviewItem | null;
  wrapperClassName?: string;
  onToggleOpen: (open: boolean) => void;
  onClose: () => void;
  onPreviewChange: (item: PreviewItem | null) => void;
  // #177: см. EquipmentTile — local-mode для «экипировки на новый период».
  localEquipment?: EquipItem[];
  onLocalChange?: (next: EquipItem[]) => void;
}) {
  const s = SIZE[size];
  const showPending = isOpen && pendingItem != null;
  return (
    <div
      className={cn(
        "relative flex flex-col items-center",
        wrapperClassName,
        showPending && "animate-pulse opacity-80",
      )}
    >
      <button
        type="button"
        onClick={() => onToggleOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-center rounded-[12px] border-2 transition-colors",
          s.box,
          s.pad,
          showPending
            ? "border-border bg-surface-soft"
            : "border-dashed border-border text-muted-2 hover:border-blue-600 hover:bg-blue-50 hover:text-blue-700",
          isOpen &&
            !pendingItem &&
            "border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-200 ring-offset-1",
        )}
        title="Добавить экипировку"
      >
        {showPending && pendingItem ? (
          <span className={cn("flex shrink-0 items-center justify-center", s.thumb)}>
            <EquipmentThumb
              item={{
                itemId: pendingItem.itemId,
                name: pendingItem.name,
                free: pendingItem.free,
              }}
            />
          </span>
        ) : (
          <Plus size={s.plus} strokeWidth={2} />
        )}
      </button>
      <TileLabel text={showPending && pendingItem ? pendingItem.name : "Добавить"} />
      {isOpen && (
        <EquipmentInlinePicker
          rental={rental}
          replacingIdx={-1}
          onClose={onClose}
          onPreviewChange={onPreviewChange}
          localEquipment={localEquipment}
          onLocalChange={onLocalChange}
        />
      )}
    </div>
  );
}
