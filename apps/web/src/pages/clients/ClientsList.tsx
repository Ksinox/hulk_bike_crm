import { AlertTriangle, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  initialsOf,
  SOURCE_LABEL,
  type Client,
} from "@/lib/mock/clients";
import { useClientPhoto } from "./clientStore";

function ratingToneClass(r: number, active: boolean) {
  if (active) return "text-white";
  if (r >= 80) return "text-green-ink";
  if (r >= 50) return "text-ink-2";
  return "text-red-ink";
}

export function ClientsList({
  items,
  selectedId,
  onSelect,
}: {
  items: Client[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 rounded-2xl bg-surface p-8 text-center shadow-card-sm">
        <div className="text-2xl">🔍</div>
        <div className="text-[14px] font-semibold text-ink">
          Клиент не найден
        </div>
        <div className="text-[12px] text-muted">Проверьте имя или телефон</div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-surface shadow-card-sm">
      <div className="scrollbar-thin max-h-[calc(100vh-260px)] overflow-y-auto overflow-x-hidden px-1.5 py-16">
        {items.map((c) => (
          <ClientRow
            key={c.id}
            client={c}
            active={c.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>

      {/* Top fade + blur */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-14 z-10 backdrop-blur-[3px]"
        style={{
          background:
            "linear-gradient(to bottom, hsl(var(--surface)) 0%, hsl(var(--surface) / 0.85) 40%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 50%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, black 0%, black 50%, transparent 100%)",
        }}
      />

      {/* Bottom fade + blur */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-14 z-10 backdrop-blur-[3px]"
        style={{
          background:
            "linear-gradient(to top, hsl(var(--surface)) 0%, hsl(var(--surface) / 0.85) 40%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to top, black 0%, black 50%, transparent 100%)",
          maskImage:
            "linear-gradient(to top, black 0%, black 50%, transparent 100%)",
        }}
      />
    </div>
  );
}

function ClientRow({
  client: c,
  active,
  onSelect,
}: {
  client: Client;
  active: boolean;
  onSelect: (id: number) => void;
}) {
  const photo = useClientPhoto(c.id);
  const hasDebt = c.debt > 0 && !c.blacklisted;

  const accent =
    !active && c.blacklisted
      ? "before:bg-red"
      : !active && hasDebt
        ? "before:bg-orange"
        : "before:bg-transparent";

  return (
    <button
      type="button"
      onClick={() => onSelect(c.id)}
      className={cn(
        "relative flex w-full origin-center transform-gpu items-center gap-3 border-b border-border/60 px-3 py-2.5 pl-4 text-left transition-all last:border-b-0",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px]",
        accent,
        !active && "hover:z-[5] hover:bg-surface-soft",
        active &&
          "z-20 rounded-[12px] border-b-0 bg-blue-600 py-3 text-white shadow-card-lg",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-bold",
          active
            ? "bg-white/20 text-white"
            : c.blacklisted
              ? "bg-red-soft text-red-ink"
              : "bg-surface-soft text-ink-2",
        )}
      >
        {photo?.thumbUrl ? (
          <img
            src={photo.thumbUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : c.blacklisted ? (
          "✕"
        ) : (
          initialsOf(c.name)
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-[13px] font-semibold",
              active
                ? cn(
                    "text-white",
                    c.blacklisted && "line-through decoration-white/70",
                  )
                : c.blacklisted
                  ? "text-ink line-through decoration-red/60"
                  : "text-ink",
            )}
          >
            {c.name}
          </span>
        </div>
        <div
          className={cn(
            "mt-0.5 flex items-center gap-2 text-[11px]",
            active ? "text-white/80" : "text-muted-2",
          )}
        >
          {c.blacklisted ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 font-semibold",
                active ? "text-white" : "text-red-ink",
              )}
            >
              <Ban size={11} /> чёрный список
            </span>
          ) : hasDebt ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 font-semibold",
                active ? "text-white" : "text-red-ink",
              )}
            >
              <AlertTriangle size={11} />
              долг {c.debt.toLocaleString("ru-RU")} ₽
            </span>
          ) : c.rents > 0 ? (
            <span className="font-semibold">
              {c.rents} аренд.
            </span>
          ) : (
            <span className="opacity-60">—</span>
          )}
          <span className="opacity-40">·</span>
          <span>{SOURCE_LABEL[c.source]}</span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div
          className={cn(
            "text-[13px] font-bold tabular-nums",
            ratingToneClass(c.rating, active),
          )}
        >
          {c.rating}
        </div>
        <div
          className={cn(
            "text-[11px] tabular-nums",
            active ? "text-white/70" : "text-muted-2",
          )}
        >
          {c.phone}
        </div>
      </div>
    </button>
  );
}
