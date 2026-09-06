import { useSyncExternalStore } from "react";
import { acquireDirectorApproval, setNextApprovalContext } from "./directorGate";

/**
 * Заказчик 06.09 (п.11 + вечерний фидбэк): прибыль и закупочная стоимость
 * закрыты для всех, открывает их директор ключом.
 *
 * Два разных состояния, и это важно:
 *   • unlocked — ключ в этой вкладке уже проверен;
 *   • revealed — цифры показаны прямо сейчас.
 * Первый показ спрашивает ключ и включает оба. «Скрыть» гасит только
 * revealed: посмотрел — спрятал — снова показал, не вводя ключ заново.
 * Закрыли вкладку — забыли всё.
 */
const KEY_REVEALED = "hulk.sensitive.revealed";
const KEY_UNLOCKED = "hulk.sensitive.unlocked";

function read(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

let revealed = read(KEY_REVEALED);
let unlocked = read(KEY_UNLOCKED);
let pending: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function write(key: string, v: boolean) {
  try {
    if (v) sessionStorage.setItem(key, "1");
    else sessionStorage.removeItem(key);
  } catch {
    /* приватный режим */
  }
}

function set(next: { revealed?: boolean; unlocked?: boolean }) {
  if (next.revealed !== undefined) {
    revealed = next.revealed;
    write(KEY_REVEALED, revealed);
  }
  if (next.unlocked !== undefined) {
    unlocked = next.unlocked;
    write(KEY_UNLOCKED, unlocked);
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSensitiveRevealed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => revealed,
    () => false,
  );
}

/** Ключ уже вводили в этой вкладке — можно показывать без повторного ввода. */
export function useSensitiveUnlocked(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => unlocked,
    () => false,
  );
}

/**
 * Показать цифры. Если ключ в этой вкладке уже вводили — показываем сразу,
 * иначе открываем окно «Ключ директора».
 */
export function revealSensitive(): Promise<boolean> {
  if (revealed) return Promise.resolve(true);
  if (unlocked) {
    set({ revealed: true });
    return Promise.resolve(true);
  }
  if (pending) return pending;
  setNextApprovalContext({
    summary: "Показать прибыль и закупочную стоимость",
    details: [
      "Цифры откроются во всех окнах раздела «Продажи», в аналитике и в карточках техники.",
      "Спрятать обратно — клик по цифре или кнопка «Скрыть прибыль»; ключ во второй раз не спросим.",
    ],
  });
  pending = acquireDirectorApproval("sales_profit_reveal")
    .then((v) => {
      const ok = !!v;
      if (ok) set({ revealed: true, unlocked: true });
      return ok;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Спрятать обратно (ключ остаётся проверенным до конца вкладки). */
export function hideSensitive() {
  set({ revealed: false });
}

/** Полностью забыть: и показ, и проверенный ключ. */
export function lockSensitive() {
  set({ revealed: false, unlocked: false });
}
