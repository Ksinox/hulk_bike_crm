/*
 * Мозг дополнения: находит вкладку MAX и просит её открыть чат.
 *
 * Ради этого дополнение и появилось. Обычная веб-страница не может
 * дотянуться до чужой вкладки — браузер не даёт одному сайту трогать
 * другой. Дополнению можно: оно видит список вкладок и умеет переключать
 * на них. Поэтому именно здесь решается то, чего не мог юзерскрипт:
 * если MAX уже открыт — работаем в ТОЙ ЖЕ вкладке, даже если её открыл
 * сам оператор, а не CRM.
 */

const MAX_URL = "https://web.max.ru/";

/** Ждём, пока вкладка догрузится, — в свежей ещё нет ни поиска, ни чатов. */
function waitForComplete(tabId, timeout = 25000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) return resolve(false);
        if (tab.status === "complete") return resolve(true);
        if (Date.now() - started > timeout) return resolve(false);
        setTimeout(tick, 300);
      });
    };
    tick();
  });
}

/** Отдаём номер вкладке MAX; она сама вставит его в поиск и откроет чат. */
function askTab(tabId, phone) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "hulk-max-open", phone }, (res) => {
      if (chrome.runtime.lastError) return resolve({ ok: false, error: "no_content_script" });
      resolve(res ?? { ok: false, error: "no_answer" });
    });
  });
}

async function openChat(phone) {
  const tabs = await chrome.tabs.query({ url: "https://web.max.ru/*" });
  let tab = tabs[0];

  if (tab) {
    // Вкладка уже есть — переключаемся на неё, ничего не перезагружая.
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    tab = await chrome.tabs.create({ url: MAX_URL, active: true });
    await waitForComplete(tab.id);
  }

  const res = await askTab(tab.id, phone);
  if (!res.ok && res.error === "no_content_script") {
    // Редкий случай: вкладка открыта с прошлой сессии, скрипт в неё не
    // внедрён. Перезагружаем — после этого он там будет.
    await chrome.tabs.reload(tab.id);
    await waitForComplete(tab.id);
    return askTab(tab.id, phone);
  }
  return res;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "hulk-open-max") {
    openChat(String(msg.phone || ""))
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // ответ придёт асинхронно
  }
  if (msg?.type === "hulk-ping") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }
  return false;
});
