import { progressItems } from "@/data/progress";

/**
 * Сколько пунктов «Развития» изменилось с последнего просмотра.
 *
 * Отдельная лёгкая функция без React-состояния: сайдбару нужно только
 * число, чтобы зажечь точку у раздела (правка 31.08). Считаем на месте —
 * список пунктов статический, а отметки лежат в localStorage.
 */
export function countFreshProgress(): number {
  let seen: Record<string, string> = {};
  try {
    const raw = localStorage.getItem("hulk-progress-seen");
    if (raw) seen = JSON.parse(raw) as Record<string, string>;
  } catch {
    seen = {};
  }
  return progressItems.filter(
    (i) => i.updatedAt && (!seen[i.id] || seen[i.id]! < i.updatedAt),
  ).length;
}
