import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BriefFact } from "@/lib/directorGate";

/**
 * 22.10 — как директор видит операцию на подтверждение.
 *
 * Заказчик: «максимально понятно, чтобы быстро вникнуть, что происходит,
 * и быстро принять решение». Поэтому: одна фраза «что произойдёт» крупно,
 * под ней факты строками (аренда, клиент, скутер, суммы), изменения — как
 * «было → стало»: старое зачёркнуто, новое выделено.
 */
export function OperationBrief({
  title,
  summary,
  facts,
  notes,
  warn,
  big = false,
}: {
  /** Вид операции: «Перенос техники в другую категорию». */
  title?: string;
  summary: string;
  facts: BriefFact[];
  /** Старые запросы (до 22.10): детали строками. */
  notes?: string[];
  warn?: string;
  big?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        {title && (
          <div className={cn("font-bold uppercase tracking-wider text-amber-700", big ? "text-[12px]" : "text-[10.5px]")}>
            {title}
          </div>
        )}
        <div className={cn("mt-1 font-bold leading-snug text-ink", big ? "text-[19px]" : "text-[15px]")}>
          {summary}
        </div>
      </div>
      {facts.length > 0 && (
        <dl className={cn("overflow-hidden rounded-2xl border border-border", big ? "text-[15px]" : "text-[13px]")}>
          {facts.map((f, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start justify-between gap-3 border-t border-border bg-surface px-3.5 first:border-t-0",
                big ? "py-3" : "py-2.5",
                f.from !== undefined && "bg-amber-50/50",
              )}
            >
              <dt className="shrink-0 text-muted">{f.label}</dt>
              <dd className="min-w-0 text-right font-semibold text-ink">
                {f.from !== undefined ? (
                  <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                    <span className="rounded-md bg-red-soft/70 px-1.5 py-0.5 text-red-ink line-through decoration-red-ink/60">
                      {f.from}
                    </span>
                    <ArrowRight size={big ? 16 : 14} className="shrink-0 text-muted-2" />
                    <span className="rounded-md bg-green-soft px-1.5 py-0.5 text-green-ink">{f.to}</span>
                  </span>
                ) : (
                  <span className="break-words">{f.value}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {notes && notes.length > 0 && (
        <ul className="flex flex-col gap-1">
          {notes.map((d, i) => (
            <li key={i} className={cn("flex gap-2 leading-snug text-muted", big ? "text-[14px]" : "text-[12px]")}>
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-2" />
              {d}
            </li>
          ))}
        </ul>
      )}
      {warn && <div className={cn("font-semibold text-amber-700", big ? "text-[14px]" : "text-[12px]")}>{warn}</div>}
    </div>
  );
}
