import { useEffect } from "react";

/**
 * v0.9.2: глобальное поведение number-инпутов во всей CRM.
 *
 * Нативные стрелки-спиннеры убраны в CSS (index.css). Здесь — шаг значения
 * колёсиком мыши ПРИ НАВЕДЕНИИ: навёл на поле суммы/количества и крутишь
 * колесо → значение меняется на `step` (по умолчанию 1), страница при этом
 * не прокручивается. Клавиши ↑/↓ и ввод с нампада работают нативно на
 * сфокусированном поле (после клика).
 *
 * Значение проставляется через нативный value-сеттер + input-событие, чтобы
 * onChange контролируемого React-инпута корректно отработал.
 */
export function useGlobalNumberWheelStep() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      const input = (target?.closest?.('input[type="number"]') ??
        null) as HTMLInputElement | null;
      if (!input || input.disabled || input.readOnly) return;
      e.preventDefault();
      const step = Number(input.step) > 0 ? Number(input.step) : 1;
      const dir = e.deltaY < 0 ? 1 : -1;
      const cur = Number(input.value) || 0;
      let next = cur + dir * step;
      const min = input.min !== "" ? Number(input.min) : null;
      const max = input.max !== "" ? Number(input.max) : null;
      if (min !== null && Number.isFinite(min)) next = Math.max(min, next);
      if (max !== null && Number.isFinite(max)) next = Math.min(max, next);
      if (next === cur) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!setter) return;
      setter.call(input, String(next));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    // passive:false — нужно preventDefault, чтобы колесо над полем меняло
    // значение, а не скроллило страницу.
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);
}
