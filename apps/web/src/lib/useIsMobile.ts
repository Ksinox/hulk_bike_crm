import { useEffect, useState } from "react";

/**
 * Определяет мобильный вьюпорт (ширина < `breakpoint`px).
 *
 * Используется на уровне App для ветвления десктоп/мобайл-слоя:
 * на узких экранах рендерится отдельная мобильная оболочка (MobileApp),
 * десктоп-путь при этом не меняется. Брейкпоинт по умолчанию — 768px
 * (Tailwind `md`): телефоны и узкие окна получают мобильную раскладку,
 * планшеты в альбомной/десктоп — обычную.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // Синхронизируем сразу — на случай если значение успело измениться
    // между первым рендером и подпиской.
    setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return isMobile;
}
