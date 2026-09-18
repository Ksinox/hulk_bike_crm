import { useEffect, useState } from "react";

/**
 * Вкладки внутри разделов (18.09, заказчик: «сайдбар немножко очистить»).
 *
 * «Что нового» переехал во вкладку «Что уже сделано» раздела «Развитие»,
 * «Хранилище» — во вкладку «Настроек». Старые ссылки и кнопки (колокольчик
 * «Что нового», сохранённый раздел) открывают нужную вкладку: вкладка
 * запоминается здесь, раздел открывается обычным переходом.
 */

export type DevTab = "now" | "done";
export type SettingsTab = "main" | "storage";

const DEV_KEY = "hulk-dev-tab";
const SETTINGS_KEY = "hulk-settings-tab";
const EVENT = "hulk:section-tab";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* приватный режим — вкладка просто не запомнится */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, value } }));
}

export const loadDevTab = (): DevTab => (read(DEV_KEY) === "done" ? "done" : "now");
export const saveDevTab = (t: DevTab) => write(DEV_KEY, t);
export const loadSettingsTab = (): SettingsTab => (read(SETTINGS_KEY) === "storage" ? "storage" : "main");
export const saveSettingsTab = (t: SettingsTab) => write(SETTINGS_KEY, t);

/** Вкладка, которая переключается и изнутри раздела, и снаружи (колокольчик). */
function useSectionTab<T extends string>(key: string, load: () => T, save: (t: T) => void): [T, (t: T) => void] {
  const [tab, setTab] = useState<T>(load);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; value: string }>).detail;
      if (d?.key === key) setTab(d.value as T);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [key]);
  return [tab, save];
}

export const useDevTab = () => useSectionTab<DevTab>(DEV_KEY, loadDevTab, saveDevTab);
export const useSettingsTab = () => useSectionTab<SettingsTab>(SETTINGS_KEY, loadSettingsTab, saveSettingsTab);
