import type { ReactNode, MouseEvent } from "react";
import { EyeOff, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { hideSensitive, revealSensitive, useSensitiveRevealed } from "@/lib/sensitive";

/**
 * Размытое число (06.09, п.11): прибыль / закуп видны только после ключа
 * директора. Клик по размытому — запрос ключа. Содержимое остаётся тем же,
 * меняется только вид, поэтому вёрстка не прыгает.
 */
export function Sensitive({
  children,
  className,
  block,
}: {
  children: ReactNode;
  className?: string;
  /** Блочный контейнер (плитка целиком), а не строчный кусочек текста. */
  block?: boolean;
}) {
  const revealed = useSensitiveRevealed();
  if (revealed) return <>{children}</>;
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void revealSensitive();
  };
  return (
    <span
      role="button"
      tabIndex={0}
      title="Только директор: нажмите, чтобы показать (ключ директора)"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void revealSensitive();
        }
      }}
      className={cn(
        "cursor-pointer select-none blur-[6px] transition-[filter] hover:blur-[4px] [&_*]:pointer-events-none",
        block ? "block" : "inline-block",
        className,
      )}
      aria-label="Скрыто — доступно директору по ключу"
    >
      {children}
    </span>
  );
}

/** Кнопка в шапке: показать / скрыть прибыль и закуп. */
export function SensitiveToggle({ className }: { className?: string }) {
  const revealed = useSensitiveRevealed();
  return (
    <button
      type="button"
      onClick={() => (revealed ? hideSensitive() : void revealSensitive())}
      title={
        revealed
          ? "Скрыть прибыль и закупочную стоимость"
          : "Показать прибыль и закуп — только директор, по ключу"
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-bold transition-colors",
        revealed
          ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
          : "bg-surface text-muted shadow-card-sm hover:text-ink",
        className,
      )}
    >
      {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
      {revealed ? "Скрыть прибыль" : "Прибыль скрыта"}
    </button>
  );
}
