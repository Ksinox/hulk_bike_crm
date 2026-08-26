/**
 * Пункт 1 — «Ключ директора», клиентское ядро.
 *
 * Бэкенд отвечает 428 { error: 'director_key_required', action } на
 * защищённые действия. api-клиент перехватывает это, вызывает гейт
 * (модальное окно), получает заголовок подтверждения и повторяет запрос.
 * Благодаря перехвату НИ ОДИН вызов защищённого действия менять не нужно.
 *
 * Окно показывает «краткий отчёт операции». Базовое название берётся из
 * ACTION_META, а вызывающий код может обогатить его деталями через
 * setNextApprovalContext(...) прямо перед мутацией (что за аренда, суммы).
 */

export type ApprovalContext = {
  /** Человекочитаемо: что произойдёт (одна строка). */
  summary?: string;
  /** Детали: на что повлияет (строки списком). */
  details?: string[];
};

export const ACTION_META: Record<
  string,
  { title: string; generic: string; warn?: string }
> = {
  rental_delete: {
    title: "Удаление аренды",
    generic: "Аренда будет удалена (перенесена в архив).",
    warn: "Действие затрагивает историю и выручку.",
  },
  scooter_status_change: {
    title: "Перенос техники в другую категорию",
    generic: "Скутер будет переведён в другую категорию парка.",
  },
  scooter_remove: {
    title: "Скутер покидает парк",
    generic: "Скутер будет убран из парка (в архив).",
    warn: "Общее количество техники в парке уменьшится.",
  },
  // Правка 2.2 (26.08): идентификаторы техники завязаны на договоры и
  // акты — их смена только с ключом.
  scooter_identity_change: {
    title: "Изменение номера рамы / двигателя",
    generic: "У существующей техники меняется идентификатор (VIN, рама или двигатель).",
    warn: "Номер подставляется в договоры и акты — проверьте, что это не ошибка.",
  },
};

/** Контекст ближайшего защищённого действия (ставится перед мутацией). */
let nextContext: ApprovalContext | null = null;
export function setNextApprovalContext(ctx: ApprovalContext | null) {
  nextContext = ctx;
}
export function takeApprovalContext(): ApprovalContext | null {
  const c = nextContext;
  nextContext = null;
  return c;
}

/** Обработчик-гейт: рендерится провайдером в App, возвращает значение
 *  заголовка `x-director-approval` или null (оператор отменил). */
export type GateHandler = (args: {
  action: string;
  context: ApprovalContext | null;
}) => Promise<string | null>;

let handler: GateHandler | null = null;
export function setDirectorGateHandler(h: GateHandler | null) {
  handler = h;
}

export async function acquireDirectorApproval(
  action: string,
): Promise<string | null> {
  if (!handler) return null;
  return handler({ action, context: takeApprovalContext() });
}
