import { cn } from "@/lib/utils";

/**
 * Отображение техники: НАЗВАНИЕ МОДЕЛИ + круглый бейдж с арендным номером.
 *
 * Правка заказчика 24.08: формата «Jog #03» в интерфейсе быть не должно.
 * В имени скутера номер исторический (порядок заведения), а оператору
 * важен АРЕНДНЫЙ номер — тот, что закреплён за техникой в парке
 * (scooters.rental_slot). Поэтому «решётку» из имени срезаем, а номер
 * показываем кружком — глазом сразу видно, на каком номере скутер.
 *
 * Ушёл из аренды (продажа/выкуп) — номер освобождается, кружка нет.
 *
 * 15.09 (заказчик): бывший номер кружком рядом с названием путали с
 * действующим. Его показывает отдельная пометка `ExNumberTag` — в колонке
 * статуса, в шапке карточки, но не у самого названия.
 */

/** «Jog #03» → «Jog». Имя без решётки возвращаем как есть. */
export function scooterModelName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s*#\s*\d+\s*$/, "").trim() || (name ?? "");
}

export function ScooterNumberBadge({
  number,
  size = "md",
}: {
  number: number | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  if (number == null) return null;
  return (
    <span
      title={`Номер в арендном парке: ${number}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-bold tabular-nums text-white",
        size === "lg"
          ? "h-7 min-w-7 px-1.5 text-[13px]"
          : size === "sm"
            ? "h-5 min-w-5 px-1 text-[11px]"
            : "h-6 min-w-6 px-1.5 text-[12px]",
      )}
    >
      {number}
    </span>
  );
}

/** Модель + действующий номер: «Jog ⑤». Бывший номер — `ExNumberTag`. */
export function ScooterName({
  name,
  number,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  /** Действующий арендный номер. */
  number?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const model = scooterModelName(name);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span>{model}</span>
      <ScooterNumberBadge number={number ?? null} size={size} />
    </span>
  );
}

/**
 * Пометка «Бывший №80» — техника вне аренды, номер был закреплён раньше.
 * Текстом и другим цветом, отдельно от названия: не спутать с действующим.
 * Показывается, только если действующего номера нет.
 */
export function ExNumberTag({
  number,
  current,
  size = "sm",
  className,
}: {
  number: number | null | undefined;
  current?: number | null;
  size?: "sm" | "md";
  className?: string;
}) {
  if (number == null || current != null) return null;
  return (
    <span
      title="Номер, закреплённый за техникой, пока она была в арендном парке"
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-amber-100 font-bold uppercase tracking-wider text-amber-800",
        size === "md" ? "px-3 py-1 text-[12px]" : "px-2 py-0.5 text-[10px]",
        className,
      )}
    >
      Бывший №{number}
    </span>
  );
}
