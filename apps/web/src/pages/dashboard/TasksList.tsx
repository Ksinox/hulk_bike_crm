import { ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Пока модуль задач не реализован — блок всегда пустой.
 * Показываем компактную полосу, чтобы не занимать экран.
 * Когда задачи появятся — вернём полноценную карточку со списком.
 */
export function TasksList({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-2.5 shadow-card",
        className,
      )}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-muted-2">
        <ClipboardCheck size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-ink">Задачи на сегодня</div>
        <div className="text-[11px] text-muted">Задач нет — модуль появится позже</div>
      </div>
      <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
        скоро
      </span>
    </div>
  );
}
