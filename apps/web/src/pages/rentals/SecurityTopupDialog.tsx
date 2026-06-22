/**
 * v0.4.49 — мини-модалка «Пополнить залог».
 *
 * Открывается с плашки «Залог исчерпан / Залог 700 из 2000» в карточке
 * аренды. Принимает сумму + способ оплаты, вызывает /security-topup,
 * который:
 *   • создаёт payment(type='deposit', paid=true)
 *   • увеличивает rental.deposit на amount
 *   • расширяет depositOriginal если новая сумма больше прежней
 *
 * Только для денежного залога. Если depositItem != null — не открывается
 * вообще (плашка скрыта на уровне RentalCard).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Shield, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { topupSecurityAsync } from "./rentalsStore";
import { toastRentalDone } from "./rentalUndo";

export function SecurityTopupDialog({
  rentalId,
  currentDeposit,
  originalDeposit,
  onClose,
  onSuccess,
}: {
  rentalId: number;
  currentDeposit: number;
  originalDeposit: number;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recommended = Math.max(0, originalDeposit - currentDeposit);
  const [amountStr, setAmountStr] = useState<string>(String(recommended));
  const amount = Number(amountStr.replace(/\D/g, "")) || 0;
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [saving, setSaving] = useState(false);

  const fmt = (n: number) => n.toLocaleString("ru-RU");

  const submit = async () => {
    if (saving || amount <= 0) return;
    setSaving(true);
    try {
      await topupSecurityAsync(rentalId, amount, method);
      toastRentalDone(
        { id: rentalId, status: "active" },
        "Залог пополнен",
        `+${fmt(amount)} ₽ · теперь ${fmt(currentDeposit + amount)} ₽`,
      );
      onSuccess?.();
      requestClose();
    } catch (e) {
      toast.error("Не удалось пополнить", (e as Error).message ?? "");
    } finally {
      setSaving(false);
    }
  };

  // Портал в body: на мобиле диалог открывается из карточки в слайд-анимации
  // (transform), а fixed-оверлей внутри transform на iOS «ловится» и
  // позиционируется неверно. Портал выносит его на верхний уровень.
  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[120] flex items-stretch justify-center overflow-y-auto bg-ink/55 p-0 backdrop-blur-sm sm:items-center sm:p-6",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
    >
      <div
        className={cn(
          "min-h-[100dvh] w-full overflow-hidden rounded-none bg-surface shadow-card-lg sm:min-h-0 sm:max-w-[420px] sm:rounded-2xl",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <Shield size={16} className="text-amber-600" />
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            Пополнить залог · аренда #{String(rentalId).padStart(4, "0")}
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 text-[13px] text-ink-2">
          <div className="rounded-[10px] bg-surface-soft px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted">Сейчас в залоге</span>
              <span className="font-bold text-ink tabular-nums">
                {fmt(currentDeposit)} ₽
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[11px] text-muted">
                Исходный (минимум)
              </span>
              <span className="text-ink-2 tabular-nums">
                {fmt(originalDeposit)} ₽
              </span>
            </div>
            {recommended > 0 && (
              <div className="mt-1 flex items-center justify-between border-t border-border pt-1">
                <span className="text-[11px] font-semibold text-amber-700">
                  Рекомендуется внести
                </span>
                <span className="text-amber-700 tabular-nums font-bold">
                  +{fmt(recommended)} ₽
                </span>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Сумма пополнения, ₽
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={amountStr}
              onChange={(e) =>
                setAmountStr(e.target.value.replace(/[^\d]/g, ""))
              }
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[16px] font-semibold tabular-nums text-ink outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Способ
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(["cash", "transfer"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    "rounded-[10px] border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                    method === m
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-border bg-white text-ink-2 hover:border-blue-400",
                  )}
                >
                  {m === "cash" ? "Наличные" : "Перевод"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-[12px] font-semibold text-muted hover:bg-border"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || amount <= 0}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[12px] font-bold transition-colors",
              saving || amount <= 0
                ? "cursor-not-allowed bg-blue-200 text-white/80"
                : "bg-blue-600 text-white hover:bg-blue-700",
            )}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Пополнить
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
