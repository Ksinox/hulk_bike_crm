/**
 * v0.7.22: режим отображения списка аренд — «Список» (плотная таблица по
 * столбцам) либо «Плитки» (сетка карточек). Предпочтение запоминается
 * ПЕР-ПОЛЬЗОВАТЕЛЬ: ключ localStorage включает id пользователя, поэтому
 * на одном компьютере у директора и у админа независимые настройки —
 * каждый при входе видит свой выбор.
 *
 * Позже эту же логику переключателя вида планируется переиспользовать
 * для Клиентов / Скутеров / Документов (см. договорённость с заказчиком).
 */
export type RentalsViewMode = "list" | "tiles";

// По умолчанию — «Список» (плотная таблица): так удобнее по запросу заказчика.
// Кто переключится на «Плитки» — выбор сохранится пер-пользователь в localStorage.
const DEFAULT_MODE: RentalsViewMode = "list";

function keyFor(userId: number | string | undefined): string {
  return `rentals_view_mode_${userId ?? "anon"}`;
}

export function loadRentalsViewMode(
  userId: number | string | undefined,
): RentalsViewMode {
  try {
    const v = localStorage.getItem(keyFor(userId));
    return v === "list" || v === "tiles" ? v : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export function saveRentalsViewMode(
  userId: number | string | undefined,
  mode: RentalsViewMode,
): void {
  try {
    localStorage.setItem(keyFor(userId), mode);
  } catch {
    /* ignore (private mode / quota) */
  }
}
