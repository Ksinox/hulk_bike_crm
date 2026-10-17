import { useState } from "react";
import { cn } from "@/lib/utils";
import { CheckBox } from "@/components/ui/picker";
import { BIG_JUMP_KM, MAX_MILEAGE } from "./returnIntake";

/**
 * Ввод пробега снятого скутера — с теми же правилами, что при приёмке
 * (баг 13.10): лишние цифры не пропускаем, меньше записанного — только
 * явным «Это исправление», резкий рост подсвечиваем.
 *
 * 17.10 (заказчик): «при замене скутера система должна запрашивать пробег,
 * так как он возвращается в парк». Используется окном замены.
 */
export function useMileageCheck(stored: number | null) {
  const [value, setValue] = useState("");
  const [correction, setCorrection] = useState(false);
  const missing = !value.trim();
  const num = Number(value);
  const tooBig = !missing && num > MAX_MILEAGE;
  const lower = !missing && stored != null && num < stored;
  const needsDecision = lower && !correction;
  /** В системе уже записана опечатка — рост от неё не считаем. */
  const storedAbsurd = stored != null && stored > MAX_MILEAGE;
  const bigJump =
    !missing && !storedAbsurd && stored != null && num - stored > BIG_JUMP_KM;
  return {
    value,
    setValue,
    correction,
    setCorrection,
    stored,
    num,
    missing,
    tooBig,
    lower,
    needsDecision,
    storedAbsurd,
    bigJump,
    /** Нельзя продолжать: пусто, лишние цифры или меньшее без отметки. */
    blocked: missing || tooBig || needsDecision,
    forApi: missing ? undefined : num,
    correctionForApi: lower && correction,
  };
}

export type MileageCheck = ReturnType<typeof useMileageCheck>;

const km = (n: number) => n.toLocaleString("ru-RU");

/**
 * Поле «Пробег сейчас, км» с подсказкой под ним. `touch` — крупное поле
 * под палец (телефон, планшет).
 */
export function MileageField({
  m,
  touch = false,
  className,
}: {
  m: MileageCheck;
  touch?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        className={cn(
          "flex flex-wrap items-baseline gap-x-1.5",
          touch
            ? "mb-1.5 text-[13px] font-bold text-ink"
            : "text-[11px] font-semibold uppercase tracking-wider text-muted-2",
        )}
      >
        Пробег сейчас, км
        {m.stored != null && (
          <span className={cn("font-normal", touch ? "text-muted-2" : "normal-case text-muted-2/70")}>
            · было {km(m.stored)}
          </span>
        )}
        <span
          className={cn(
            "normal-case",
            m.missing ? "font-bold text-red-ink" : touch ? "font-normal text-muted-2" : "text-muted-2/70",
          )}
        >
          обязательно
        </span>
      </label>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        aria-label="Пробег снятого скутера"
        value={m.value}
        onChange={(e) => m.setValue(e.target.value)}
        placeholder={m.stored != null ? km(m.stored) : "—"}
        className={cn(
          "w-full border bg-surface tabular-nums text-ink outline-none focus:border-blue-600",
          touch
            ? "h-12 rounded-2xl px-4 text-[17px] font-semibold"
            : "mt-1 h-9 rounded-[10px] px-3 text-[13px]",
          m.missing ? "border-red-ink/40 bg-red-soft/30" : "border-border",
        )}
      />
      <MileageHint m={m} className={cn("mt-1", touch ? "text-[12.5px]" : "text-[11px]")} />
    </div>
  );
}

/** Подсказка к введённому: лишние цифры или «+N км за аренду». */
function MileageHint({ m, className }: { m: MileageCheck; className?: string }) {
  if (m.tooBig)
    return (
      <div className={cn("font-semibold text-red-ink", className)}>
        Больше {km(MAX_MILEAGE)} км — проверьте, нет ли лишних цифр
      </div>
    );
  if (m.stored != null && !m.missing && m.num > m.stored)
    return (
      <div className={cn("font-semibold", m.bigJump ? "text-orange-ink" : "text-green-ink", className)}>
        + {km(m.num - m.stored)} км за аренду
        {m.bigJump && " — много для одной аренды, проверьте цифры"}
      </div>
    );
  return null;
}

/**
 * Крупное поле пробега — для отдельного шага «Пробег снятого скутера» на
 * компьютере (17.10, заказчик: ввод пробега — главное действие, его нельзя
 * не заметить). Курсор сразу в поле, Enter — дальше.
 */
export function MileageHeroInput({ m, onEnter }: { m: MileageCheck; onEnter?: () => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-[14px] font-bold text-ink">Сколько на одометре?</label>
      <div
        className={cn(
          "flex h-16 items-center gap-3 rounded-2xl border-2 bg-white px-5 transition-colors focus-within:border-blue-600",
          m.tooBig ? "border-red-ink/50" : "border-border",
        )}
      >
        <input
          autoFocus
          type="number"
          inputMode="numeric"
          min={0}
          aria-label="Пробег снятого скутера"
          value={m.value}
          onChange={(e) => m.setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter?.();
            }
          }}
          placeholder={m.stored != null ? String(m.stored) : "0"}
          className="min-w-0 flex-1 bg-transparent font-display text-[28px] font-extrabold tabular-nums text-ink outline-none [appearance:textfield] placeholder:text-muted-2/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-[16px] font-semibold text-muted-2">км</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
        {/* При «меньше записанного» это говорит блок исправления ниже. */}
        {m.stored != null && !m.lower && (
          <span className="text-muted">В системе записано {km(m.stored)} км</span>
        )}
        {m.stored != null && (m.tooBig || (!m.missing && m.num > m.stored)) && (
          <span className="text-muted-2">·</span>
        )}
        <MileageHint m={m} />
      </div>
    </div>
  );
}

/** Введено меньше записанного: явный выбор — поправить ввод или отметить исправление. */
export function MileageCorrectionBox({ m, className }: { m: MileageCheck; className?: string }) {
  if (!m.lower || m.stored == null) return null;
  return (
    <div className={cn("rounded-[12px] border border-orange-300 bg-orange-soft/30 px-3 py-2.5", className)}>
      <div className="text-[12.5px] font-semibold text-orange-ink">
        В системе записано {km(m.stored)} км — больше, чем вы ввели.
      </div>
      <div className="mt-0.5 text-[12px] leading-snug text-ink-2">
        {m.storedAbsurd
          ? "Похоже, прежнее значение — опечатка (лишние цифры). Если на одометре правда столько, сколько вы ввели, — отметьте исправление."
          : "Проверьте одометр. Если в системе была ошибка, отметьте исправление — пробег перезапишется, в хронологии останется запись было → стало."}
      </div>
      <CheckBox
        className="mt-1.5"
        checked={m.correction}
        onChange={m.setCorrection}
        label={`Это исправление — записать ${km(m.num)} км`}
      />
    </div>
  );
}
