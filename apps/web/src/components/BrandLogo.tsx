import logoUrl from "@/assets/hulk-logo.png";
import { cn } from "@/lib/utils";

/**
 * Логотип «Халк Байк» (15.09) — настоящий, прислан заказчиком, вместо
 * заглушки «H в круге». Картинку подключаем через сборку, а не из public:
 * так путь верный и в браузере, и в десктопном приложении.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="Халк Байк"
      draggable={false}
      className={cn("block shrink-0 select-none object-cover", className)}
    />
  );
}
