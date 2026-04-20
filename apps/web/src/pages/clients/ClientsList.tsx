import { cn } from "@/lib/utils";
import {
  avatarColorIndex,
  initialsOf,
  SOURCE_LABEL,
  type Client,
} from "@/lib/mock/clients";

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
        {items.map((c) => {
          const active = c.id === selectedId;
          const hasDebt = c.debt > 0 && !c.blacklisted;
          const rowBg = c.blacklisted
            ? active
              ? "bg-red-soft/80"
              : "bg-red-soft/40 hover:bg-red-soft/70"
            : hasDebt
              ? active
                ? "bg-orange-soft/60"
                : "bg-orange-soft/25 hover:bg-orange-soft/50"
              : active
                ? "bg-blue-50"
                : "hover:bg-surface-soft";
          const accent = c.blacklisted
            ? "before:bg-red"
            : hasDebt
              ? "before:bg-orange"
              : "before:bg-transparent";
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                "relative flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 pl-4 text-left transition-colors last:border-b-0",
                "before:absolute before:left-0 before:top-0 before:h-full before:w-1",
                rowBg,
                accent,
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                  c.blacklisted ? "bg-red text-white" : avatarClass(c.id),
                )}
              >
                {c.blacklisted ? "✕" : initialsOf(c.name)}
              </span>

              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "truncate text-[13px] font-semibold",
                    c.blacklisted
                      ? "text-red-ink line-through decoration-red/60"
                      : "text-ink",
                  )}
                >
                  {c.name}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {c.blacklisted ? (
                    <Pill tone="red">🚫 ч/с</Pill>
                  ) : hasDebt ? (
                    <Pill tone="red">
                      ⚠ долг {c.debt.toLocaleString("ru-RU")} ₽
                    </Pill>
                  ) : c.rents > 0 ? (
                    <Pill tone="green">{c.rents} аренд.</Pill>
                  ) : null}
                  <Pill tone="muted">{SOURCE_LABEL[c.source]}</Pill>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <span
                  className={cn(
                    "inline-flex min-w-[28px] items-center justify-center rounded-md px-1.5 py-0.5 text-[12px] font-bold tabular-nums",
                    ratingToneClass(c.rating),
                  )}
                >
                  {c.rating}
                </span>
                <div className="mt-0.5 text-[11px] text-muted-2 tabular-nums">
                  {c.phone.replace("+7 ", "")}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "red" | "green" | "muted";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "red"
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
