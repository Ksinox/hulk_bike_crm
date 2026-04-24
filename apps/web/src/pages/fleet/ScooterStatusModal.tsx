import { useState } from "react";
import {
  ArrowRight,
  Check,
  Loader2,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePatchScooter } from "@/lib/api/scooters";
import { useApiRentals } from "@/lib/api/rentals";
import type { ApiScooter, ScooterBaseStatus } from "@/lib/api/types";
import { navigate } from "@/app/navigationStore";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { SCOOTER_BASE_STATUS_OPTIONS } from "./scooterStatusOptions";

const OPTIONS = SCOOTER_BASE_STATUS_OPTIONS.map((o) => ({
  id: o.value,
  label: o.label,
  hint: o.hint,
}));

export function ScooterStatusModal({
  scooter,
  onClose,
}: {
  scooter: ApiScooter;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<ScooterBaseStatus>(scooter.baseStatus);
  const patch = usePatchScooter();
  const { data: rentals = [] } = useApiRentals();

  /**
   * Есть ли сейчас у скутера незакрытая аренда. Если да — статус менять
   * нельзя: физически скутер у клиента, любое «На ремонт» / «Не распределён»
   * не отражает действительность и сломает учёт.
   */
  const activeRental = rentals.find(
    (r) =>
      r.scooterId === scooter.id &&
      (r.status === "active" ||
        r.status === "overdue" ||
        r.status === "returning"),
  );
  const locked = !!activeRental;

  const submit = async () => {
    if (selected === scooter.baseStatus) return onClose();
    try {
      await patch.mutateAsync({ id: scooter.id, patch: { baseStatus: selected } });
      toast.success("Статус изменён", `${scooter.name}: «${optionLabel(selected)}»`);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error(
          "Нельзя менять статус",
          "У скутера активная аренда. Сначала завершите её.",
        );
      } else {
        toast.error("Не удалось сохранить статус", (e as Error).message ?? "");
      }
    }
  };

  const openRental = () => {
    if (!activeRental) return;
    navigate({ route: "rentals", rentalId: activeRental.id });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/55 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-16 w-full max-w-[480px] overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Статус скутера
            </div>
            <div className="text-[15px] font-bold text-ink">{scooter.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {locked && (
          <div className="border-b border-amber-400/30 bg-amber-50 px-5 py-3">
            <div className="flex items-start gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-200 text-amber-800">
                <TriangleAlert size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-amber-900">
                  Скутер сейчас в аренде
                </div>
                <div className="mt-0.5 text-[12px] text-amber-900/80">
                  Смена статуса заблокирована. Сначала завершите активную
                  аренду — тогда сможете отправить скутер в ремонт, на продажу
                  или вернуть в парк.
                </div>
                <button
                  type="button"
                  onClick={openRental}
                  className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-amber-700"
                >
                  Открыть аренду #{String(activeRental!.id).padStart(4, "0")}
                  <ArrowRight size={11} />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1 px-3 py-3">
          {OPTIONS.map((o) => {
            const active = o.id === selected;
            const isCurrent = o.id === scooter.baseStatus;
            const disabled = locked && !isCurrent;
            return (
              <button
                key={o.id}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setSelected(o.id)}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                  disabled && "cursor-not-allowed opacity-40",
                  !disabled && active
                    ? "bg-blue-50 ring-1 ring-inset ring-blue-600/40"
                    : !disabled && "hover:bg-surface-soft",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full",
                    active && !disabled
                      ? "bg-blue-600 text-white"
                      : "border border-border",
                  )}
                >
                  {active && !disabled && <Check size={12} strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-[13px] font-bold",
                      active && !disabled ? "text-blue-700" : "text-ink",
                    )}
                  >
                    {o.label}
                    {isCurrent && (
                      <span className="ml-1.5 rounded-full bg-surface-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-2">
                        текущий
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted">{o.hint}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-surface px-4 py-2 text-[13px] font-semibold hover:bg-border"
          >
            {locked ? "Закрыть" : "Отмена"}
          </button>
          {!locked && (
            <button
              type="button"
              onClick={submit}
              disabled={patch.isPending || selected === scooter.baseStatus}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
                patch.isPending || selected === scooter.baseStatus
                  ? "cursor-not-allowed bg-surface text-muted-2"
                  : "bg-ink text-white hover:bg-blue-600",
              )}
            >
              {patch.isPending && <Loader2 size={14} className="animate-spin" />}
              Сохранить статус
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function optionLabel(id: ScooterBaseStatus): string {
  return OPTIONS.find((o) => o.id === id)?.label ?? id;
}
