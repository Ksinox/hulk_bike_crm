/**
 * SideDrawer — простой выезжающий справа Sheet для подэкранов карточки
 * аренды v0.6 (история, история долгов, профиль клиента).
 *
 * Особенности:
 *  • Закрывается по ESC и клику на полупрозрачный overlay.
 *  • НЕ блокирует карточку под собой — оператор продолжает видеть
 *    основную информацию краем экрана через overlay (bg-ink/30).
 *  • z-index подбирается так чтобы быть НИЖЕ dialog'ов
 *    (PaymentAcceptDialog и т.п. — у них z-[100]+).
 */
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function SideDrawer({
  open,
  onClose,
  title,
  subtitle,
  width = 520,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Ширина drawer'а в пикселях (max 95vw). По умолчанию 520. */
  width?: number;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const w = Math.min(width, typeof window === "undefined" ? width : window.innerWidth * 0.95);

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]"
      />
      <aside
        className={cn(
          "absolute right-0 top-0 h-full bg-surface shadow-card-lg flex flex-col",
        )}
        style={{ width: w }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="font-display text-[16px] font-extrabold text-ink leading-tight truncate">
              {title}
            </div>
            {subtitle && (
              <div className="mt-0.5 text-[11.5px] text-muted truncate">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 shrink-0 rounded-full bg-surface-soft hover:bg-border text-muted hover:text-ink flex items-center justify-center"
            title="Закрыть (Esc)"
          >
            <X size={15} />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}
