import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useState, который ПЕРЕЖИВАЕТ обновление страницы (F5 / случайный refresh).
 *
 * Зачем: оператор заполняет заявку/приём оплаты, случайно жмёт обновление —
 * и всё введённое теряется, плюс выкидывает с экрана. Этот хук кладёт значение
 * в Storage и восстанавливает его при следующем монтировании с тем же ключом.
 *
 * По умолчанию — sessionStorage: черновик живёт, пока открыта вкладка
 * (переживает refresh и переходы внутри вкладки), но НЕ всплывает через
 * неделю при новом запуске браузера. Для долгоживущих настроек можно
 * передать storage: "local".
 *
 * clear() — стереть черновик (вызывать после успешной отправки формы, чтобы
 * заполненное не «воскресало» при следующем открытии). После clear() ближайшая
 * запись пропускается (skipRef), иначе эффект тут же перезаписал бы ключ
 * текущим состоянием до размонтирования.
 */
type StorageKind = "session" | "local";

function getStore(kind: StorageKind): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null; // приватный режим / отключённое хранилище
  }
}

export function usePersistedState<T>(
  /** Уникальный ключ черновика. Включай id сущности: `payment:rental-123`. */
  key: string,
  initial: T | (() => T),
  opts?: {
    storage?: StorageKind;
    /** Бампать при несовместимом изменении формы — старые черновики игнорятся. */
    version?: number;
    /** Не сохранять/не восстанавливать (например, форма ещё не «настоящая»). */
    disabled?: boolean;
  },
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const kind = opts?.storage ?? "session";
  const version = opts?.version ?? 1;
  const disabled = opts?.disabled ?? false;
  const fullKey = `hulk-draft:${key}:v${version}`;
  const storeRef = useRef<Storage | null>(getStore(kind));
  const skipRef = useRef(false);

  const [state, setState] = useState<T>(() => {
    if (!disabled) {
      const store = storeRef.current;
      if (store) {
        try {
          const raw = store.getItem(fullKey);
          if (raw != null) return JSON.parse(raw) as T;
        } catch {
          /* битый JSON — игнор, берём initial */
        }
      }
    }
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    if (disabled) return;
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const store = storeRef.current;
    if (!store) return;
    try {
      store.setItem(fullKey, JSON.stringify(state));
    } catch {
      /* квота/сериализация — не критично */
    }
  }, [fullKey, state, disabled]);

  const clear = useCallback(() => {
    skipRef.current = true;
    const store = storeRef.current;
    if (!store) return;
    try {
      store.removeItem(fullKey);
    } catch {
      /* ignore */
    }
  }, [fullKey]);

  return [state, setState, clear];
}

/**
 * Черновик ФОРМЫ, переживающий refresh. Как usePersistedState, но:
 *  • initial — фабрика (вычисляется один раз), чтобы черновик мог
 *    смержиться ПОВЕРХ свежего initial (восстановили текст — поля, которых
 *    в черновике нет, берём из initial);
 *  • omit — поля, которые НЕ сохраняем (File/Blob: селфи, скан паспорта,
 *    медиа ущерба — их нельзя сериализовать в sessionStorage; после refresh
 *    их нужно приложить заново, а вот напечатанный текст вернётся).
 *
 * clear() вызывать после успешной отправки, чтобы заполненное не «воскресало».
 */
/**
 * Восстанавливает «открытый экран» (drill-in карточки на мобиле) ТОЛЬКО после
 * перезагрузки страницы (F5), но НЕ при обычном переключении вкладок таб-бара.
 *
 * Зачем отдельный хук: мобильные страницы (MobileRentals и т.п.) ремаунтятся
 * при каждом переключении таба. Если просто персистить openId, карточка
 * всплывала бы при каждом заходе на вкладку (тап «Аренды» → сразу карточка,
 * а не список). Здесь восстановление происходит лишь на ПЕРВОМ монтировании
 * ключа в сессии документа И лишь если документ был перезагружен.
 */
const reloadConsumedKeys = new Set<string>();

function wasPageReloaded(): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    return nav?.type === "reload";
  } catch {
    return false;
  }
}

export function useReloadRestoredState<T>(
  key: string,
  initial: T,
  opts?: { storage?: StorageKind; version?: number },
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const kind = opts?.storage ?? "session";
  const version = opts?.version ?? 1;
  const fullKey = `hulk-screen:${key}:v${version}`;
  const storeRef = useRef<Storage | null>(getStore(kind));

  const [state, setState] = useState<T>(() => {
    const store = storeRef.current;
    if (store && wasPageReloaded() && !reloadConsumedKeys.has(fullKey)) {
      // Перезагрузка + первый монт этого ключа → восстанавливаем экран.
      reloadConsumedKeys.add(fullKey);
      try {
        const raw = store.getItem(fullKey);
        if (raw != null) return JSON.parse(raw) as T;
      } catch {
        /* битый JSON — игнор */
      }
      return initial;
    }
    // Обычная навигация / повторный монт (tab-switch) → чистый старт.
    reloadConsumedKeys.add(fullKey);
    if (store) {
      try {
        store.removeItem(fullKey);
      } catch {
        /* ignore */
      }
    }
    return initial;
  });

  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;
    try {
      if (state == null) store.removeItem(fullKey);
      else store.setItem(fullKey, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [fullKey, state]);

  return [state, setState];
}

export function usePersistedFormState<T extends object>(
  key: string,
  initialFactory: () => T,
  opts?: {
    omit?: (keyof T)[];
    storage?: StorageKind;
    version?: number;
    disabled?: boolean;
  },
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const kind = opts?.storage ?? "session";
  const version = opts?.version ?? 1;
  const disabled = opts?.disabled ?? false;
  const omit = opts?.omit ?? [];
  const fullKey = `hulk-draft:${key}:v${version}`;
  const storeRef = useRef<Storage | null>(getStore(kind));
  const omitRef = useRef(omit);
  omitRef.current = omit;
  const skipRef = useRef(false);

  const [state, setState] = useState<T>(() => {
    const initial = initialFactory();
    if (disabled) return initial;
    const store = storeRef.current;
    if (store) {
      try {
        const raw = store.getItem(fullKey);
        if (raw != null) {
          const parsed = JSON.parse(raw) as Partial<T>;
          // Мержим поверх initial: omit-поля (файлы) остаются из initial.
          return { ...initial, ...parsed };
        }
      } catch {
        /* битый черновик — берём initial */
      }
    }
    return initial;
  });

  useEffect(() => {
    if (disabled) return;
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const store = storeRef.current;
    if (!store) return;
    try {
      const copy: Record<string, unknown> = {};
      for (const k of Object.keys(state) as (keyof T)[]) {
        if (omitRef.current.includes(k)) continue;
        const v = state[k];
        // Подстраховка: не пытаемся сериализовать File/Blob, даже если поле
        // забыли указать в omit.
        if (v instanceof File || v instanceof Blob) continue;
        copy[k as string] = v;
      }
      store.setItem(fullKey, JSON.stringify(copy));
    } catch {
      /* квота/сериализация — не критично */
    }
  }, [fullKey, state, disabled]);

  const clear = useCallback(() => {
    skipRef.current = true;
    const store = storeRef.current;
    if (!store) return;
    try {
      store.removeItem(fullKey);
    } catch {
      /* ignore */
    }
  }, [fullKey]);

  return [state, setState, clear];
}
