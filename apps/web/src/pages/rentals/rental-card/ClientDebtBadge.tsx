import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowUpRight, FileText, Wallet } from "lucide-react";
import type { ClientDebtSource } from "@/lib/api/clients";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}
function dm(iso: string): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}` : "";
}

/**
 * C2: компактный значок-алёрт о долге в блоке «Информация о клиенте» —
 * по аналогии с ключом на блоке скутера. Сам по себе сигнал «что-то не так»,
 * не сдвигает контент карточки большими баннерами. При наведении —
 * поповер: долг с прошлых аренд (клик → тело аренды-источника) + текущий
 * ущерб, и действия (досудебная претензия, внести платёж — через «Принять
 * платёж»). Пусто (нет долгов) → не рендерим.
 */
export function ClientDebtBadge({
  crossSources,
  currentDamage,
  onClaim,
  onPay,
  onOpenSource,
}: {
  /** Долг по ДРУГИМ арендам клиента (ущерб переехал с клиентом). */
  crossSources: ClientDebtSource[];
  /** Незакрытый ущерб ПО ЭТОЙ аренде (сумма по актам). */
  currentDamage: number;
  /** Распечатать досудебную претензию (по текущему ущербу). */
  onClaim?: () => void;
  /** Внести платёж — открывает «Принять платёж». */
  onPay: () => void;
  /** Открыть тело аренды-источника долга. */
  onOpenSource: (rentalId: number) => void;
}) {
  const crossTotal = crossSources.reduce((s, x) => s + x.amount, 0);
  const total = currentDamage + crossTotal;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  if (total <= 0) return null;

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      // Прижимаем к экрану: на узких (мобильных) вьюпортах поповер 280–360px
      // не должен вылезать за правый край.
      const vw = window.innerWidth;
      const left = Math.max(8, Math.min(r.left, vw - 296));
      setPos({ top: r.bottom, left });
    }
    setOpen(true);
  };

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={show}
        title="У клиента есть долг — наведите для деталей"
        className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-soft px-2 py-0.5 text-[12px] font-bold text-red-ink transition-colors hover:border-red-400 hover:bg-red-100"
      >
        <AlertTriangle size={12} className="shrink-0" />
        <span className="tabular-nums">{fmt(total)} ₽ долг</span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            style={{
              position: "fixed",
              top: pos.top + 6,
              left: pos.left,
              minWidth: 280,
              maxWidth: 360,
              zIndex: 1000,
            }}
            className="rounded-xl border border-border bg-surface p-3 text-[12px] text-ink-2 shadow-card-lg"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-bold text-red-ink">
                <AlertTriangle size={13} /> Долги клиента
              </span>
              <span className="font-extrabold tabular-nums text-red-ink">
                {fmt(total)} ₽
              </span>
            </div>

            {/* Долг с прошлых аренд (переехал с клиентом) */}
            {crossSources.length > 0 && (
              <div className="mb-1.5 flex flex-col gap-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
                  С прошлых аренд
                </div>
                {crossSources.map((s) => (
                  <button
                    key={s.rentalId}
                    type="button"
                    onClick={() => onOpenSource(s.rentalId)}
                    title={`Открыть аренду #${String(s.rentalId).padStart(4, "0")}`}
                    className="group flex items-center gap-2 rounded-lg border border-border bg-surface-soft/50 px-2 py-1.5 text-left transition-colors hover:border-red-300 hover:bg-red-soft/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-semibold text-ink">
                        {s.scooterName}{" "}
                        <span className="font-mono text-[10px] text-muted-2">
                          #{String(s.rentalId).padStart(4, "0")}
                        </span>
                      </div>
                      <div className="truncate text-[11px] text-muted">
                        {s.label} · {dm(s.startIso)}–{dm(s.endPlannedIso)}
                      </div>
                    </div>
                    <span className="shrink-0 text-[12px] font-bold tabular-nums text-red-ink">
                      {fmt(s.amount)} ₽
                    </span>
                    <ArrowUpRight
                      size={13}
                      className="shrink-0 text-muted-2 transition-colors group-hover:text-red-600"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Текущий ущерб по этой аренде */}
            {currentDamage > 0 && (
              <div className="mb-2 flex items-center justify-between rounded-lg border border-border bg-surface-soft/50 px-2 py-1.5">
                <span className="text-[12px] font-semibold text-ink">
                  Ущерб по этой аренде
                </span>
                <span className="text-[12px] font-bold tabular-nums text-red-ink">
                  {fmt(currentDamage)} ₽
                </span>
              </div>
            )}

            {/* Действия — всё через «Принять платёж» */}
            <div className="flex items-center gap-2 border-t border-border pt-2">
              {currentDamage > 0 && onClaim && (
                <button
                  type="button"
                  onClick={onClaim}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-red-300 bg-surface px-2.5 py-2 text-[12px] font-bold text-red-700 transition-colors hover:bg-red-50"
                >
                  <FileText size={13} /> Досудебная
                </button>
              )}
              <button
                type="button"
                onClick={onPay}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-red-600 px-2.5 py-2 text-[12px] font-bold text-white transition-colors hover:bg-red-700"
              >
                <Wallet size={13} /> Внести платёж
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
