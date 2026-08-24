import { Bike, Fuel, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Тип техники — электро или бензин (пункты 11, 12, 14).
 *
 * Правка заказчика 24.08: никаких эмодзи, только иконки; отметка электро
 * должна СРАЗУ бросаться в глаза среди бензиновых строк, а не теряться
 * мелким «е-». Поэтому у электро — молния в цветном кружке, у бензина —
 * канистра приглушённым цветом (по умолчанию бензин вообще не помечаем,
 * помечаем только там, где нужен явный выбор между типами).
 */

/** Компактная отметка «электро» для строк списка (аренды, карточки). */
export function ElectricMark({
  size = "md",
  withText = false,
  className,
}: {
  size?: "sm" | "md" | "lg";
  /** Добавить слово «электро» — для мест, где есть место под текст. */
  withText?: boolean;
  className?: string;
}) {
  const box =
    size === "lg" ? "h-7 w-7" : size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const icon = size === "lg" ? 16 : size === "sm" ? 11 : 14;
  return (
    <span
      title="Электротранспорт"
      className={cn("inline-flex items-center gap-1.5 align-middle", className)}
    >
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_0_3px_rgba(16,185,129,0.16)]",
          box,
        )}
      >
        <Zap size={icon} strokeWidth={2.6} className="fill-white" />
      </span>
      {withText && (
        <span className="text-[11.5px] font-bold uppercase tracking-wide text-emerald-700">
          электро
        </span>
      )}
    </span>
  );
}

/** Отметка «бензин» — там, где два типа показываются рядом. */
export function PetrolMark({
  size = "md",
  withText = false,
  className,
}: {
  size?: "sm" | "md" | "lg";
  withText?: boolean;
  className?: string;
}) {
  const box =
    size === "lg" ? "h-7 w-7" : size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const icon = size === "lg" ? 15 : size === "sm" ? 11 : 13;
  return (
    <span
      title="Бензиновый скутер"
      className={cn("inline-flex items-center gap-1.5 align-middle", className)}
    >
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-surface-soft text-muted",
          box,
        )}
      >
        <Fuel size={icon} strokeWidth={2.2} />
      </span>
      {withText && (
        <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">
          бензин
        </span>
      )}
    </span>
  );
}

/**
 * Крупная пара «скутер + тип» для выбора категории в анкете клиента
 * (пункт 12): скутер с канистрой = бензин, скутер с молнией = электро.
 * Клиент видит именно технику, а не слово «бензин» само по себе.
 */
export function PowerTypeGlyph({
  electric,
  active,
}: {
  electric: boolean;
  active: boolean;
}) {
  return (
    <span className="relative inline-flex items-center justify-center">
      <Bike
        size={30}
        strokeWidth={1.9}
        className={active ? "text-white" : "text-slate-500"}
      />
      <span
        className={cn(
          "absolute -bottom-1 -right-1.5 inline-flex h-[19px] w-[19px] items-center justify-center rounded-full",
          electric
            ? active
              ? "bg-emerald-400 text-slate-900"
              : "bg-emerald-500 text-white"
            : active
              ? "bg-white text-slate-900"
              : "bg-slate-200 text-slate-700",
        )}
      >
        {electric ? (
          <Zap size={11} strokeWidth={3} className="fill-current" />
        ) : (
          <Fuel size={11} strokeWidth={2.6} />
        )}
      </span>
    </span>
  );
}
