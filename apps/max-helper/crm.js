/*
 * Мостик между CRM и дополнением.
 *
 * Страница CRM не может обратиться к дополнению напрямую, а дополнение не
 * может выполнять код на странице. Поэтому этот скрипт живёт на странице
 * CRM: он ставит на неё «флажок присутствия» (чтобы CRM понимала, что
 * помощник установлен, и не показывала инструкцию по установке) и
 * пересылает запросы «открой чат с этим номером» в фон дополнения.
 */

(function () {
  const VERSION = chrome.runtime.getManifest().version;

  /** Флажок в DOM: CRM читает его сразу при загрузке. */
  const mark = () => {
    document.documentElement.dataset.hulkMaxHelper = VERSION;
  };
  mark();
  // На случай, если приложение перерисует корневой элемент.
  document.addEventListener("DOMContentLoaded", mark);

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.source !== "hulk-crm") return;

    if (data.type === "hulk-open-max") {
      chrome.runtime.sendMessage(
        { type: "hulk-open-max", phone: data.phone },
        (res) => {
          window.postMessage(
            {
              source: "hulk-max-helper",
              type: "hulk-open-max-result",
              requestId: data.requestId,
              result: chrome.runtime.lastError
                ? { ok: false, error: "extension_unavailable" }
                : res,
            },
            "*",
          );
        },
      );
    }

    if (data.type === "hulk-ping") {
      window.postMessage(
        {
          source: "hulk-max-helper",
          type: "hulk-pong",
          requestId: data.requestId,
          version: VERSION,
        },
        "*",
      );
    }
  });
})();
