import { useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Способ расчёта — единый для всей CRM (фидбэк 01.09).
 *
 * Деньги в бизнесе приходят и уходят тремя способами: наличными, переводом
 * или смешанно. Для смешанного мало пометки «смешанный» — нужны сами доли,
 * иначе кассу не свести. Поэтому компонент всегда отдаёт наверх и способ, и
 * сумму наличными; переводом — остаток, он считается сам.
 */
export type PayMethod = "cash" | "transfer" | "mixed";

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  cash: "Наличными",
  transfer: "Переводом",
  mixed: "Смешанно",
};

/** Разбивка суммы по способу — одна формула на весь проект. */
export function splitByMethod(total: number, method: PayMethod, cashInput: number) {
  const cash =
    method === "cash" ? total : method === "transfer" ? 0 : clamp(cashInput, 0, total);
  return { cash, transfer: total - cash };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

export function PayMethodPicker({
  total,
  method,
  onMethod,
  cash,
  onCash,
  compact,
}: {
  /** Полная сумма операции — из неё вычитается наличная часть. */
  total: number;
  method: PayMethod;
  onMethod: (m: PayMethod) => void;
  /** Сколько наличными (значимо только для «смешанно»). */
  cash: number;
  onCash: (v: number) => void;
  compact?: boolean;
}) {
  const { cash: cashPart, transfer } = splitByMethod(total, method, cash);

  // При переходе в «смешанно» подставляем половину — так оператору почти
  // всегда остаётся поправить одну цифру, а не вводить с нуля.
  useEffect(() => {
    if (method === "mixed" && cash <= 0 && total > 0) onCash(Math.floor(total / 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 rounded-full bg-surface-soft p-1">
        {(Object.keys(PAY_METHOD_LABEL) as PayMethod[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onMethod(id)}
            className={cn(
              "flex-1 rounded-full font-semibold transition-colors",
              compact ? "py-1.5 text-[12px]" : "py-2 text-[13px]",
              method === id ? "bg-surface text-ink shadow-card-sm" : "text-muted",
            )}
          >
            {PAY_METHOD_LABEL[id]}
          </button>
        ))}
      </div>

      {method === "mixed" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
              Наличными
            </span>
            <input
              inputMode="numeric"
              value={cashPart ? String(cashPart) : ""}
              onChange={(e) =>
                onCash(clamp(Number(e.target.value.replace(/[^\d]/g, "")) || 0, 0, total))
              }
              className="h-10 rounded-xl border border-border bg-surface px-3 text-[14px] font-bold tabular-nums outline-none focus:border-emerald-500"
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
              Переводом
            </span>
            <div className="flex h-10 items-center rounded-xl bg-surface-soft px-3 text-[14px] font-bold tabular-nums text-ink">
              {transfer.toLocaleString("ru-RU")} ₽
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
