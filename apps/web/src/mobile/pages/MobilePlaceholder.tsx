import { Construction } from "lucide-react";
import type { RouteId } from "@/app/route";
import { routeTitle } from "../nav";

/**
 * Заглушка для разделов, мобильная версия которых ещё не сделана.
 * Честно сообщает статус вместо того чтобы показывать поломанную
 * десктоп-вёрстку на телефоне.
 */
export function MobilePlaceholder({ route }: { route: RouteId }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-muted shadow-card">
        <Construction size={28} />
      </div>
      <h2 className="mt-4 font-display text-[18px] font-bold text-ink">
        {routeTitle(route)}
      </h2>
      <p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-muted">
        Мобильная версия этого раздела скоро появится. Пока откройте его с
        компьютера.
      </p>
    </div>
  );
}
