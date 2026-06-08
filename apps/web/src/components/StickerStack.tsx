/**
 * v0.8.12 — стопка стикеров-«наклеек» поверх карточки.
 *
 * Жёлтые (и других цветов) бумажные заметки, приклеенные слегка небрежно
 * (наклон + «скотч» + тень). Несколько штук складываются стопкой с нахлёстом;
 * при наведении стикер выпрямляется, увеличивается и выходит на передний план.
 * «×» — ОТКРЕПИТЬ (не удалить): стикер плавно «улетает» вниз и уходит в раздел
 * «Заметки» карточки. Добавление вынесено в ⋯-меню (NoteComposer).
 *
 * Вдохновлено CSS3 sticky-notes (habr 136238).
 */
import { useState } from "react";
import { X, StickyNote, PhoneOff, SquareParking } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteSticker } from "@/lib/api/stickers";

const ROTATIONS = ["-2deg", "1.6deg", "-1deg", "2.4deg", "-2.6deg", "0.8deg"];

/** Палитра стикеров: ключ → классы фона/текста. */
export const STICKER_COLORS: Record<string, string> = {
  yellow: "bg-amber-200 text-amber-950",
  orange: "bg-orange-200 text-orange-950",
  pink: "bg-rose-200 text-rose-950",
  green: "bg-emerald-200 text-emerald-950",
  blue: "bg-sky-200 text-sky-950",
  purple: "bg-violet-200 text-violet-950",
};
export const STICKER_COLOR_KEYS = Object.keys(STICKER_COLORS);

function colorClass(color: string, isContact: boolean): string {
  if (isContact && (!color || color === "yellow")) return STICKER_COLORS.orange!;
  return STICKER_COLORS[color] ?? STICKER_COLORS.yellow!;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return "";
  }
}

export function StickerStack({
  stickers,
  onUnpin,
  className,
}: {
  stickers: NoteSticker[];
  onUnpin?: (id: number) => void;
  className?: string;
}) {
  // id стикеров, которые сейчас «улетают» (анимация открепления).
  const [flying, setFlying] = useState<Set<number>>(new Set());

  const handleUnpin = (id: number) => {
    setFlying((s) => new Set(s).add(id));
    // дать проиграть анимацию, затем мутация
    window.setTimeout(() => onUnpin?.(id), 260);
  };

  return (
    <div className={cn("flex w-[200px] flex-col items-stretch", className)}>
      {stickers.map((s, i) => (
        <Sticker
          key={s.id}
          sticker={s}
          rotate={ROTATIONS[i % ROTATIONS.length]!}
          overlap={i > 0}
          flying={flying.has(s.id)}
          onUnpin={onUnpin ? handleUnpin : undefined}
        />
      ))}
    </div>
  );
}

function Sticker({
  sticker,
  rotate,
  overlap,
  flying,
  onUnpin,
}: {
  sticker: NoteSticker;
  rotate: string;
  overlap: boolean;
  flying: boolean;
  onUnpin?: (id: number) => void;
}) {
  const isContact = sticker.kind === "contact";
  const isParking = sticker.kind === "parking";
  return (
    <div
      style={{
        ["--rot" as string]: rotate,
        // v0.8.32 (J2): почти без нахлёста — стикеры лишь чуть касаются
        // углами, текст полностью читается.
        marginTop: overlap ? -5 : 0,
      }}
      className={cn(
        "group/sticker relative overflow-hidden rounded-[3px] px-3 pb-2 pt-2.5 shadow-[3px_5px_10px_rgba(0,0,0,0.20)]",
        "transition-all duration-[260ms] ease-out",
        flying
          ? "pointer-events-none translate-y-24 scale-90 opacity-0"
          : "[transform:rotate(var(--rot))] hover:z-20 hover:scale-[1.07] hover:[transform:rotate(0deg)_scale(1.07)]",
        colorClass(sticker.color, isContact),
      )}
    >
      {/* v0.8.18: водяной знак «P» для паркинг-стикеров. */}
      {isParking && (
        <SquareParking
          className="pointer-events-none absolute -bottom-2 -right-1 h-16 w-16 text-black/[0.07]"
          strokeWidth={1.5}
        />
      )}
      {/* полупрозрачный «скотч» на ПРАВОМ краю по центру — стикер выглядит
          приклеенным правым краём к карточке аренды (скотч на стыке).
          Держим внутри (sticker overflow-hidden обрезал бы вынос наружу). */}
      <span className="pointer-events-none absolute right-0.5 top-1/2 h-12 w-3.5 -translate-y-1/2 -rotate-2 bg-white/35 shadow-sm" />

      {onUnpin && (
        <button
          type="button"
          onClick={() => onUnpin(sticker.id)}
          title="Открепить (уйдёт в раздел «Заметки»)"
          className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-black/40 opacity-0 transition-opacity hover:bg-black/10 hover:text-black/70 group-hover/sticker:opacity-100"
        >
          <X size={11} />
        </button>
      )}

      <div className="relative flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide opacity-70">
        {isContact ? (
          <PhoneOff size={10} />
        ) : isParking ? (
          <SquareParking size={10} />
        ) : (
          <StickyNote size={10} />
        )}
        {isContact ? "Связь" : isParking ? "Паркинг" : "Заметка"}
      </div>
      <div className="relative mt-0.5 whitespace-pre-wrap break-words text-[12.5px] font-medium leading-snug">
        {sticker.text}
      </div>
      <div className="relative mt-1 text-[9.5px] opacity-60">
        {sticker.createdByName ?? "—"} · {fmtDate(sticker.createdAt)}
      </div>
    </div>
  );
}

/**
 * Композер новой заметки с выбором цвета. Рендерится из ⋯-меню карточки.
 */
export function NoteComposer({
  onSubmit,
  onCancel,
}: {
  onSubmit: (text: string, color: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [color, setColor] = useState("yellow");
  const submit = () => {
    const t = text.trim();
    if (t) onSubmit(t, color);
    onCancel();
  };
  return (
    <div className="w-[230px] rounded-md border border-amber-300 bg-amber-50 p-2.5 shadow-card-lg">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          if (e.key === "Escape") onCancel();
        }}
        rows={3}
        placeholder="Текст заметки…"
        className="w-full resize-none rounded bg-white/70 p-1.5 text-[12px] text-ink outline-none placeholder:text-muted-2"
      />
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-2">Цвет</span>
        {STICKER_COLOR_KEYS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            title={c}
            className={cn(
              "h-4 w-4 rounded-full ring-2 transition-transform hover:scale-110",
              STICKER_COLORS[c]!.split(" ")[0],
              color === c ? "ring-ink/60" : "ring-transparent",
            )}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-0.5 text-[11px] text-muted hover:bg-surface-soft"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={submit}
          className="rounded bg-amber-400 px-2.5 py-0.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-500"
        >
          Прикрепить
        </button>
      </div>
    </div>
  );
}
