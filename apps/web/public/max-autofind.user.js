// ==UserScript==
// @name         Халк Байк — открыть чат MAX по номеру
// @namespace    https://crm.hulkbike.ru/
// @version      1.0.0
// @description  CRM передаёт номер клиента в web.max.ru — скрипт сам вставляет его в поиск, жмёт «Найти по номеру» и открывает чат.
// @author       Халк Байк
// @match        https://web.max.ru/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * Зачем это нужно.
 *
 * У MAX нет ссылки на чат по номеру телефона: адрес вида web.max.ru/202811141
 * при прямом открытии сбрасывается на список чатов — проверено. Значит
 * «одним кликом из CRM» можно попасть в чат только одним способом: проделать
 * в самом MAX то же, что делает руками оператор — вставить номер в поиск и
 * нажать «Найти по номеру».
 *
 * Сделать это со страницы CRM нельзя: браузер не даёт одному сайту трогать
 * содержимое другого (иначе любой сайт лазил бы в вашу почту). Поэтому
 * действие выполняет этот маленький скрипт — он живёт на стороне MAX.
 *
 * Как работает: CRM открывает web.max.ru/#hulk-max=<номер> в своей постоянной
 * вкладке. Скрипт видит номер в адресе и повторяет ручные шаги. Если скрипт
 * не установлен, MAX просто игнорирует хвост адреса — кнопка в CRM работает
 * как раньше (открывает MAX, номер в буфере обмена).
 */

(function () {
  "use strict";

  const KEY = "hulk-max";
  /** Сколько ждём загрузки интерфейса MAX после холодного старта. */
  const BOOT_TIMEOUT = 20000;
  /** Сколько ждём появления пункта «Найти по номеру» после ввода. */
  const HINT_TIMEOUT = 8000;

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

  /** Номер из адреса: #hulk-max=%2B7... */
  function phoneFromHash() {
    const m = new RegExp("(?:^|[#&])" + KEY + "=([^&]+)").exec(
      location.hash || "",
    );
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }

  /** Убираем номер из адреса — обновление страницы не должно повторять поиск. */
  function clearHash() {
    if (!location.hash.includes(KEY)) return;
    const rest = location.hash
      .replace(/^#/, "")
      .split("&")
      .filter((p) => !p.startsWith(KEY + "="))
      .join("&");
    history.replaceState(null, "", location.pathname + (rest ? "#" + rest : ""));
  }

  /** Поле «Найти» в шапке списка чатов. */
  function searchInput() {
    const byClass = document.querySelector("input.field");
    if (byClass) return byClass;
    return (
      [...document.querySelectorAll("input")].find(
        (i) => (i.placeholder || "").trim().toLowerCase() === "найти",
      ) || null
    );
  }

  /**
   * Svelte слушает событие input, а не присваивание value — поэтому пишем
   * через нативный сеттер и сами шлём событие.
   */
  function typeInto(input, text) {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** Пункт «Найти по номеру» в выдаче поиска. */
  function findByNumberItem() {
    const leaf = [...document.querySelectorAll("*")].find(
      (el) =>
        el.children.length === 0 && /Найти по номеру/i.test(el.textContent || ""),
    );
    if (!leaf) return null;
    return leaf.closest("[role=button],button,a,li,div") || leaf;
  }

  /** Только цифры с ведущим плюсом — запасной формат, если MAX не понял ввод. */
  function digitsOnly(phone) {
    const d = phone.replace(/\D/g, "");
    return d ? "+" + d : phone;
  }

  let running = false;

  async function openChatByPhone(phone) {
    if (running) return;
    running = true;
    try {
      const input = await waitFor(searchInput, BOOT_TIMEOUT);
      if (!input) {
        note("MAX не успел загрузиться — вставьте номер в поиск вручную");
        return;
      }

      for (const variant of [phone, digitsOnly(phone)]) {
        typeInto(input, variant);
        const item = await waitFor(findByNumberItem, HINT_TIMEOUT);
        if (item) {
          item.click();
          clearHash();
          return;
        }
      }
      note("MAX не предложил поиск по номеру — попробуйте вручную");
    } finally {
      running = false;
    }
  }

  /** Ненавязчивая подсказка, если автоматика не сработала. */
  function note(text) {
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
      "background:#111827",
      "color:#fff",
      "font:600 13px/1.3 system-ui,sans-serif",
      "box-shadow:0 8px 24px rgba(0,0,0,.25)",
    ].join(";");
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  function tick() {
    const phone = phoneFromHash();
    if (phone) void openChatByPhone(phone);
  }

  // Холодный старт вкладки…
  tick();
  // …и повторные клики из CRM: вкладка та же, меняется только адрес.
  window.addEventListener("hashchange", tick);
})();
