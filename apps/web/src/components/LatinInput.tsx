import { useEffect, useRef, useState } from "react";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Поле, где пишут только латиницей, — номер рамы (заказчик 16.09: «даже
 * если раскладка на русском, всё равно на английском пишет»).
 *
 * • Клавиатура компьютера: при русской раскладке берём не букву, а клавишу
 *   (e.code): нажали «S» — встанет S, а не «Ы». Раскладку переключать не надо.
 * • Экранная клавиатура телефона клавишу не сообщает: русские буквы-двойники
 *   (С, А, Е, О, Р…) становятся латинскими, остальные русские не вводятся —
 *   под полем подсказка переключить клавиатуру.
 * • Вставка текста: те же правила, что и для экранной клавиатуры.
 */

const LOOKALIKE: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", У: "Y", Х: "X",
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
};
const CYRILLIC = /[А-Яа-яЁё]/g;

/** Русские двойники → латиница, прочие русские буквы — прочь. */
export function toLatin(raw: string): { value: string; dropped: boolean } {
  const mapped = raw.replace(/[АВЕКМНОРСТУХавекмнорстух]/g, (ch) => LOOKALIKE[ch] ?? ch);
  const value = mapped.replace(CYRILLIC, "");
  return { value, dropped: value !== mapped };
}

/** Латинская буква или цифра той клавиши, что нажата при чужой раскладке. */
export function latinForKey(e: { key: string; code: string; shiftKey: boolean }): string | null {
  const letter = /^Key([A-Z])$/.exec(e.code);
  if (letter) return letter[1]!;
  const digit = /^Digit(\d)$/.exec(e.code);
  if (digit && !e.shiftKey) return digit[1]!;
  return null;
}

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (v: string) => void;
  /** Где показывать подсказку: под полем (по умолчанию) или не показывать. */
  hint?: "below" | "none";
};

export function LatinInput({ value, onValueChange, onKeyDown, hint = "below", className, ...rest }: Props) {
  const [note, setNote] = useState<"layout" | "keyboard" | null>(null);
  const timer = useRef<number | null>(null);
  const flash = (kind: "layout" | "keyboard") => {
    setNote(kind);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNote(null), kind === "layout" ? 2500 : 5000);
  };
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  return (
    <>
      <input
        {...rest}
        lang="en"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        value={value}
        className={className}
        onKeyDown={(e) => {
          // Клавиша известна только у настоящей клавиатуры; экранная
          // (code пустой) — дальше, в onChange, по буквам-двойникам.
          const nonLatin = e.key.length === 1 && /[^\x00-\x7f]/.test(e.key);
          if (nonLatin && e.code && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const ch = latinForKey(e);
            e.preventDefault();
            if (ch) {
              const el = e.currentTarget;
              const start = el.selectionStart ?? value.length;
              const end = el.selectionEnd ?? start;
              onValueChange(value.slice(0, start) + ch.toUpperCase() + value.slice(end));
              requestAnimationFrame(() => {
                try {
                  el.setSelectionRange(start + 1, start + 1);
                } catch {
                  /* поле уже без фокуса */
                }
              });
              flash("layout");
            } else {
              flash("keyboard");
            }
            return;
          }
          onKeyDown?.(e);
        }}
        onChange={(e) => {
          const { value: v, dropped } = toLatin(e.target.value);
          if (dropped) flash("keyboard");
          onValueChange(v);
        }}
      />
      {hint === "below" && note && (
        <span
          role="status"
          className={cn(
            "mt-0.5 flex items-center gap-1 text-[10.5px] font-semibold leading-tight",
            note === "layout" ? "text-blue-700" : "text-amber-700",
          )}
        >
          <Languages size={11} className="shrink-0" />
          {note === "layout"
            ? "Раскладка русская — пишем латиницей"
            : "Рама — только латиница. Переключите клавиатуру на английскую"}
        </span>
      )}
    </>
  );
}
