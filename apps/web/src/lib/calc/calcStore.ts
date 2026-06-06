/**
 * Мини-шина команд для плавающего калькулятора. Само окно смонтировано
 * глобально (App), а триггеры открытия раскиданы по UI: кнопка внизу
 * сайдбара (десктоп), пункт в шторке «Ещё» (мобила), горячие клавиши.
 * Чтобы не тащить состояние через пол-приложения — простой emitter.
 */

type CalcCommand = "toggle" | "open" | "close";
type Listener = (cmd: CalcCommand) => void;

const listeners = new Set<Listener>();

/** Подписаться на команды (вызывает RentalCalculator). Возвращает отписку. */
export function onCalculatorCommand(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function emit(cmd: CalcCommand) {
  listeners.forEach((l) => l(cmd));
}

export const openCalculator = () => emit("open");
export const closeCalculator = () => emit("close");
export const toggleCalculator = () => emit("toggle");
