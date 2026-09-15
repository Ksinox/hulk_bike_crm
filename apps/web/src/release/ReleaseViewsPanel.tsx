import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/api/auth";
import { useReleaseViewRows, type ReleaseViewRow } from "@/lib/api/releases";
import { RELEASE_TOUR } from "./tour";
import { tourCards } from "./ReleaseTour";

/**
 * «Кто посмотрел обновление» (15.09) — директору в «Сотрудниках». Отметки
 * хранятся на сервере у каждого аккаунта: смена устройства ничего не
 * сбрасывает, видно, до кого обновление не дошло.
 */
export function ReleaseViewsPanel({ compact = false }: { compact?: boolean }) {
  const { data: me } = useMe();
  const canSee = me?.role === "creator" || me?.role === "director";
  const q = useReleaseViewRows(RELEASE_TOUR.version, canSee);
  const rows = useMemo(
    () => (q.data ?? []).filter((r) => r.role !== "creator"),
    [q.data],
  );
  if (!canSee || rows.length === 0) return null;

  const done = rows.filter((r) => r.status === "completed").length;

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-card-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#6CAD2F]/15 text-[#4d8a1c]">
          <Sparkles size={16} />
        </span>
        <h2 className="font-display text-[16px] font-extrabold text-ink">
          Обновление {RELEASE_TOUR.label}: кто посмотрел
        </h2>
        <span className="ml-auto rounded-full bg-surface-soft px-2.5 py-1 text-[12px] font-bold tabular-nums text-muted">
          {done} из {rows.length}
        </span>
      </div>
      <div className={cn("mt-3 grid gap-2", !compact && "lg:grid-cols-2")}>
        {rows.map((r) => (
          <Row key={r.userId} row={r} />
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-snug text-muted-2">
        Отложенное обновление вернётся к человеку при следующем входе — напоминать не нужно.
      </p>
    </section>
  );
}

function Row({ row }: { row: ReleaseViewRow }) {
  const isManager = row.role === "director";
  const total = tourCards("desktop", isManager).length;
  const seen = Math.min(row.cardsSeen ?? 0, total);
  const pct = total > 0 ? Math.round((seen / total) * 100) : 0;
  const chip =
    row.status === "completed"
      ? { text: "Всё посмотрел", cls: "bg-green-soft text-green-ink" }
      : row.status === "postponed" && (row.postponedCount ?? 0) > 0
        ? {
            text: `Отложил ${row.postponedCount} ${row.postponedCount === 1 ? "раз" : "раза"}`,
            cls: "bg-amber-100 text-amber-800",
          }
        : row.status === "postponed"
          ? { text: "Смотрит", cls: "bg-blue-50 text-blue-700" }
          : row.staffKind === "new"
            ? { text: "Новый — не показываем", cls: "bg-surface-soft text-muted" }
            : { text: "Ещё не открывал", cls: "bg-surface-soft text-muted" };
  const when = row.completedAt ?? row.updatedAt;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-soft/60 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-bold text-ink">{row.name}</div>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-border">
            <div
              className={cn("h-full rounded-full", row.status === "completed" ? "bg-green-ink" : "bg-amber-500")}
              style={{ width: `${row.status === "completed" ? 100 : pct}%` }}
            />
          </div>
          <span className="text-[11.5px] tabular-nums text-muted">
            Карточки {row.status === "completed" ? total : seen} из {total}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold", chip.cls)}>
          {chip.text}
        </span>
        {when && (
          <span className="text-[11px] tabular-nums text-muted-2">
            {new Date(when).toLocaleString("ru-RU", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
    </div>
  );
}
