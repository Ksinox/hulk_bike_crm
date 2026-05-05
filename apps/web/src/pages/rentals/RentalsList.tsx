import { cn } from "@/lib/utils";
import {
  PAYMENT_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  type Rental,
} from "@/lib/mock/rentals";
import { initialsOf } from "@/lib/mock/clients";
import { useClientPhoto } from "@/pages/clients/clientStore";
import { useApiClients } from "@/lib/api/clients";

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

const TONE_PILL: Record<string, string> = {
  green: "bg-green-soft text-green-ink",
  red: "bg-red-soft text-red-ink",
  orange: "bg-orange-soft text-orange-ink",
  blue: "bg-blue-50 text-blue-700",
  purple: "bg-purple-soft text-purple-ink",
  gray: "bg-surface-soft text-muted",
};

export function RentalsList({
  items,
  selectedId,
  onSelect,
}: {
  items: Rental[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 rounded-2xl bg-surface p-8 text-center shadow-card-sm">
        <div className="text-2xl">🔍</div>
        <div className="text-[14px] font-semibold text-ink">
          Аренд не найдено
        </div>
        <div className="text-[12px] text-muted">
          Попробуйте другой фильтр или запрос
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-surface shadow-card-sm">
      <div className="scrollbar-thin max-h-[calc(100vh-340px)] overflow-y-auto overflow-x-hidden px-1.5 py-14">
        {items.map((r) => (
          <RentalRow
            key={r.id}
            rental={r}
            active={r.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-14 backdrop-blur-[3px]"
        style={{
          background:
            "linear-gradient(to bottom, hsl(var(--surface)) 0%, hsl(var(--surface) / 0.85) 40%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 50%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, black 0%, black 50%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 backdrop-blur-[3px]"
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

function RentalRow({
  rental: r,
  active,
  onSelect,
}: {
  rental: Rental;
  active: boolean;
  onSelect: (id: number) => void;
}) {
  const { data: apiClients } = useApiClients();
  const c = apiClients?.find((x) => x.id === r.clientId);
  const photo = useClientPhoto(r.clientId);
  const tone = STATUS_TONE[r.status];
  const isIssue =
    r.status === "overdue" ||
    r.status === "police" ||
    r.status === "court" ||
    r.status === "completed_damage";

  const accent = !active
    ? isIssue
      ? "before:bg-red"
      : r.status === "returning"
        ? "before:bg-orange"
        : r.status === "active"
          ? "before:bg-green"
          : r.status === "new_request" || r.status === "meeting"
            ? "before:bg-blue"
            : "before:bg-transparent"
    : "before:bg-transparent";

  return (
    <button
      type="button"
      onClick={() => onSelect(r.id)}
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
            : "bg-surface-soft text-ink-2",
        )}
      >
        {photo?.thumbUrl ? (
          <img
            src={photo.thumbUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : c ? (
          initialsOf(c.name)
        ) : (
          "?"
        )}
      </span>

      {/* v0.4.4: ФИО занимает всю строку и может переноситься на 2 строки.
          Раньше id (#0082) стоял рядом с именем и забирал место → длинные
          ФИО («Захарченко Максимилиан Валерьевич») обрезались многоточием.
          Теперь id и статус-пилюля живут в правой колонке, а имя — на всю
          доступную ширину с line-clamp-2. */}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-[13px] font-semibold leading-tight break-words",
            // line-clamp-2 — переносим на 2 строки, после многоточие
            "line-clamp-2",
            active ? "text-white" : "text-ink",
          )}
          title={c?.name ?? undefined}
        >
          {c?.name ?? "Клиент #" + r.clientId}
        </div>
        <div
          className={cn(
            "mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-tight",
            active ? "text-white/80" : "text-muted-2",
          )}
        >
          <span className="font-semibold">{r.scooter}</span>
          <span className="opacity-40">·</span>
          <span className="tabular-nums">
            {r.start.slice(0, 5)} — {r.endPlanned.slice(0, 5)}
          </span>
          {r.rate > 0 && (
            <>
              <span className="opacity-40">·</span>
              <span className="tabular-nums">{fmt(r.rate)} ₽/сут</span>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 self-stretch flex flex-col items-end justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-[10px] tabular-nums",
              active ? "text-white/70" : "text-muted-2",
            )}
          >
            #{String(r.id).padStart(4, "0")}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
              active ? "bg-white/20 text-white" : TONE_PILL[tone],
            )}
          >
            {STATUS_LABEL[r.status]}
          </span>
        </div>
        <div className="text-right">
          <div
            className={cn(
              "text-[12px] font-bold tabular-nums",
              active ? "text-white" : "text-ink",
            )}
          >
            {r.sum > 0 ? `${fmt(r.sum)} ₽` : "—"}
          </div>
          <div
            className={cn(
              "text-[10px]",
              active ? "text-white/70" : "text-muted-2",
            )}
          >
            {PAYMENT_LABEL[r.paymentMethod]}
          </div>
        </div>
      </div>
    </button>
  );
}
