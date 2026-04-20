import { useEffect, useState } from "react";
import { Check, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEPOSIT_AMOUNT, type Rental } from "@/lib/mock/rentals";
import { confirmRentalPayment } from "./rentalsStore";

/** Текущий вошедший — пока мок, позже возьмём из auth */
const CURRENT_USER = { role: "admin" as const, name: "Антон Р." };

export function ConfirmPaymentDialog({
  rental,
  onClose,
}: {
  rental: Rental;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [contractUploaded, setContractUploaded] = useState(!!rental.contractUploaded);
  const [paymentOk, setPaymentOk] = useState(false);
  const [depositOk, setDepositOk] = useState(false);

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

  const canSave = paymentOk && depositOk;

  const handleConfirm = () => {
    confirmRentalPayment(
      rental.id,
      CURRENT_USER.role,
      CURRENT_USER.name,
      contractUploaded,
    );
    requestClose();
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[120] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "w-full max-w-[520px] overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            Подтвердить оплату и договор
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
          <div className="flex items-center justify-between rounded-[10px] bg-surface-soft px-3 py-2 text-[12px]">
            <span>{rental.scooter}</span>
            <span className="text-muted-2">
              · аренда {rental.sum.toLocaleString("ru-RU")} ₽ + залог{" "}
              {DEPOSIT_AMOUNT.toLocaleString("ru-RU")} ₽
            </span>
          </div>

          {/* Скан договора */}
          <label
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-[12px] border border-dashed px-3 py-3 transition-colors",
              contractUploaded
                ? "border-green-ink/50 bg-green-soft/40 text-green-ink"
                : "border-border hover:border-blue-600 hover:bg-blue-50/40",
            )}
          >
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={() => setContractUploaded(true)}
            />
            <Upload size={16} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold">
                {contractUploaded ? "Договор загружен" : "Скан подписанного договора"}
              </div>
              <div className="text-[10px] text-muted-2">
                {contractUploaded
                  ? "Можно заменить — клик по полю"
                  : "JPG или PDF, двустороннее подписание"}
              </div>
            </div>
            {contractUploaded && <Check size={14} />}
          </label>

          {/* Подтверждение оплаты */}
          <div className="flex flex-col gap-2 rounded-[12px] border border-border px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Оплата получена
            </div>
            <Checkbox
              checked={paymentOk}
              onChange={setPaymentOk}
              label={`Аренда ${rental.sum.toLocaleString("ru-RU")} ₽ получена (${rental.paymentMethod === "cash" ? "наличные" : "перевод"})`}
            />
            <Checkbox
              checked={depositOk}
              onChange={setDepositOk}
              label={`Залог ${DEPOSIT_AMOUNT.toLocaleString("ru-RU")} ₽ получен`}
            />
          </div>

          <div className="text-[11px] text-muted-2">
            В журнал запишется: 13.10.2026 ·{" "}
            {CURRENT_USER.role === "admin" ? "Администратор" : "Директор"}{" "}
            {CURRENT_USER.name}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-[12px] font-semibold text-muted hover:bg-border"
          >
            Позже
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSave}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors",
              canSave
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "cursor-not-allowed bg-surface-soft text-muted-2",
            )}
          >
            <Check size={13} /> Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-blue-600"
      />
      {label}
    </label>
  );
}
