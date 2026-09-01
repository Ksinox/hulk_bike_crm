/*
 * Работает внутри web.max.ru. Повторяет ровно те действия, что оператор
 * делает руками: вставляет номер в поиск, ждёт пункт «Найти по номеру» и
 * нажимает его — открывается чат.
 *
 * Почему именно так, а не «ссылкой на чат»: у MAX такой ссылки нет.
 * Адрес вида web.max.ru/202811141 появляется, когда чат открыт, но при
 * прямом открытии приложение сбрасывает его на список чатов — проверено.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(get, timeout) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const v = get();
    if (v) return v;
    await sleep(200);
  }
  return null;
}

function searchInput() {
  return (
    document.querySelector("input.field") ||
    [...document.querySelectorAll("input")].find(
      (i) => (i.placeholder || "").trim().toLowerCase() === "найти",
    ) ||
    null
  );
}

/** Приложение на Svelte: слушает событие input, а не присваивание value. */
function typeInto(input, text) {
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function findByNumberItem() {
  const leaf = [...document.querySelectorAll("*")].find(
    (el) => el.children.length === 0 && /Найти по номеру/i.test(el.textContent || ""),
  );
  return leaf ? leaf.closest("[role=button],button,a,li,div") || leaf : null;
}

function note(text, bad) {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:24px",
    "transform:translateX(-50%)",
    "z-index:99999",
    "padding:10px 16px",
    "border-radius:12px",
    `background:${bad ? "#b91c1c" : "#111827"}`,
    "color:#fff",
    "font:600 13px/1.3 system-ui,sans-serif",
    "box-shadow:0 8px 24px rgba(0,0,0,.25)",
  ].join(";");
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

let running = false;

async function openChatByPhone(phone) {
  if (running) return { ok: false, error: "busy" };
  running = true;
  try {
    const input = await waitFor(searchInput, 20000);
    if (!input) {
      note("MAX ещё не загрузился — попробуйте ещё раз", true);
      return { ok: false, error: "no_search" };
    }
    // Пробуем как есть, потом только цифрами — на случай, если MAX не
    // понял наш формат записи номера.
    for (const variant of [phone, "+" + phone.replace(/\D/g, "")]) {
      typeInto(input, variant);
      const item = await waitFor(findByNumberItem, 8000);
      if (item) {
        item.click();
        return { ok: true };
      }
    }
    note("MAX не предложил поиск по номеру — попробуйте вручную", true);
    return { ok: false, error: "no_hint" };
  } finally {
    running = false;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "hulk-max-open") return false;
  openChatByPhone(String(msg.phone || ""))
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});
