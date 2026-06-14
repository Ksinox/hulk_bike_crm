import {
  createContext,
  useContext,
  useEffect,
  useRef,
} from "react";

/**
 * FAB (плавающая кнопка «+») живёт в оболочке MobileApp как `absolute`
 * элемент внутри dvh-корня, а НЕ `position:fixed` — потому что на iOS Safari
 * fixed-элементы у нижней кромки уезжают под браузерный тулбар. Страницы
 * лишь регистрируют свою кнопку через usePageFab — действие остаётся на
 * стороне страницы (открыть свою модалку), а отрисовка — в оболочке.
 */
export type PageFab = { label: string; onClick: () => void };

type FabCtx = { set: (fab: PageFab | null) => void };
const FabContext = createContext<FabCtx>({ set: () => {} });

export function FabProvider({
  set,
  children,
}: {
  set: (fab: PageFab | null) => void;
  children: React.ReactNode;
}) {
  return <FabContext.Provider value={{ set }}>{children}</FabContext.Provider>;
}

/**
 * Регистрирует FAB активного экрана. Очищает при размонтировании.
 * onClick хранится в ref, чтобы пересоздание колбэка на ре-рендере не
 * перезапускало эффект (иначе цикл set → ре-рендер → set).
 *
 * hidden — скрыть кнопку (не регистрировать). Нужно, когда мы провалились
 * ВНУТРЬ карточки (drill-in): внутри карточки аренды/клиента/скутера кнопка
 * «+ Аренда/Клиент/Скутер» не нужна и мешает — снимаем её.
 */
export function usePageFab(
  label: string,
  onClick: () => void,
  hidden?: boolean,
) {
  const { set } = useContext(FabContext);
  const cb = useRef(onClick);
  cb.current = onClick;
  useEffect(() => {
    if (hidden) {
      set(null);
      return;
    }
    set({ label, onClick: () => cb.current() });
    return () => set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, hidden]);
}
