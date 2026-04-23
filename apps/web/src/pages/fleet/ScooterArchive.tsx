import { useMemo } from "react";
import { Archive, Bike, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/api/auth";
import {
  useApiScootersArchived,
  usePurgeScooter,
  useRestoreScooter,
} from "@/lib/api/scooters";
import type { ApiScooter } from "@/lib/api/types";

export function ScooterArchive() {
  const { data: items = [], isLoading } = useApiScootersArchived();
  const { data: me } = useMe();
  const canManage = me?.role === "director" || me?.role === "creator";

  const archived = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          new Date(b.archivedAt ?? b.createdAt).getTime() -
          new Date(a.archivedAt ?? a.createdAt).getTime(),
      ),
    [items],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[13px] text-muted">
        {isLoading
          ? "Загрузка…"
          : `${items.length} в архиве${
              items.some((x) => x.deletedAt)
                ? " · часть помечена к удалению (7 дней)"
                : ""
            }`}
      </div>

      {archived.length === 0 && !isLoading && (
        <div className="rounded-2xl bg-surface p-8 text-center text-muted shadow-card-sm">
          <Archive size={24} className="mx-auto mb-2" />
          Архив пуст.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {archived.map((s) => (
          <ArchiveRow
            key={s.id}
            scooter={s}
            canManage={canManage}
          />
        ))}
      </div>
    </div>
  );
}

function ArchiveRow({
  scooter: s,
  canManage,
}: {
  scooter: ApiScooter;
  canManage: boolean;
}) {
  const restore = useRestoreScooter();
  const purge = usePurgeScooter();

  const onRestore = () => {
    if (!confirm(`Вернуть «${s.name}» из архива?`)) return;
    restore.mutate(s.id);
  };
  const onPurge = () => {
    if (
      !confirm(
        `Пометить «${s.name}» к удалению? Через 7 дней скутер будет удалён навсегда. До истечения срока можно отменить кнопкой «Восстановить».`,
      )
    )
      return;
    purge.mutate(s.id);
  };

  const markedForDelete = !!s.deletedAt;
  const daysLeft = s.deletedAt ? daysUntilPurge(s.deletedAt) : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl bg-surface p-3 shadow-card-sm",
        markedForDelete && "ring-1 ring-red-400/40 bg-red-soft/40",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-muted-2">
        <Bike size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          {s.name}
          {markedForDelete && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-ink">
              <TriangleAlert size={10} />
              удаление через {daysLeft} дн
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-muted">
          {s.archivedBy ?? "система"} ·{" "}
          {s.archivedAt ? formatDate(s.archivedAt) : "—"}
          {s.deletedAt && <> · помечен к удалению {formatDate(s.deletedAt)}</>}
        </div>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onRestore}
          disabled={restore.isPending}
          title="Восстановить"
          className="inline-flex items-center gap-1.5 rounded-lg bg-surface-soft px-3 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-blue-50 hover:text-blue-700"
        >
          <RotateCcw size={13} /> Восстановить
        </button>
        {canManage && !markedForDelete && (
          <button
            type="button"
            onClick={onPurge}
            disabled={purge.isPending}
            title="Удалить навсегда (через 7 дней)"
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-soft px-3 py-1.5 text-[12px] font-semibold text-red-ink hover:bg-red hover:text-white"
          >
            <Trash2 size={13} /> Удалить
          </button>
        )}
      </div>
    </div>
  );
}

function daysUntilPurge(deletedAtIso: string): number {
  const delAt = new Date(deletedAtIso).getTime();
  const deadline = delAt + 7 * 24 * 3600 * 1000;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 86_400_000));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
