import { useMemo, useState } from "react";
import { Banknote, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/ui/date-picker";
import { useAllInvestorPayouts } from "@/lib/api/investors";

/**
 * Детализация выплат инвесторам (заказчик, 06.09): с плитки «Выплаты»
 * в «Партнёрке → Инвесторы» открывается история выплат за прошлые
 * периоды — по всем инвесторам сразу, с произвольным периодом.
 *
 * Детализация по одному инвестору уже была в его карточке; здесь — общий
 * взгляд директора: сколько и кому ушло за месяц/квартал/любой период.
 */

const fmt = (n: number) => n.toLocaleString("ru-RU");

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function ruDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Preset = "month" | "prev" | "quarter" | "all" | "custom";

function presetRange(p: Preset): { from: string | null; to: string | null } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === "month") return { from: ymd(first), to: ymd(now) };
  if (p === "prev") {
    const pf = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const pl = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: ymd(pf), to: ymd(pl) };
  }
  if (p === "quarter") {
    const qf = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { from: ymd(qf), to: ymd(now) };
  }
  return { from: null, to: null };
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: "month", label: "Этот месяц" },
  { id: "prev", label: "Прошлый месяц" },
  { id: "quarter", label: "3 месяца" },
  { id: "all", label: "Всё время" },
];

export function PayoutsHistoryDialog({ onClose }: { onClose: () => void }) {
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });
  const range = preset === "custom" ? custom : presetRange(preset);
  const q = useAllInvestorPayouts(range);
  const items = q.data?.items ?? [];

  const byInvestor = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of items) m.set(p.investorName, (m.get(p.investorName) ?? 0) + p.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const total = items.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/40 p-0 animate-backdrop-in sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-[680px] flex-col overflow-hidden rounded-t-2xl bg-surface shadow-card-lg animate-modal-in sm:max-h-[85dvh] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="text-[16px] font-bold text-ink">Выплаты инвесторам</div>
            <div className="mt-0.5 text-[12px] text-muted">
              История выплат за выбранный период — по всем инвесторам
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-2 hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {/* Период: пресеты + произвольный диапазон фирменным календарём */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-surface-soft/40 px-5 py-3">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                preset === p.id ? "bg-ink text-white" : "bg-surface text-muted hover:text-ink",
              )}
            >
              {p.label}
            </button>
          ))}
          <DateRangePicker
            from={preset === "custom" ? custom.from : null}
            to={preset === "custom" ? custom.to : null}
            placeholder="Свой период"
            className="w-[190px]"
            onChange={({ from, to }) => {
              if (from && to) {
                setCustom({ from, to });
                setPreset("custom");
              }
            }}
          />
        </div>

        {/* Итог за период */}
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
          <div className="text-[12px] text-muted">
            {items.length}{" "}
            {items.length === 1 ? "выплата" : items.length < 5 ? "выплаты" : "выплат"}
            {byInvestor.length > 1 && (
              <span className="ml-2 text-muted-2">
                {byInvestor.map(([n, a]) => `${n.split(" ")[0]} ${fmt(a)} ₽`).join(" · ")}
              </span>
            )}
          </div>
          <div className="font-display text-[20px] font-extrabold tabular-nums text-ink">
            {fmt(total)} ₽
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {q.isLoading ? (
            <div className="py-10 text-center text-[13px] text-muted-2">Загрузка…</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
                <Banknote size={20} />
              </div>
              <div className="text-[13.5px] font-bold text-ink">Выплат за период нет</div>
              <div className="text-[12px] text-muted">Попробуйте другой период.</div>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/60 rounded-xl border border-border">
              {items.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
                >
                  <span className="w-[112px] shrink-0 text-[12px] tabular-nums text-muted">
                    {ruDateTime(p.paidAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                    {p.investorName}
                    {p.by && <span className="ml-2 text-[11px] font-medium text-muted-2">{p.by}</span>}
                  </span>
                  <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-semibold text-muted">
                    {p.method === "mixed"
                      ? `${fmt(p.cashAmount ?? 0)} нал + ${fmt(p.transferAmount ?? 0)} перевод`
                      : p.method === "transfer"
                        ? "переводом"
                        : "наличными"}
                  </span>
                  <span className="shrink-0 font-display text-[15px] font-extrabold tabular-nums text-ink">
                    {fmt(p.amount)} ₽
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
