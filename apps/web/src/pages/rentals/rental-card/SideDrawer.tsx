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
 *  • v0.6.1: добавлены slide-in/out + fade анимации overlay и panel.
 *    При close сначала идёт reverse-анимация (~200ms), потом onClose.
 */
import { useEffect, useState, type ReactNode } from "react";
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
  // v0.6.1: localOpen позволяет смонтировать узел при open=true и
  // отложить демонтаж до завершения slide-out.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      // Запустить reverse-анимацию и снять с монтажа после неё.
      setClosing(true);
      const t = window.setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 220);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open, mounted]);

  const requestClose = () => {
    if (closing) return;
    onClose();
  };

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  if (!mounted) return null;
  const w = Math.min(width, typeof window === "undefined" ? width : window.innerWidth * 0.95);

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={requestClose}
        className={cn(
          "absolute inset-0 bg-ink/30 backdrop-blur-[1px]",
          closing ? "animate-fade-out" : "animate-fade-in",
        )}
      />
      <aside
        className={cn(
          "absolute right-0 top-0 h-full bg-surface shadow-card-lg flex flex-col",
          closing ? "animate-slide-out-right" : "animate-slide-in-right",
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
            onClick={requestClose}
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
