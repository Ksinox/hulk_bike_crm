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

/**
 * Вычисляет «мобильный ли вьюпорт» с учётом поворота телефона.
 *
 * Раньше был просто max-width < breakpoint. Проблема: телефон в АЛЬБОМНОЙ
 * ориентации шире breakpoint (напр. 844px) → раскладка перекидывалась на
 * десктоп → менялось всё дерево компонентов (MobileApp → AppShell) →
 * РЕМАУНТ → терялось состояние («всё сбрасывалось» при повороте).
 *
 * Теперь телефон остаётся мобильным в обеих ориентациях: если устройство
 * тач (primary pointer coarse) и КОРОТКАЯ сторона экрана < breakpoint —
 * это телефон, держим мобильную раскладку. Узкие окна (любой указатель)
 * по-прежнему мобильные (max-width), десктоп с мышью — нет.
 */
function computeIsMobile(breakpoint: number): boolean {
  const forced = forcedMobile();
  if (forced !== null) return forced;
  if (typeof window === "undefined") return false;
  const w = window.innerWidth;
  if (w < breakpoint) return true;
  try {
    const coarse =
      window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    if (coarse && Math.min(w, window.innerHeight) < breakpoint) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    computeIsMobile(breakpoint),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsMobile(computeIsMobile(breakpoint));
    update(); // синхронизируем после первого рендера
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [breakpoint]);

  return isMobile;
}
