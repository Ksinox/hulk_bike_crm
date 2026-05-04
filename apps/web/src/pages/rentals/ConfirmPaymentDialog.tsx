import { useEffect, useState } from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Rental } from "@/lib/mock/rentals";
import { confirmRentalPayment } from "./rentalsStore";
import { useMe } from "@/lib/api/auth";

/**
 * Чеклист подтверждения выдачи аренды.
 * Три галки: Договор подписан / Сумма аренды получена / Залог получен.
 * Подтвердить можно с неотмеченными — система покажет предупреждение
 * и запишет в журнал что именно не выполнено. Когда позже зайдут и
 * «дозакроют» недостающее — в журнал упадёт ещё запись.
 */
export function ConfirmPaymentDialog({
  rental,
  onClose,
}: {
  rental: Rental;
  onClose: () => void;
}) {
  const { data: me } = useMe();
  const [closing, setClosing] = useState(false);
  const [contractSigned, setContractSigned] = useState(
    rental.contractUploaded ?? false,
  );
  const [rentPaid, setRentPaid] = useState(false);
  const [depositReceived, setDepositReceived] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

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

  const allChecked = contractSigned && rentPaid && depositReceived;
  const missing: string[] = [];
  if (!contractSigned) missing.push("Договор подписан");
  if (!rentPaid) missing.push("Сумма аренды получена");
  if (!depositReceived) missing.push("Залог получен");

  const handleConfirm = () => {
    if (!allChecked && !showWarning) {
      setShowWarning(true);
      return;
    }
    const role = me?.role === "director" || me?.role === "creator" ? "director" : "admin";
    const name = me?.name ?? "—";
    confirmRentalPayment(rental.id, role, name, contractSigned, rentPaid, depositReceived);
    requestClose();
  };

  const depositLabel =
    rental.deposit > 0
      ? `Залог ${rental.deposit.toLocaleString("ru-RU")} ₽ получен`
      : "Залог (предмет) получен";

  return (
    <div
      className={cn(
        "fixed inset-0 z-[120] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
    >
      <div
        className={cn(
          "w-full max-w-[480px] overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            Подтвердить выдачу
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex items-center justify-between rounded-[10px] bg-surface-soft px-3 py-2 text-[12px]">
            <span className="font-semibold">{rental.scooter}</span>
            <span className="text-muted-2">
              · аренда {rental.sum.toLocaleString("ru-RU")} ₽
            </span>
          </div>

          <div className="flex flex-col gap-2 rounded-[12px] border border-border px-3 py-3">
            <CheckRow
              checked={contractSigned}
              onChange={(v) => {
                setContractSigned(v);
                setShowWarning(false);
              }}
              label="Договор подписан"
            />
            <CheckRow
              checked={rentPaid}
              onChange={(v) => {
                setRentPaid(v);
                setShowWarning(false);
              }}
              label={`Сумма аренды ${rental.sum.toLocaleString("ru-RU")} ₽ получена`}
            />
            <CheckRow
              checked={depositReceived}
              onChange={(v) => {
                setDepositReceived(v);
                setShowWarning(false);
              }}
              label={depositLabel}
            />
          </div>

          {showWarning && !allChecked && (
            <div className="rounded-[10px] border border-amber-400/40 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
              <div className="mb-1 flex items-center gap-1.5 font-bold">
                <TriangleAlert size={13} /> Не всё отмечено
              </div>
              Не выполнено: <b>{missing.join(", ")}</b>. Если вы всё равно
              подтвердите выдачу — это попадёт в журнал действий с пометкой о
              недостающих пунктах. Когда клиент потом довезёт/оплатит
              недостающее — зайдите сюда и поставьте галки, это тоже
              зафиксируется.
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowWarning(false)}
                  className="rounded-full bg-surface px-3 py-1 text-[11px] font-semibold hover:bg-border"
                >
                  Вернуться
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="rounded-full bg-amber-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-amber-700"
                >
                  Да, подтвердить как есть
                </button>
              </div>
            </div>
          )}

          <div className="text-[11px] text-muted-2">
            В журнал запишется: {new Date().toLocaleDateString("ru-RU")} ·{" "}
            {me?.name ?? "—"}
            {me?.role && ` (${roleLabel(me.role)})`}
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
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors",
              allChecked
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-amber-600 text-white hover:bg-amber-700",
            )}
          >
            <Check size={13} />
            {allChecked ? "Подтвердить" : "Подтвердить частично"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors",
        checked ? "text-ink" : "text-ink-2 hover:bg-surface-soft",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-blue-600"
      />
      <span className={cn(checked && "font-semibold")}>{label}</span>
      {checked && <Check size={12} className="ml-auto text-green-ink" />}
    </label>
  );
}

function roleLabel(role: string): string {
  return role === "director"
    ? "Директор"
    : role === "admin"
      ? "Администратор"
      : role === "creator"
        ? "Создатель"
        : role;
}
