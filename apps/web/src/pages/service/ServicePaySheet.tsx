import { useEffect, useState } from "react";
import { Banknote, HandCoins, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiError } from "@/lib/api";
import { PayMethodPicker, splitByMethod, type PayMethod } from "@/components/PayMethodPicker";
import type { ServiceOrder } from "@/lib/api/service-orders";
import { digits, money } from "./serviceOrderUi";

/**
 * Деньги по ремонту (2.0.2): аванс, расчёт при выдаче, возврат переплаты.
 *
 * Аванс и расчёт — две вкладки одного окна: оператор начинает с «Принять
 * оплату», видит остаток и, если клиент платит часть, переключается на
 * «Аванс». Меньшая сумма в расчёте — это скидка: окно так и пишет, чтобы
 * она не проходила незаметно (раньше разница просто терялась).
 */

export type PayMode = "advance" | "settle" | "refund";

export type PaySubmit =
  | { mode: "advance"; amount: number; method: PayMethod; cashAmount: number }
  | { mode: "settle"; amount: number; discount: number; method: PayMethod; cashAmount: number }
  | { mode: "refund"; amount: number; method: PayMethod; cashAmount: number };

export function ServicePaySheet({
  order,
  initialMode,
  touch,
  onClose,
  onSubmit,
}: {
  order: ServiceOrder;
  initialMode: PayMode;
  touch: boolean;
  onClose: () => void;
  onSubmit: (v: PaySubmit) => Promise<void>;
}) {
  const t = order.totals;
  const canAdvance = t.left > 1;
  const [mode, setMode] = useState<PayMode>(
    initialMode === "advance" && !canAdvance ? "settle" : initialMode,
  );
  const [amountStr, setAmountStr] = useState(() => initialAmount(initialMode, order));
  const [method, setMethod] = useState<PayMethod>("cash");
  const [cash, setCash] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const switchMode = (m: PayMode) => {
    setMode(m);
    setAmountStr(initialAmount(m, order));
    setCash(0);
    setError(null);
  };

  const amount = Number(amountStr || 0);
  const discount = mode === "settle" ? Math.max(0, t.left - amount) : 0;

  let problem: string | null = null;
  if (mode === "advance") {
    if (amount < 1) problem = "Укажите сумму аванса";
    else if (amount >= t.left) problem = `Аванс меньше остатка (${money(t.left)}). Всю сумму — во вкладке «Оплата»`;
  } else if (mode === "settle") {
    if (amount > t.left) problem = `Больше остатка (${money(t.left)}) взять нельзя`;
  } else if (amount < 1 || amount > t.overpaid) {
    problem = `Вернуть можно до ${money(t.overpaid)}`;
  }
  const { cash: cashPart, transfer } = splitByMethod(amount, method, cash);
  if (!problem && method === "mixed" && amount > 0 && (cashPart < 1 || transfer < 1))
    problem = "Обе части смешанной оплаты больше нуля";

  const submit = async () => {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "advance") await onSubmit({ mode, amount, method, cashAmount: cashPart });
      else if (mode === "settle")
        await onSubmit({ mode, amount, discount, method, cashAmount: cashPart });
      else await onSubmit({ mode, amount, method, cashAmount: cashPart });
    } catch (e) {
      const b = (e as ApiError)?.body as { message?: string } | undefined;
      setError(b?.message ?? (e as Error).message ?? "Не получилось");
      setBusy(false);
    }
  };

  const title =
    mode === "refund" ? "Вернуть переплату" : mode === "advance" ? "Аванс" : "Принять оплату";
  const cta =
    mode === "advance"
      ? `Принять аванс · ${money(amount)}`
      : mode === "refund"
        ? `Вернули клиенту · ${money(amount)}`
        : amount === 0
          ? "Закрыть ремонт — оплачен"
          : `Оплата прошла · ${money(amount)}`;

  const chips =
    mode === "advance"
      ? uniq([Math.floor(t.left / 2), 1000, 2000, 3000, 5000]).filter((v) => v >= 1 && v < t.left).slice(0, 4)
      : [];

  return (
    <div
      className={cn(
        "absolute inset-0 z-40 flex justify-center bg-ink/35",
        touch ? "items-end" : "items-center p-4",
      )}
      onClick={onClose}
      data-pay-sheet={mode}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-full w-full flex-col overflow-hidden bg-surface shadow-card-lg",
          touch
            ? "max-w-[640px] rounded-t-3xl pb-[env(safe-area-inset-bottom)]"
            : "max-w-[440px] rounded-3xl",
        )}
      >
        <div className="flex items-center gap-2 px-5 pb-2 pt-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-soft text-green-ink">
            {mode === "refund" ? <RotateCcw size={17} /> : mode === "advance" ? <HandCoins size={17} /> : <Banknote size={17} />}
          </span>
          <div className="min-w-0 flex-1 font-display text-[18px] font-extrabold text-ink">{title}</div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-2 hover:bg-surface-soft hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
          {mode !== "refund" && canAdvance && (
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-surface-soft p-1">
              {(
                [
                  ["settle", "Оплата"],
                  ["advance", "Аванс"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => switchMode(id)}
                  className={cn(
                    "rounded-xl font-bold transition-colors",
                    touch ? "h-11 text-[14px]" : "h-9 text-[13px]",
                    mode === id ? "bg-surface text-ink shadow-card-sm" : "text-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="rounded-2xl bg-surface-soft px-4 py-3 text-[13px]">
            <Line label="К оплате" value={money(t.due)} />
            {t.paid !== 0 && <Line label="Внесено" value={money(t.paid)} />}
            {mode === "refund" ? (
              <Line label="Переплата" value={money(t.overpaid)} strong tone="bad" />
            ) : (
              <Line label="Остаток" value={money(t.left)} strong />
            )}
          </div>

          <label className="mt-3 block">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
              {mode === "advance" ? "Сумма аванса" : mode === "refund" ? "Сколько вернули" : "Сколько платит сейчас"}
            </span>
            <span className="mt-1 flex items-center rounded-2xl border border-border bg-surface px-4 focus-within:border-blue-600">
              <input
                autoFocus={!touch}
                inputMode="numeric"
                value={amountStr}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setAmountStr(digits(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="h-14 min-w-0 flex-1 bg-transparent text-right font-display text-[26px] font-extrabold tabular-nums text-ink outline-none"
              />
              <span className="ml-2 text-[18px] font-bold text-muted-2">₽</span>
            </span>
          </label>

          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((v, i) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmountStr(String(v))}
                  className={cn(
                    "rounded-full px-3.5 font-semibold",
                    touch ? "h-10 text-[13.5px]" : "h-8 text-[12.5px]",
                    amount === v ? "bg-ink text-white" : "bg-surface-soft text-ink-2 hover:bg-border",
                  )}
                >
                  {i === 0 && v === Math.floor(t.left / 2) ? `Половина · ${money(v)}` : money(v)}
                </button>
              ))}
            </div>
          )}

          {mode === "advance" && amount >= 1 && amount < t.left && (
            <div className="mt-2 text-[12.5px] text-muted">
              Останется к оплате <b className="text-ink">{money(t.left - amount)}</b> — примете при выдаче.
            </div>
          )}
          {mode === "settle" && discount > 0 && amount <= t.left && (
            <div className="mt-2 rounded-xl bg-orange-soft px-3 py-2 text-[12.5px] text-orange-ink">
              Скидка <b>{money(discount)}</b> — ремонт закроется оплаченным.
              {canAdvance && " Клиент доплатит позже? Выберите «Аванс»."}
            </div>
          )}
          {mode === "settle" && t.left === 0 && (
            <div className="mt-2 text-[12.5px] text-muted">
              Всё уже внесено авансом — остаётся отметить, что ремонт оплачен.
            </div>
          )}

          {amount > 0 && (
            <div className="mt-3">
              <PayMethodPicker
                total={amount}
                method={method}
                onMethod={setMethod}
                cash={cash}
                onCash={setCash}
                compact={!touch}
              />
            </div>
          )}

          {(error || (problem && amount > 0)) && (
            <div className="mt-3 rounded-xl bg-red-soft px-3 py-2 text-[12.5px] font-semibold text-red-ink">
              {error ?? problem}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "flex-1 rounded-xl bg-surface-soft font-bold text-muted hover:text-ink",
              touch ? "h-12 text-[14px]" : "h-11 text-[13px]",
            )}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!!problem || busy}
            className={cn(
              "flex-[1.8] rounded-xl bg-green font-bold text-white disabled:opacity-40",
              touch ? "h-12 text-[14px]" : "h-11 text-[13px]",
            )}
          >
            {busy ? "Сохраняем…" : cta}
          </button>
        </div>
      </div>
    </div>
  );
}

function initialAmount(mode: PayMode, o: ServiceOrder): string {
  if (mode === "settle") return String(o.totals.left);
  if (mode === "refund") return String(o.totals.overpaid);
  return "";
}

function uniq(a: number[]) {
  return [...new Set(a)];
}

function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "bad";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className={strong ? "font-bold text-ink" : "text-muted"}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "text-[16px] font-extrabold" : "font-semibold text-ink-2",
          tone === "bad" ? "text-red-ink" : strong && "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}
