import { useSyncExternalStore } from "react";
import { acquireDirectorApproval, setNextApprovalContext } from "./directorGate";

/**
 * Заказчик 06.09 (п.11): прибыль и закупочная стоимость в «Продажах»
 * размыты для всех. Увидеть их может только директор — нажатием и вводом
 * ключа. Показ действует до нажатия «Скрыть» или закрытия вкладки
 * (sessionStorage), чтобы не вводить ключ на каждый экран.
 */
const KEY = "hulk.sensitive.revealed";

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let revealed = read();
let pending: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function set(v: boolean) {
  revealed = v;
  try {
    if (v) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    /* приватный режим */
  }
  listeners.forEach((l) => l());
}

export function useSensitiveRevealed(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => revealed,
    () => false,
  );
}

/** Запросить показ: окно «Ключ директора». Возвращает, показали ли. */
export function revealSensitive(): Promise<boolean> {
  if (revealed) return Promise.resolve(true);
  if (pending) return pending;
  setNextApprovalContext({
    summary: "Показать прибыль и закупочную стоимость",
    details: [
      "Цифры откроются во всех окнах раздела «Продажи» и в карточках техники.",
      "Скрыть обратно — кнопкой «Скрыть прибыль» в шапке раздела; при закрытии вкладки скрываются сами.",
    ],
  });
  pending = acquireDirectorApproval("sales_profit_reveal")
    .then((v) => {
      const ok = !!v;
      if (ok) set(true);
      return ok;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function hideSensitive() {
  set(false);
}
