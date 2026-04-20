import { cn } from "@/lib/utils";
import {
  avatarColorIndex,
  initialsOf,
  SOURCE_LABEL,
  type Client,
} from "@/lib/mock/clients";
import { useClientPhoto } from "./clientStore";

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-green-soft text-green-ink",
  "bg-orange-soft text-orange-ink",
  "bg-purple-soft text-purple-ink",
  "bg-red-soft text-red-ink",
  "bg-yellow-100 text-yellow-700",
];

function avatarClass(id: number) {
  return AVATAR_COLORS[avatarColorIndex(id) - 1] ?? AVATAR_COLORS[0];
}

function ratingToneClass(r: number) {
  if (r >= 80) return "text-green-ink bg-green-soft";
  if (r >= 50) return "text-ink bg-surface-soft";
  return "text-red-ink bg-red-soft";
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
    <div className="overflow-hidden rounded-2xl bg-surface shadow-card-sm">
      <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
        {items.map((c) => (
          <ClientRow
            key={c.id}
            client={c}
            active={c.id === selectedId}
            hasSelection={selectedId != null}
            onSelect={onSelect}
          />
        ))}
      </div>
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
  hasSelection: boolean;
  onSelect: (id: number) => void;
}) {
  const photo = useClientPhoto(c.id);
  const hasDebt = c.debt > 0 && !c.blacklisted;
  const rowBg = active
    ? "bg-blue-600 text-white"
    : c.blacklisted
      ? "bg-red-soft/40 hover:bg-red-soft/70"
      : hasDebt
        ? "bg-orange-soft/25 hover:bg-orange-soft/50"
        : "hover:bg-surface-soft";
  const accent = active
    ? "before:bg-blue-600"
    : c.blacklisted
      ? "before:bg-red"
      : hasDebt
        ? "before:bg-orange"
        : "before:bg-transparent";
  return (
    <button
      type="button"
      onClick={() => onSelect(c.id)}
      className={cn(
        "relative flex w-full origin-center transform-gpu items-center gap-3 border-b border-border/60 px-3 py-2.5 pl-4 text-left transition-all last:border-b-0",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-1",
        rowBg,
        accent,
        !active && "hover:z-[5] hover:scale-[1.01] hover:shadow-card-sm",
        active &&
          "z-20 scale-[1.04] rounded-[12px] border-b-0 py-3 shadow-card-lg ring-2 ring-blue-600",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-bold",
          active
            ? "bg-white/20 text-white"
            : c.blacklisted
              ? "bg-red text-white"
              : avatarClass(c.id),
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
        <div
          className={cn(
            "truncate text-[13px] font-semibold",
            active
              ? cn("text-white", c.blacklisted && "line-through decoration-white/70")
              : c.blacklisted
                ? "text-red-ink line-through decoration-red/60"
                : "text-ink",
          )}
        >
          {c.name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {c.blacklisted ? (
            <Pill tone="red" active={active}>🚫 ч/с</Pill>
          ) : hasDebt ? (
            <Pill tone="red" active={active}>
              ⚠ долг {c.debt.toLocaleString("ru-RU")} ₽
            </Pill>
          ) : c.rents > 0 ? (
            <Pill tone="green" active={active}>{c.rents} аренд.</Pill>
          ) : null}
          <Pill tone="muted" active={active}>{SOURCE_LABEL[c.source]}</Pill>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <span
          className={cn(
            "inline-flex min-w-[28px] items-center justify-center rounded-md px-1.5 py-0.5 text-[12px] font-bold tabular-nums",
            active ? "bg-white/20 text-white" : ratingToneClass(c.rating),
          )}
        >
          {c.rating}
        </span>
        <div
          className={cn(
            "mt-0.5 text-[11px] tabular-nums",
            active ? "text-white/80" : "text-muted-2",
          )}
        >
          {c.phone}
        </div>
      </div>
    </button>
  );
}

function Pill({
  tone,
  active,
  children,
}: {
  tone: "red" | "green" | "muted";
  active?: boolean;
  children: React.ReactNode;
}) {
  const toneClass = active
    ? "bg-white/20 text-white"
    : tone === "red"
      ? "bg-red-soft text-red-ink"
      : tone === "green"
        ? "bg-green-soft text-green-ink"
        : "bg-surface-soft text-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
        toneClass,
      )}
    >
      {children}
    </span>
  );
}
