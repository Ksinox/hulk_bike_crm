import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { useClientDebtSources } from "@/lib/api/clients";

/**
 * F3: сквозной долг клиента. Незакрытый долг (сейчас — по ущербу) «переезжает»
 * с клиентом: на ЛЮБОЙ его аренде показываем плашку с долгом из ДРУГИХ аренд.
 * Источник долга виден сразу (скутер · период · «Ущерб: фары»), при наведении —
 * полная подпись, клик открывает тело той аренды (карточка с периодом, скутером,
 * экипировкой, суммой).
 *
 * Долг самой текущей аренды (её цепочки) сюда НЕ попадает — он уже в KPI «Долг».
 * Пусто → не рендерим.
 */
export function CrossRentalDebtBanner({
  clientId,
  currentChainIds,
  onOpenSource,
}: {
  clientId: number | null | undefined;
  /** ID аренд текущей цепочки — их долг показан в KPI «Долг», здесь исключаем. */
  currentChainIds: number[];
  /** Открыть тело аренды-источника (drawer.openRentalChain). */
  onOpenSource: (rentalId: number) => void;
}) {
  const { data: sources } = useClientDebtSources(clientId);
  const others = (sources ?? []).filter(
    (s) => !currentChainIds.includes(s.rentalId),
  );
  if (others.length === 0) return null;
  const total = others.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="rounded-[10px] border border-red-300 bg-red-soft/40 px-3 py-2.5 text-red-ink">
      <div className="mb-1.5 flex items-center gap-2">
        <ShieldAlert size={14} className="shrink-0 text-red-600" />
        <span className="text-[12px] font-bold">
          Долг клиента по другим арендам
        </span>
        <span className="ml-auto shrink-0 text-[13px] font-extrabold tabular-nums">
          {fmt(total)} ₽
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {others.map((s) => {
          const period = fmtPeriod(s.startIso, s.endPlannedIso);
          const num = `#${String(s.rentalId).padStart(4, "0")}`;
          return (
            <button
              key={s.rentalId}
              type="button"
              onClick={() => onOpenSource(s.rentalId)}
              title={`Открыть аренду ${num} — ${s.label}. Скутер ${s.scooterName}, период ${period}.`}
              className="group flex items-center gap-2 rounded-lg border border-red-200/70 bg-surface/70 px-2.5 py-1.5 text-left transition-colors hover:border-red-300 hover:bg-surface"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                  <span className="truncate">{s.scooterName}</span>
                  <span className="shrink-0 font-mono text-[10px] font-medium text-muted-2">
                    {num}
                  </span>
                  {s.archived && (
                    <span className="shrink-0 rounded bg-surface-soft px-1 py-px text-[9px] font-bold uppercase tracking-wide text-muted-2">
                      архив
                    </span>
                  )}
                </div>
                <div className="truncate text-[11px] text-muted">
                  {s.label} · {period}
                </div>
              </div>
              <span className="shrink-0 text-[13px] font-bold tabular-nums text-red-ink">
                {fmt(s.amount)} ₽
              </span>
              <ArrowUpRight
                size={14}
                className="shrink-0 text-muted-2 transition-colors group-hover:text-red-600"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

/** ISO → «DD.MM–DD.MM» (период аренды-источника). */
function fmtPeriod(startIso: string, endIso: string): string {
  return `${dm(startIso)}–${dm(endIso)}`;
}
function dm(iso: string): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}` : "";
}
