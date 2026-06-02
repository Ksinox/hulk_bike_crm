import { useMemo, useState } from "react";
import { CalendarRange, Check, X } from "lucide-react";
import { useCreateSchedule } from "@/lib/api/debtors";
import { toast } from "@/lib/toast";

/**
 * Диалог формирования графика платежей.
 *
 * Два режима:
 *  - «По сумме платежа» — клиент называет комфортную сумму (напр. 500 ₽),
 *    мы делим остаток на платежи этого размера (хвост — меньшим финальным).
 *  - «По количеству» — указываем число платежей, делим поровну.
 *
 * Периодичность: ежедневно / еженедельно / раз в 2 недели / ежемесячно.
 * Живое превью строк перед созданием.
 */

type Freq = "daily" | "weekly" | "biweekly" | "monthly";
type Mode = "by_amount" | "by_count";

const FREQ: { id: Freq; label: string }[] = [
  { id: "daily", label: "Каждый день" },
  { id: "weekly", label: "Неделя" },
  { id: "biweekly", label: "2 недели" },
  { id: "monthly", label: "Месяц" },
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addPeriod(base: Date, i: number, freq: Freq): Date {
  const out = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  if (freq === "daily") out.setDate(out.getDate() + i);
  else if (freq === "weekly") out.setDate(out.getDate() + i * 7);
  else if (freq === "biweekly") out.setDate(out.getDate() + i * 14);
  else out.setMonth(out.getMonth() + i);
  return out;
}

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

export function ScheduleBuilderDialog({
  debtorId,
  remaining,
  caseNumber,
  onClose,
  onCreated,
}: {
  debtorId: number;
  remaining: number;
  caseNumber: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<Mode>("by_amount");
  const [total, setTotal] = useState<string>(String(remaining));
  const [perPayment, setPerPayment] = useState<string>("");
  const [count, setCount] = useState<string>("3");
  const [freq, setFreq] = useState<Freq>("monthly");
  const [startDate, setStartDate] = useState<string>(todayISO());
  const create = useCreateSchedule();

  const totalNum = Math.max(0, Math.floor(Number(total) || 0));
  const perNum = Math.floor(Number(perPayment) || 0);
  const countNum = Math.floor(Number(count) || 0);

  const preview = useMemo(() => {
    if (totalNum <= 0) return [];
    const [y, m, dd] = startDate.split("-").map(Number);
    if (!y || !m || !dd) return [];
    const base = new Date(y, m - 1, dd);
    const rows: { n: number; date: Date; amount: number }[] = [];
    if (mode === "by_amount") {
      if (perNum <= 0) return [];
      const cnt = Math.ceil(totalNum / perNum);
      if (cnt > 120) return [];
      let left = totalNum;
      for (let i = 0; i < cnt; i++) {
        const amount = Math.min(perNum, left);
        rows.push({ n: i + 1, date: addPeriod(base, i, freq), amount });
        left -= amount;
      }
    } else {
      if (countNum < 1 || countNum > 120) return [];
      const baseAmt = Math.floor(totalNum / countNum);
      const rem = totalNum - baseAmt * countNum;
      for (let i = 0; i < countNum; i++) {
        rows.push({
          n: i + 1,
          date: addPeriod(base, i, freq),
          amount: baseAmt + (i === countNum - 1 ? rem : 0),
        });
      }
    }
    return rows;
  }, [mode, totalNum, perNum, countNum, freq, startDate]);

  const canCreate =
    totalNum > 0 &&
    preview.length > 0 &&
    (mode === "by_amount" ? perNum > 0 : countNum >= 1);

  const submit = async () => {
    if (!canCreate) return;
    try {
      await create.mutateAsync({
        id: debtorId,
        mode,
        totalAmount: totalNum,
        perPayment: mode === "by_amount" ? perNum : undefined,
        count: mode === "by_count" ? countNum : undefined,
        startDate,
        frequency: freq,
      });
      toast.success(
        "График создан",
        `${preview.length} платежей на ${fmtNum(totalNum)} ₽`,
      );
      onCreated();
    } catch (e) {
      toast.error("Не удалось", (e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[20px] bg-white shadow-card-lg">
        <header className="flex items-start justify-between border-b border-border p-6 pb-4">
          <div>
            <div className="mb-1 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
              <CalendarRange size={14} /> График платежей · {caseNumber}
            </div>
            <h3 className="font-display text-[24px] font-bold tracking-[-0.018em] text-ink">
              Разбить долг на платежи
            </h3>
            <div className="mt-0.5 text-[13px] text-muted">
              К разбивке — остаток {fmtNum(remaining)} ₽
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-2 hover:bg-surface-soft hover:text-ink"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-6">
          {/* Сумма к разбивке */}
          <Label>Сумма к разбивке</Label>
          <div className="mb-4 flex items-baseline gap-2 rounded-[12px] border border-border bg-white px-4 py-2.5 focus-within:border-ink">
            <input
              inputMode="numeric"
              value={total}
              onChange={(e) => setTotal(e.target.value.replace(/[^\d]/g, ""))}
              className="min-w-0 flex-1 border-none bg-transparent p-0 font-display text-[24px] font-bold text-ink outline-none"
            />
            <span className="text-[18px] font-semibold text-muted-2">₽</span>
          </div>

          {/* Режим */}
          <div className="mb-4 grid grid-cols-2 gap-2">
            <ModeBtn
              active={mode === "by_amount"}
              onClick={() => setMode("by_amount")}
              title="По сумме платежа"
              hint="комфортная сумма"
            />
            <ModeBtn
              active={mode === "by_count"}
              onClick={() => setMode("by_count")}
              title="По количеству"
              hint="число платежей"
            />
          </div>

          {/* Параметр режима */}
          {mode === "by_amount" ? (
            <div className="mb-4">
              <Label>Сумма одного платежа</Label>
              <div className="flex items-baseline gap-2 rounded-[12px] border border-border bg-white px-4 py-2.5 focus-within:border-ink">
                <input
                  inputMode="numeric"
                  placeholder="напр. 500"
                  value={perPayment}
                  onChange={(e) =>
                    setPerPayment(e.target.value.replace(/[^\d]/g, ""))
                  }
                  className="min-w-0 flex-1 border-none bg-transparent p-0 text-[18px] font-semibold text-ink outline-none"
                />
                <span className="text-[14px] text-muted-2">₽ / платёж</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[300, 500, 1000, 2000, 5000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPerPayment(String(v))}
                    className="rounded-full border border-border px-3 py-1 text-[12px] font-semibold text-ink-2 hover:border-ink"
                  >
                    {fmtNum(v)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <Label>Количество платежей</Label>
              <div className="flex items-baseline gap-2 rounded-[12px] border border-border bg-white px-4 py-2.5 focus-within:border-ink">
                <input
                  inputMode="numeric"
                  value={count}
                  onChange={(e) =>
                    setCount(e.target.value.replace(/[^\d]/g, ""))
                  }
                  className="min-w-0 flex-1 border-none bg-transparent p-0 text-[18px] font-semibold text-ink outline-none"
                />
                <span className="text-[14px] text-muted-2">платежей</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[2, 3, 6, 12].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCount(String(v))}
                    className="rounded-full border border-border px-3 py-1 text-[12px] font-semibold text-ink-2 hover:border-ink"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Периодичность */}
          <Label>Периодичность</Label>
          <div className="mb-4 grid grid-cols-4 gap-1.5">
            {FREQ.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFreq(f.id)}
                className={`h-10 rounded-[10px] border text-[12.5px] font-semibold transition-colors ${
                  freq === f.id
                    ? "border-ink bg-ink text-white"
                    : "border-border text-ink-2 hover:border-ink"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Дата первого платежа */}
          <Label>Первый платёж</Label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mb-5 h-11 w-full rounded-[12px] border border-border bg-white px-3.5 text-[14px] text-ink outline-none focus:border-ink"
          />

          {/* Превью */}
          {preview.length > 0 && (
            <div className="rounded-[14px] border border-border bg-surface-soft/50 p-4">
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-2">
                <span>Превью · {preview.length} платежей</span>
                <span>итог {fmtNum(preview.reduce((s, r) => s + r.amount, 0))} ₽</span>
              </div>
              <div className="max-h-[180px] space-y-0.5 overflow-auto">
                {preview.map((r) => (
                  <div
                    key={r.n}
                    className="flex items-center justify-between rounded-[8px] bg-white px-3 py-1.5 text-[12.5px]"
                  >
                    <span className="font-mono text-[10.5px] text-muted-2">
                      {r.n}
                    </span>
                    <span className="text-ink-2">{fmtDate(r.date)}</span>
                    <span className="font-mono font-semibold text-ink tabular-nums">
                      {fmtNum(r.amount)} ₽
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center gap-2.5 border-t border-border bg-surface-soft p-4">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-muted hover:text-ink"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!canCreate || create.isPending}
            onClick={submit}
            className="ml-auto inline-flex h-11 items-center gap-2 rounded-[12px] bg-ink px-5 text-[14px] font-semibold text-white shadow-card-sm hover:bg-[#16213a] disabled:opacity-40"
          >
            <Check size={15} /> Создать график
          </button>
        </footer>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
      {children}
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start rounded-[12px] border px-4 py-2.5 text-left transition-colors ${
        active ? "border-ink bg-ink text-white" : "border-border hover:border-ink"
      }`}
    >
      <span className="text-[14px] font-semibold">{title}</span>
      <span
        className={`text-[11px] ${active ? "text-white/60" : "text-muted-2"}`}
      >
        {hint}
      </span>
    </button>
  );
}
