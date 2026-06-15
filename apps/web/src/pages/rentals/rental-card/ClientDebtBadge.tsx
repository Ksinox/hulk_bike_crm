import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import type { ClientDebtSource } from "@/lib/api/clients";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}
function dm(iso: string): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}` : "";
}

/**
 * C2/R2: компактный значок-алёрт в блоке «Информация о клиенте» о СКВОЗНОМ
 * долге — том, что тянется ЗА КЛИЕНТОМ с прошлых аренд (ущерб переехал после
 * возврата). Ущерб/просрочка ТЕКУЩЕЙ аренды сюда НЕ входят — они в KPI «Долг».
 * При наведении — поповер со списком источников: клик открывает тело той
 * аренды (там и оплатить/досудебная). Нет сквозного долга → не рендерим.
 */
export function ClientDebtBadge({
  crossSources,
  onOpenSource,
}: {
  /** Долг по ДРУГИМ (прошлым) арендам клиента. */
  crossSources: ClientDebtSource[];
  /** Открыть тело аренды-источника долга. */
  onOpenSource: (rentalId: number) => void;
}) {
  const total = crossSources.reduce((s, x) => s + x.amount, 0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  if (total <= 0 || crossSources.length === 0) return null;

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      // Прижимаем к экрану: на узких (мобильных) вьюпортах поповер не должен
      // вылезать за правый край.
      const vw = window.innerWidth;
      const left = Math.max(8, Math.min(r.left, vw - 316));
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
        title="Долг с прошлых аренд — наведите для деталей"
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
              minWidth: 300,
              maxWidth: 380,
              zIndex: 1000,
            }}
            className="rounded-xl border border-border bg-surface p-3 text-[12px] text-ink-2 shadow-card-lg"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-bold text-red-ink">
                <AlertTriangle size={13} /> Долг с прошлых аренд
              </span>
              <span className="font-extrabold tabular-nums text-red-ink">
                {fmt(total)} ₽
              </span>
            </div>
            <div className="mb-1 text-[10px] leading-snug text-muted-2">
              Переезжает за клиентом. Откройте аренду-источник, чтобы принять
              платёж или распечатать досудебную.
            </div>
            <div className="flex flex-col gap-1">
              {crossSources.map((s) => (
                <button
                  key={s.rentalId}
                  type="button"
                  onClick={() => onOpenSource(s.rentalId)}
                  title={`Открыть аренду #${String(s.rentalId).padStart(4, "0")}`}
                  className="group flex items-center gap-2 rounded-lg border border-border bg-surface-soft/50 px-2.5 py-2 text-left transition-colors hover:border-red-300 hover:bg-red-soft/40"
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
                  <span className="shrink-0 text-[13px] font-bold tabular-nums text-red-ink">
                    {fmt(s.amount)} ₽
                  </span>
                  <ArrowUpRight
                    size={14}
                    className="shrink-0 text-muted-2 transition-colors group-hover:text-red-600"
                  />
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
