import { useState } from "react";
import { Droplets, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePatchScooter } from "@/lib/api/scooters";
import { useCreateMaintenance } from "@/lib/api/scooter-maintenance";
import { OIL_INTERVAL_DEFAULT_KM } from "@/lib/mock/fleet";
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
 * Режимы работы окна:
 *   • "change"   — «Новая замена»: масло заменили только что. Создаём запись
 *                  расхода (с ценой) и сбрасываем счётчик интервала.
 *   • "baseline" — «Прошлая замена»: задаём точку отсчёта по пробегу, от
 *                  которой ведём счёт до следующей замены (для скутеров, у
 *                  которых история ещё не велась, или чтобы поправить базу).
 *                  Цену не спрашиваем — это не расход, а отметка.
 */
export type OilMode = "change" | "baseline";

function fmtKm(n: number): string {
  return n.toLocaleString("ru-RU");
}

/**
 * Модал фиксации замены масла (баг F19) + отметка прошлой замены.
 *
 * Фиксация = ДВА действия:
 *   1) создаём запись обслуживания (kind:"oil") — она попадёт в «Расходы»
 *      и в историю замен (видно ДАТУ и пробег каждой замены);
 *   2) обновляем у скутера lastOilChangeMileage = введённый пробег, чтобы
 *      индикатор «через N км / просрочено» считался от этой точки (серверный
 *      роут scooter-maintenance сам это поле НЕ трогает).
 *
 * В режиме «Прошлая замена» цену не спрашиваем (amount = 0): задача — просто
 * выставить точку отсчёта интервала по пробегу.
 */
export function OilChangeDialog({
  scooterId,
  scooterName,
  currentMileage,
  onClose,
  initialMode = "change",
}: {
  scooterId: number;
  scooterName: string;
  currentMileage: number;
  onClose: () => void;
  /** С какого режима открыть окно (по умолчанию — новая замена). */
  initialMode?: OilMode;
}) {
  const [mode, setMode] = useState<OilMode>(initialMode);
  const [mileage, setMileage] = useState<string>(String(currentMileage));
  const [performedOn, setPerformedOn] = useState<string>(todayIso());
  const [amount, setAmount] = useState<string>("0");
  const [note, setNote] = useState<string>("");

  const createMaint = useCreateMaintenance();
  const patchScooter = usePatchScooter();
  const saving = createMaint.isPending || patchScooter.isPending;

  const isBaseline = mode === "baseline";

  const mileageNum = Number(mileage);
  const mileageValid =
    mileage.trim() !== "" && Number.isFinite(mileageNum) && mileageNum >= 0;
  // Пробег замены не может быть больше текущего одометра скутера —
  // защита от опечатки (260000 вместо 26000) и нестыковок в истории.
  // Если масло реально меняли на большем пробеге — сначала обновите
  // пробег скутера в карточке.
  const mileageTooHigh = mileageValid && mileageNum > currentMileage;
  const dateValid = performedOn.trim() !== "";
  const canSave = mileageValid && !mileageTooHigh && dateValid && !saving;

  // Следующая замена «через N км» от введённой точки — для подсказки.
  const nextAtKm = mileageValid ? mileageNum + OIL_INTERVAL_DEFAULT_KM : null;

  const submit = async () => {
    if (!canSave) return;
    const amountNum = Number(amount);
    try {
      // 1) запись обслуживания (в режиме отметки — без стоимости).
      await createMaint.mutateAsync({
        scooterId,
        kind: "oil",
        performedOn,
        amount:
          !isBaseline && Number.isFinite(amountNum) && amountNum > 0
            ? amountNum
            : 0,
        mileage: mileageNum,
        note: note.trim()
          ? note.trim()
          : isBaseline
            ? "Отметка прошлой замены (точка отсчёта)"
            : null,
      });
      // 2) сброс счётчика замены на скутере
      await patchScooter.mutateAsync({
        id: scooterId,
        patch: { lastOilChangeMileage: mileageNum },
      });
      toast.success(
        isBaseline
          ? "Точка отсчёта обновлена"
          : "Замена масла зафиксирована",
        `${scooterName}: с ${fmtKm(mileageNum)} км`,
      );
      onClose();
    } catch (e) {
      toast.error(
        "Не удалось сохранить",
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
                {isBaseline ? "Прошлая замена масла" : "Замена масла"}
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
          {/* Переключатель режима: новая замена / отметка прошлой замены. */}
          <div className="grid grid-cols-2 gap-1.5 rounded-[12px] bg-surface-soft p-1">
            <button
              type="button"
              onClick={() => setMode("change")}
              className={cn(
                "rounded-[9px] px-3 py-2 text-[12.5px] font-bold transition-colors",
                !isBaseline
                  ? "bg-surface text-ink shadow-card-sm"
                  : "text-muted-2 hover:text-ink",
              )}
            >
              Новая замена
            </button>
            <button
              type="button"
              onClick={() => setMode("baseline")}
              className={cn(
                "rounded-[9px] px-3 py-2 text-[12.5px] font-bold transition-colors",
                isBaseline
                  ? "bg-surface text-ink shadow-card-sm"
                  : "text-muted-2 hover:text-ink",
              )}
            >
              Прошлая замена
            </button>
          </div>

          <p className="-mt-1 text-[11.5px] leading-snug text-muted">
            {isBaseline
              ? "Задаём точку отсчёта: с какого пробега была последняя замена. Дальше счёт до следующей замены ведём от неё."
              : "Масло заменили только что — запишем расход и сбросим счётчик интервала."}
          </p>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              {isBaseline
                ? "Пробег на момент прошлой замены, км"
                : "Пробег на момент замены, км"}
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
                Больше текущего пробега скутера ({fmtKm(currentMileage)} км).
                Сначала обновите пробег в карточке.
              </div>
            ) : nextAtKm != null ? (
              <div className="mt-1 text-[11px] text-muted">
                Следующая замена — при {fmtKm(nextAtKm)} км (интервал{" "}
                {fmtKm(OIL_INTERVAL_DEFAULT_KM)} км).
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              "grid gap-3",
              isBaseline ? "grid-cols-1" : "grid-cols-2",
            )}
          >
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                {isBaseline ? "Когда меняли (если известно)" : "Дата замены"}
              </label>
              <input
                type="date"
                value={performedOn}
                onChange={(e) => setPerformedOn(e.target.value)}
                className="mt-1.5 w-full rounded-[10px] border border-border bg-surface-soft px-3 py-2 text-[14px] font-semibold text-ink outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            {/* Стоимость — только для новой замены (отметка прошлой = не расход). */}
            {!isBaseline && (
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
            )}
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Заметка
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                isBaseline
                  ? "Необязательно — напр. «со слов прошлого владельца»"
                  : "Необязательно — масло, фильтр, мастер и т.п."
              }
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
            {isBaseline ? "Сохранить точку отсчёта" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
