import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDamageRevisions } from "@/lib/api/damage-reports";

/**
 * Этап 2 — история правок акта + статус целостности хэш-цепочки. Показывает
 * каждую ревизию (снимок) с автором/датой/суммой и подтверждает, что цепочка
 * не нарушена (защита от подделки). Грузится лениво при раскрытии.
 */
function fmtMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}
function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AGREEMENT_SHORT: Record<string, string> = {
  pending: "на согласовании",
  agreed: "согласовано",
  disputed: "спор",
};

export function DamageRevisionHistory({ reportId }: { reportId: number }) {
  const { data, isLoading } = useDamageRevisions(reportId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-[12px] text-muted-2">
        <Loader2 size={14} className="animate-spin" /> Загружаем историю…
      </div>
    );
  }

  const revs = data?.revisions ?? [];
  if (revs.length === 0) {
    return (
      <div className="rounded-lg bg-surface-soft px-3 py-2 text-[12px] text-muted-2">
        Правок не было — акт в исходной редакции.
      </div>
    );
  }

  const ok = data?.integrity?.ok ?? true;
  const brokenAt = data?.integrity?.brokenAt ?? null;

  return (
    <div className="flex flex-col gap-2">
      {/* Статус целостности — главная защита от подделки. */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold",
          ok ? "bg-green-soft text-green-ink" : "bg-red-soft text-red-ink",
        )}
      >
        {ok ? (
          <ShieldCheck size={15} className="shrink-0" />
        ) : (
          <ShieldAlert size={15} className="shrink-0" />
        )}
        {ok
          ? "Целостность подтверждена — цепочка ревизий не нарушена"
          : `Цепочка нарушена на ревизии ${brokenAt} — возможна подделка!`}
      </div>

      <ol className="flex flex-col gap-1.5">
        {[...revs].reverse().map((r, idx) => {
          const isCurrent = idx === 0;
          return (
            <li
              key={r.id}
              className={cn(
                "flex items-start gap-2 rounded-lg px-3 py-2",
                isCurrent ? "bg-blue-50" : "bg-surface-soft",
              )}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white">
                {r.revisionNo}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-ink">
                  Ревизия {r.revisionNo}
                  {isCurrent && (
                    <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      текущая
                    </span>
                  )}
                  {r.revisionNo === 1 && (
                    <span className="text-[10px] font-medium text-muted-2">
                      · создание
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-2">
                  {fmtWhen(r.createdAt)} · {r.editedByUserName ?? "—"} ·{" "}
                  {AGREEMENT_SHORT[r.clientAgreement] ?? r.clientAgreement}
                </div>
              </div>
              <div className="shrink-0 text-[13px] font-bold tabular-nums text-ink">
                {fmtMoney(r.total)} ₽
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
