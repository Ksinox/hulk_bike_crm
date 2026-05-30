/**
 * v0.6 — список ВСЕХ дел-должников (а не только «очередь на сегодня»).
 *
 * Утренний экран показывает только горящее на сегодня; свежие/тихие дела
 * туда не попадают. Этот экран — полный реестр активных дел: директор
 * видит каждого должника и открывает дело в один клик.
 */
import { useState } from "react";
import { ArrowLeft, Plus, Phone } from "lucide-react";
import { useDebtorsList } from "@/lib/api/debtors";
import {
  TYPE_LABEL,
  STAGE_LABEL,
  formatRub,
  type DebtType,
} from "@/lib/debtors/types";

const TYPE_BG: Record<DebtType, string> = {
  dtp_guilty: "bg-red-50 text-red-700 border-red-100",
  dtp_victim: "bg-blue-50 text-blue-700 border-blue-100",
  damage: "bg-orange-50 text-orange-700 border-orange-100",
  theft: "bg-violet-50 text-violet-700 border-violet-100",
  rental_overdue: "bg-slate-50 text-slate-600 border-slate-200",
};
const TYPE_DOT: Record<DebtType, string> = {
  dtp_guilty: "bg-red-500",
  dtp_victim: "bg-blue-500",
  damage: "bg-orange-500",
  theft: "bg-violet-500",
  rental_overdue: "bg-slate-500",
};

export function DebtorsList({
  onOpenCase,
  onBack,
  onAddNew,
}: {
  onOpenCase: (id: number) => void;
  onBack: () => void;
  onAddNew: () => void;
}) {
  const [includeClosed, setIncludeClosed] = useState(false);
  const q = useDebtorsList({ closed: includeClosed });
  const items = q.data?.items ?? [];
  const totalSum = items
    .filter((d) => !d.stage.startsWith("closed_"))
    .reduce((s, d) => s + d.totalAmount, 0);

  return (
    <section className="rounded-[18px] bg-white p-7 shadow-card-sm">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="grid h-9 w-9 place-items-center rounded-[10px] border border-border text-muted hover:border-ink hover:text-ink"
            title="Назад"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="font-display text-[24px] font-bold leading-none text-ink">
              Все дела
            </h1>
            <div className="mt-1 text-[12.5px] text-muted">
              {items.length}{" "}
              {items.length === 1 ? "дело" : items.length < 5 ? "дела" : "дел"} ·
              активный долг{" "}
              <b className="text-ink">{formatRub(totalSum)}</b>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-muted">
            <input
              type="checkbox"
              checked={includeClosed}
              onChange={(e) => setIncludeClosed(e.target.checked)}
              className="h-3.5 w-3.5 accent-blue-600"
            />
            показать закрытые
          </label>
          <button
            type="button"
            onClick={onAddNew}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-ink px-3.5 text-[13px] font-semibold text-white hover:bg-[#16213a]"
          >
            <Plus size={14} /> Новое дело
          </button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="flex h-40 items-center justify-center text-muted">
          Загрузка…
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-muted">
          Дел нет.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((d) => {
            const closed = d.stage.startsWith("closed_");
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onOpenCase(d.id)}
                className={`grid grid-cols-[36px_1fr_auto_auto_auto] items-center gap-3.5 rounded-[12px] border border-border bg-white px-4 py-3 text-left transition-all hover:translate-x-1 hover:border-ink hover:shadow-card ${closed ? "opacity-60" : ""}`}
              >
                <div className="grid h-9 w-9 place-items-center rounded-full border border-border bg-gradient-to-br from-surface-tint to-surface-soft text-[12px] font-semibold text-ink">
                  {(d.clientName ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold leading-[1.2] text-ink">
                    {d.clientName ?? "—"}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
                    <span className="font-mono uppercase tracking-[0.04em]">
                      {d.caseNumber}
                    </span>
                    {d.clientPhone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone size={11} /> {d.clientPhone}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold ${TYPE_BG[d.type]}`}
                >
                  <i className={`inline-block h-1.5 w-1.5 rounded-full ${TYPE_DOT[d.type]}`} />
                  {TYPE_LABEL[d.type]}
                </span>
                <span className="rounded-full bg-surface-soft px-2.5 py-1 text-[11.5px] font-medium text-muted">
                  {STAGE_LABEL[d.stage]}
                </span>
                <div className="text-right font-display text-[16px] font-semibold tracking-[-0.01em] text-ink tabular-nums">
                  {formatRub(d.totalAmount)}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
