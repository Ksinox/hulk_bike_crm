import { useLayoutEffect, useRef } from "react";

/**
 * FLIP-анимация перестановки плиток (06.09, вечерняя правка).
 *
 * Заказчик просил «как в Notion»: тянешь плитку — соседние расступаются,
 * видно, куда она сядет. Для этого запоминаем положение каждой плитки до
 * перерисовки, после перерисовки считаем сдвиг, мгновенно возвращаем
 * плитку на старое место трансформом и тут же отпускаем — браузер
 * доезжает сам. Меняется только transform, поэтому анимация идёт на
 * композиторе и не дёргает раскладку.
 *
 * @param key строка-отпечаток порядка и размеров: меняется — анимируем.
 */
export function useFlip(
  container: React.RefObject<HTMLElement | null>,
  key: string,
  enabled = true,
) {
  const prev = useRef<Map<string, DOMRect>>(new Map());
  const lastKey = useRef(key);

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const nodes = [...root.querySelectorAll<HTMLElement>("[data-flip-key]")];
    const next = new Map<string, DOMRect>();
    for (const n of nodes) {
      next.set(n.dataset.flipKey!, n.getBoundingClientRect());
    }

    if (enabled && lastKey.current !== key) {
      for (const n of nodes) {
        const id = n.dataset.flipKey!;
        const before = prev.current.get(id);
        const after = next.get(id);
        if (!before || !after) continue;
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        n.style.transition = "none";
        n.style.transform = `translate(${dx}px, ${dy}px)`;
        // Следующий кадр — снимаем сдвиг, браузер доводит плитку сам.
        requestAnimationFrame(() => {
          n.style.transition = "transform 260ms cubic-bezier(0.22,1,0.36,1)";
          n.style.transform = "";
          window.setTimeout(() => {
            n.style.transition = "";
          }, 300);
        });
      }
    }

    prev.current = next;
    lastKey.current = key;
  }, [container, key, enabled]);
}
