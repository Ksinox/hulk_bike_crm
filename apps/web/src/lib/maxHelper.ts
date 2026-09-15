/**
 * Связь с дополнением «Халк Байк — мессенджеры» (01.09).
 *
 * Заказчик хотел «нажал одну кнопку — всё само установилось». Поставить
 * дополнение со страницы нельзя: браузеры запретили это ещё в 2018-м,
 * иначе любой сайт молча ставил бы себе расширения. Что можно — сделать
 * установку в один клик из магазина и дальше не заставлять оператора
 * ничего настраивать: CRM сама видит, установлен помощник или нет.
 *
 * Помощник ставит на страницу флажок `data-hulk-max-helper` и слушает
 * postMessage. Если он есть — чат открываем через него (он умеет найти
 * УЖЕ открытую вкладку MAX, даже ту, что оператор открыл сам). Если нет —
 * работает прежний путь: открыть MAX и скопировать номер.
 */

export type MaxOpenResult = { ok: boolean; error?: string };

/** Установлен ли помощник (флажок появляется до отрисовки страницы). */
export function isMaxHelperInstalled(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.documentElement.dataset.hulkMaxHelper;
}

export function maxHelperVersion(): string | null {
  if (typeof document === "undefined") return null;
  return document.documentElement.dataset.hulkMaxHelper ?? null;
}

let seq = 0;

/** Спросить помощника, жив ли он (для страницы настройки). */
export function pingMaxHelper(timeout = 1500): Promise<string | null> {
  if (!isMaxHelperInstalled()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const requestId = `ping-${++seq}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, timeout);
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (d?.source !== "hulk-max-helper" || d.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(String(d.version ?? "1"));
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "hulk-crm", type: "hulk-ping", requestId }, "*");
  });
}

/**
 * Открыть чат с клиентом через помощника. Возвращает null, если помощника
 * нет — вызывающий код в этом случае идёт прежним путём.
 */
export function openMaxChatViaHelper(
  phone: string,
  timeout = 30000,
): Promise<MaxOpenResult> | null {
  if (!isMaxHelperInstalled()) return null;
  return new Promise((resolve) => {
    const requestId = `open-${++seq}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({ ok: false, error: "timeout" });
    }, timeout);
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (d?.source !== "hulk-max-helper" || d.requestId !== requestId) return;
      if (d.type !== "hulk-open-max-result") return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve((d.result as MaxOpenResult) ?? { ok: false, error: "no_result" });
    }
    window.addEventListener("message", onMessage);
    window.postMessage(
      { source: "hulk-crm", type: "hulk-open-max", phone, requestId },
      "*",
    );
  });
}
