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
import { Repeat, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { EquipmentInlinePicker, EquipmentThumb } from "./EquipmentInlinePicker";
import type { Rental } from "@/lib/mock/rentals";

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
}) {
  const s = SIZE[size];
  return (
    <div
      className={cn(
        "relative flex flex-col items-center",
        wrapperClassName,
        showingPending && "animate-pulse opacity-80",
      )}
      onMouseEnter={() => canSwap && onHover(idx)}
      onMouseLeave={() => onHover(null)}
    >
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
