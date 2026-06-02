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
/**
 * Тест-оверрайд: позволяет принудительно включить мобильную раскладку на
 * любом экране. Удобно проверять адаптив с десктопа без реального телефона.
 * Включение: `localStorage.setItem('hulk-force-mobile','1')` или `?mobile=1`
 * в URL (then reload). Выключение: убрать ключ / `?mobile=0`.
 */
function forcedMobile(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("mobile");
    if (q === "1") {
      localStorage.setItem("hulk-force-mobile", "1");
      return true;
    }
    if (q === "0") {
      localStorage.removeItem("hulk-force-mobile");
      return false;
    }
    if (localStorage.getItem("hulk-force-mobile") === "1") return true;
  } catch {
    /* ignore */
  }
  return null;
}

export function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    const forced = forcedMobile();
    if (forced !== null) return forced;
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const forced = forcedMobile();
    if (forced !== null) {
      setIsMobile(forced);
      return;
    }
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
