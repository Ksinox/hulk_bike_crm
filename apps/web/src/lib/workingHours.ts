/**
 * v0.4.21 — график работы магазина (часы открытия/закрытия).
 *
 * Используется в почасовой шкале графика выручки в режиме «День»
 * (от open до close). Настраивается в /settings.
 *
 * По образу lib/billingPeriod: пара функций setWorkingHours /
 * getWorkingHours, app-settings hook прокидывает значения в runtime.
 */

const DEFAULT_START = 9;
const DEFAULT_END = 22;

let runtimeStart = DEFAULT_START;
let runtimeEnd = DEFAULT_END;

export function setWorkingHours(startHour: number, endHour: number): void {
  if (
    Number.isFinite(startHour) &&
    Number.isFinite(endHour) &&
    startHour >= 0 &&
    startHour <= 23 &&
    endHour >= 1 &&
    endHour <= 24 &&
    endHour > startHour
  ) {
    runtimeStart = Math.floor(startHour);
    runtimeEnd = Math.floor(endHour);
  }
}

export function getWorkingHours(): { start: number; end: number } {
  return { start: runtimeStart, end: runtimeEnd };
}

/** Список часов в формате [9, 10, 11, ..., 21] (end эксклюзивно). */
export function workingHoursList(): number[] {
  const out: number[] = [];
  for (let h = runtimeStart; h < runtimeEnd; h++) out.push(h);
  return out;
}
