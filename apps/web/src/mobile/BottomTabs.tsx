import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTabletLayout } from "@/lib/useIsMobile";

/**
 * Ряд разделов внизу экрана — планшетная привычка.
 *
 * Правка заказчика 21.09: «в компьютерной версии это сверху стоит, а в
 * планшетной снизу — мы планшет держим в руках, палец внизу, в правом
 * нижнем углу». Поэтому на планшете переключатель разделов («Обзор ·
 * Приход · Расход…», «Аренды · Электротранспорт · Инвесторы» и такие же в
 * других разделах) переезжает вниз, к нижней панели.
 *
 * Как устроено: оболочка MobileApp держит пустую полосу над нижней панелью
 * и кладёт её в контекст. Раздел оборачивает свой ряд в <BottomTabs> — и
 * ряд «телепортируется» вниз, не меняя разметку самого раздела. На
 * компьютере и телефоне слота нет, ряд рисуется на своём обычном месте.
 */
const SlotContext = createContext<HTMLElement | null>(null);

export function BottomTabsSlotProvider({
  slot,
  children,
}: {
  slot: HTMLElement | null;
  children: ReactNode;
}) {
  return <SlotContext.Provider value={slot}>{children}</SlotContext.Provider>;
}

export function BottomTabs({ children }: { children: ReactNode }) {
  const slot = useContext(SlotContext);
  const tabletLayout = useTabletLayout();
  if (!tabletLayout || !slot) return <>{children}</>;
  return createPortal(children, slot);
}
