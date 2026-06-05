import { useState } from "react";
import { Droplets, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePatchScooter } from "@/lib/api/scooters";
import { useCreateMaintenance } from "@/lib/api/scooter-maintenance";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api";

/** Сегодня в формате YYYY-MM-DD (локальное время). */
function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Модал фиксации замены масла (баг F19).
 *
 * Фиксация = ДВА действия:
 *   1) создаём запись обслуживания (kind:"oil") — она попадёт в «Расходы»;
 *   2) обновляем у скутера lastOilChangeMileage = введённый пробег, чтобы
 *      индикатор «через N км / просрочено» сбросился (серверный роут
 *      scooter-maintenance сам это поле НЕ трогает).
 */
export function OilChangeDialog({
  scooterId,
  scooterName,
  currentMileage,
  onClose,
}: {
  scooterId: number;
  scooterName: string;
  currentMileage: number;
  onClose: () => void;
}) {
  const [mileage, setMileage] = useState<string>(String(currentMileage));
  const [performedOn, setPerformedOn] = useState<string>(todayIso());
  const [amount, setAmount] = useState<string>("0");
  const [note, setNote] = useState<string>("");

  const createMaint = useCreateMaintenance();
  const patchScooter = usePatchScooter();
  const saving = createMaint.isPending || patchScooter.isPending;

  const mileageNum = Number(mileage);
  const mileageValid = mileage.trim() !== "" && Number.isFinite(mileageNum) && mileageNum >= 0;
  // Пробег замены не может быть больше текущего одометра скутера —
  // защита от опечатки (260000 вместо 26000) и нестыковок в истории.
  // Если масло реально меняли на большем пробеге — сначала обновите
  // пробег скутера в карточке.
  const mileageTooHigh = mileageValid && mileageNum > currentMileage;
  const dateValid = performedOn.trim() !== "";
  const canSave = mileageValid && !mileageTooHigh && dateValid && !saving;

  const submit = async () => {
    if (!canSave) return;
    const amountNum = Number(amount);
    try {
      // 1) запись обслуживания
      await createMaint.mutateAsync({
        scooterId,
        kind: "oil",
        performedOn,
        amount: Number.isFinite(amountNum) && amountNum > 0 ? amountNum : 0,
        mileage: mileageNum,
        note: note.trim() ? note.trim() : null,
      });
      // 2) сброс счётчика замены на скутере
      await patchScooter.mutateAsync({
        id: scooterId,
        patch: { lastOilChangeMileage: mileageNum },
      });
      toast.success(
        "Замена масла зафиксирована",
        `${scooterName}: на ${mileageNum.toLocaleString("ru-RU")} км`,
      );
      onClose();
    } catch (e) {
      toast.error(
        "Не удалось зафиксировать замену",
        e instanceof ApiError ? e.message : (e as Error)?.message ?? "",
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center overflow-y-auto bg-ink/55 p-0 backdrop-blur-sm sm:items-start sm:p-6">
      <div
        className="min-h-[100dvh] w-full overflow-hidden rounded-none bg-surface shadow-card-lg sm:mt-16 sm:min-h-0 sm:max-w-[440px] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Droplets size={16} />
            </span>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                Зафиксировать замену масла
              </div>
              <div className="text-[15px] font-bold text-ink">{scooterName}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Пробег на момент замены, км
            </label>
            <input
              type="number"
              min={0}
              autoFocus
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              className={cn(
                "mt-1.5 w-full rounded-[10px] border bg-surface-soft px-3 py-2 text-[14px] font-semibold tabular-nums text-ink outline-none focus:ring-2 focus:ring-blue-100",
                mileageValid && !mileageTooHigh ? "border-border" : "border-red/50",
              )}
            />
            {!mileageValid ? (
              <div className="mt-1 text-[11px] text-red-ink">
                Укажите пробег (целое число ≥ 0).
              </div>
            ) : mileageTooHigh ? (
              <div className="mt-1 text-[11px] text-red-ink">
                Больше текущего пробега скутера ({currentMileage.toLocaleString("ru-RU")} км).
                Сначала обновите пробег в карточке.
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Дата замены
              </label>
              <input
                type="date"
                value={performedOn}
                onChange={(e) => setPerformedOn(e.target.value)}
                className="mt-1.5 w-full rounded-[10px] border border-border bg-surface-soft px-3 py-2 text-[14px] font-semibold text-ink outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Стоимость, ₽
              </label>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1.5 w-full rounded-[10px] border border-border bg-surface-soft px-3 py-2 text-[14px] font-semibold tabular-nums text-ink outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Заметка
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Необязательно — масло, фильтр, мастер и т.п."
              className="mt-1.5 w-full resize-none rounded-[10px] border border-border bg-surface-soft px-3 py-2 text-[13px] text-ink outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full bg-surface px-4 py-2 text-[13px] font-semibold text-ink-2 hover:bg-border disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSave}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
              canSave
                ? "bg-ink text-white hover:bg-blue-600"
                : "cursor-not-allowed bg-surface text-muted-2",
            )}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
