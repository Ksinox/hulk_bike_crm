/**
 * v0.8.12 — стопка стикеров-«наклеек» поверх карточки.
 *
 * Жёлтые бумажные заметки, приклеенные слегка небрежно (наклон + «скотч» +
 * тень). Несколько штук складываются стопкой с нахлёстом; при наведении
 * стикер выпрямляется, увеличивается и выходит на передний план (z-index).
 * «×» — снять заметку. «+ Заметка» — прикрепить новую.
 *
 * Вдохновлено CSS3 sticky-notes (habr 136238): rotate + box-shadow +
 * transition transform, hover → scale + z-index.
 */
import { useState } from "react";
import { X, Plus, StickyNote, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteSticker } from "@/lib/api/stickers";

const ROTATIONS = ["-2deg", "1.6deg", "-1deg", "2.4deg", "-2.6deg", "0.8deg"];

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
  onAdd,
  onDismiss,
  className,
}: {
  stickers: NoteSticker[];
  onAdd?: (text: string) => void;
  onDismiss?: (id: number) => void;
  className?: string;
}) {
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");

  const submit = () => {
    const t = text.trim();
    if (t && onAdd) onAdd(t);
    setText("");
    setComposing(false);
  };

  return (
    <div className={cn("flex w-[200px] flex-col items-stretch", className)}>
      {stickers.map((s, i) => (
        <Sticker
          key={s.id}
          sticker={s}
          rotate={ROTATIONS[i % ROTATIONS.length]}
          overlap={i > 0}
          onDismiss={onDismiss}
        />
      ))}

      {onAdd &&
        (composing ? (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 shadow-card-sm">
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                if (e.key === "Escape") {
                  setComposing(false);
                  setText("");
                }
              }}
              rows={3}
              placeholder="Текст заметки…"
              className="w-full resize-none bg-transparent text-[12px] text-amber-950 outline-none placeholder:text-amber-700/50"
            />
            <div className="mt-1 flex justify-end gap-1">
              <button
                type="button"
                onClick={() => {
                  setComposing(false);
                  setText("");
                }}
                className="rounded px-2 py-0.5 text-[11px] text-amber-700 hover:bg-amber-100"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={submit}
                className="rounded bg-amber-400 px-2 py-0.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-500"
              >
                Прикрепить
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            title="Добавить заметку"
            className="mt-2 inline-flex items-center justify-center gap-1 self-end rounded-full border border-dashed border-amber-300 bg-amber-50/70 px-2.5 py-1 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100"
          >
            <Plus size={12} /> Заметка
          </button>
        ))}
    </div>
  );
}

function Sticker({
  sticker,
  rotate,
  overlap,
  onDismiss,
}: {
  sticker: NoteSticker;
  rotate: string;
  overlap: boolean;
  onDismiss?: (id: number) => void;
}) {
  const isContact = sticker.kind === "contact";
  return (
    <div
      style={{ ["--rot" as string]: rotate, marginTop: overlap ? -26 : 0 }}
      className={cn(
        "group/sticker relative rounded-[3px] px-3 pb-2 pt-2.5 shadow-[3px_5px_10px_rgba(0,0,0,0.20)]",
        "[transform:rotate(var(--rot))] transition-transform duration-200 ease-out",
        "hover:z-20 hover:scale-[1.07] hover:[transform:rotate(0deg)_scale(1.07)]",
        isContact ? "bg-orange-200" : "bg-amber-200",
      )}
    >
      {/* полупрозрачный «скотч» сверху по центру */}
      <span className="pointer-events-none absolute -top-2 left-1/2 h-3.5 w-12 -translate-x-1/2 rotate-1 bg-white/35 shadow-sm" />

      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(sticker.id)}
          title="Снять заметку"
          className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-amber-900/50 opacity-0 transition-opacity hover:bg-amber-300 hover:text-amber-950 group-hover/sticker:opacity-100"
        >
          <X size={11} />
        </button>
      )}

      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-800/70">
        {isContact ? <PhoneOff size={10} /> : <StickyNote size={10} />}
        {isContact ? "Связь" : "Заметка"}
      </div>
      <div className="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] font-medium leading-snug text-amber-950">
        {sticker.text}
      </div>
      <div className="mt-1 text-[9.5px] text-amber-800/60">
        {sticker.createdByName ?? "—"} · {fmtDate(sticker.createdAt)}
      </div>
    </div>
  );
}
