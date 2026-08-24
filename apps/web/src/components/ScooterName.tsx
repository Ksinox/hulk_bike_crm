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
 */

/** «Jog #03» → «Jog». Имя без решётки возвращаем как есть. */
export function scooterModelName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s*#\s*\d+\s*$/, "").trim() || (name ?? "");
}

export function ScooterNumberBadge({
  number,
  size = "md",
  tone = "ink",
}: {
  number: number | null | undefined;
  size?: "sm" | "md" | "lg";
  /** ink — обычный, muted — бывший номер (техника уже не в аренде). */
  tone?: "ink" | "muted";
}) {
  if (number == null) return null;
  return (
    <span
      title={
        tone === "muted"
          ? `Был закреплён номер ${number}`
          : `Номер в арендном парке: ${number}`
      }
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums",
        tone === "ink"
          ? "bg-ink text-white"
          : "border border-border bg-surface text-muted",
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

/** Модель + номер: «Jog ⑤». */
export function ScooterName({
  name,
  number,
  exNumber,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  /** Действующий арендный номер. */
  number?: number | null;
  /** Бывший номер — показываем приглушённым, если техника вне аренды. */
  exNumber?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const model = scooterModelName(name);
  const showEx = number == null && exNumber != null;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span>{model}</span>
      <ScooterNumberBadge
        number={number ?? exNumber ?? null}
        size={size}
        tone={showEx ? "muted" : "ink"}
      />
    </span>
  );
}
