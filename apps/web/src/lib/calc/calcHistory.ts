/**
 * Локальная история расчётов калькулятора (этот браузер). Каждый расчёт —
 * «сессия» (один звонок клиента) со списком зафиксированных вариантов.
 *
 * Хранится в localStorage: персональный блокнот оператора, в данные CRM
 * НИЧЕГО не пишет. Решение пользователя (2026-06): для MVP хватает локального
 * хранения; общая серверная история — отдельной задачей, если понадобится.
 */

/** Зафиксированный вариант расчёта (снимок на момент «Зафиксировать»). */
export type CalcVariant = {
  id: string;
  modelId: number | null;
  modelName: string;
  equipmentIds: number[];
  equipmentNames: string[];
  startIso: string;
  days: number;
  /** Снимок расчёта — стабилен, даже если потом поменяют тарифы в каталоге. */
  rentRate: number;
  rentSum: number;
  equipDaily: number;
  equipSum: number;
  deposit: number;
  total: number;
  createdAtIso: string;
};

/** Сессия расчёта = один клиент/звонок со своими вариантами. */
export type CalcSession = {
  id: string;
  title: string;
  createdAtIso: string;
  variants: CalcVariant[];
};

export type WinPos = { x: number; y: number };

const SESSIONS_KEY = "hulk-calc-sessions-v1";
const ACTIVE_KEY = "hulk-calc-active-v1";
const POS_KEY = "hulk-calc-pos-v1";

/** Уникальный id (crypto в браузере; фолбэк на время+счётчик). */
export function genId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function loadSessions(): CalcSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CalcSession[]) : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: CalcSession[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    /* quota / приватный режим — тихо игнорируем */
  }
}

export function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

/** Заголовок новой сессии по умолчанию: «Расчёт · 06.06 14:30». */
export function newSessionTitle(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `Расчёт · ${dd}.${mo} ${hh}:${mm}`;
}

export function createSession(): CalcSession {
  return {
    id: genId(),
    title: newSessionTitle(),
    createdAtIso: new Date().toISOString(),
    variants: [],
  };
}

export function loadPos(): WinPos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    return raw ? (JSON.parse(raw) as WinPos) : null;
  } catch {
    return null;
  }
}

export function savePos(pos: WinPos): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}
