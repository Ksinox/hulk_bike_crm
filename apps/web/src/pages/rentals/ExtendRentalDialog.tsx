import { useEffect, useMemo, useState } from "react";
import { Check, Repeat, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MIN_RENTAL_DAYS,
  MODEL_LABEL,
  periodForDays,
  TARIFF,
  TARIFF_PERIOD_LABEL,
  type Rental,
} from "@/lib/mock/rentals";
import { extendInplaceAsync, equipmentChangeAsync } from "./rentalsStore";
import { toast } from "@/lib/toast";
import { PaymentAcceptDialog } from "./PaymentAcceptDialog";
import { EquipmentEditor } from "./RentalEditModal";

type EquipmentSnapshot = {
  itemId?: number | null;
  name: string;
  price: number;
  free: boolean;
};

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

export function ExtendRentalDialog({
  rental,
  onClose,
  onExtended,
}: {
  rental: Rental;
  onClose: () => void;
  onExtended?: (newRental: Rental) => void;
}) {
  const [closing, setClosing] = useState(false);
  const [days, setDays] = useState(7);
  // v0.4.25: чекбокс «Произвольный тариф» + переключатель ед.измерения
  // ₽/сут vs ₽/нед. В week-режиме поле «дней» означает недели, под
  // капотом days = weeks × 7.
  const [customMode, setCustomMode] = useState<boolean>(false);
  const [customUnit, setCustomUnit] = useState<"day" | "week">("day");
  const [customRate, setCustomRate] = useState<number>(0);
  // v0.4.82: экипировка при продлении. Изначально снапшот текущей
  // экипировки. Если оператор её меняет — после extend-inplace
  // вызываем /equipment-change. Доплата за изменение пойдёт в долг
  // (manual_charge), который PaymentAcceptDialog потом примет.
  const initialEquipment: EquipmentSnapshot[] =
    (rental as { equipmentJson?: EquipmentSnapshot[] }).equipmentJson?.map(
      (it) => ({
        itemId: it.itemId ?? null,
        name: it.name,
        price: it.price,
        free: it.free,
      }),
    ) ?? [];
  const [equipment, setEquipment] = useState<EquipmentSnapshot[]>(initialEquipment);
  const equipmentChanged =
    JSON.stringify(equipment) !== JSON.stringify(initialEquipment);

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

  const autoPeriod = periodForDays(days);
  // В custom-week режиме форсируем period='week' для tariffPeriod в payload.
  const period =
    customMode && customUnit === "week" ? ("week" as const) : autoPeriod;
  // v0.4.25: rate зависит от режима.
  //  • !customMode — берём из тарифной сетки модели по period
  //  • customMode — оператор задаёт сам (₽/сут или ₽/нед)
  const rate = customMode
    ? Math.max(0, customRate)
    : TARIFF[rental.model][period];
  const isWeeklyCustom = customMode && customUnit === "week";
  const weeks = isWeeklyCustom ? Math.max(1, Math.round(days / 7)) : 0;
  const sum = isWeeklyCustom ? rate * weeks : rate * days;

  const newEndPlanned = useMemo(() => {
    const [d, m, y] = rental.endPlanned.split(".").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${dt.getFullYear()}`;
  }, [rental.endPlanned, days]);

  const [saving, setSaving] = useState(false);
  // v0.4.45: после extend сразу показываем PaymentAcceptDialog для
  // приёма фактической оплаты. extend на бэке создаёт rent-платёж как
  // paid=false (placeholder) — модалка зафиксирует фактически принятую
  // сумму. Если оператор внёс больше rate × days, излишек идёт в
  // погашение долга по просрочке (если есть) или в депозит клиента.
  const [paymentForRental, setPaymentForRental] = useState<Rental | null>(null);

  const handleExtend = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // v0.4.57: используем inplace-продление (без создания child rental).
      // Та же физическая аренда обновляется: end_planned_at += days, days +=,
      // sum += rate × days. История продлений видна в activity_log
      // (action='rental_extended'), не плодит дочерних записей.
      await extendInplaceAsync(
        rental.id,
        days,
        rate,
        period,
        isWeeklyCustom ? "week" : "day",
        false, // autoMarkPaid=false — оплату фиксируем через PaymentAcceptDialog
      );
      // v0.4.82: если экипировка изменилась — применяем ПОСЛЕ extend.
      // remainingDays на бэке считается от today до endPlanned. После
      // extend endPlanned уже сдвинут вперёд, поэтому delta учитывает
      // и старый остаток, и новый extension период (от today до конца).
      // payNow=false → доплата висит как manual_charge → попадёт в
      // долги PaymentAcceptDialog, который оператор увидит дальше.
      if (equipmentChanged) {
        try {
          await equipmentChangeAsync({
            rentalId: rental.id,
            newEquipmentJson: equipment,
            payNow: false,
            comment: "Изменение экипировки при продлении",
          });
        } catch (e) {
          // Не валим продление — оно уже применено. Логируем.
          console.error("equipmentChange failed", e);
        }
      }
      const updated: Rental = {
        ...rental,
        days: rental.days + days,
        rate,
        sum: rental.sum + rate * days,
        endPlanned: newEndPlanned,
        equipmentJson: equipment as Rental["equipmentJson"],
        equipment: equipment.map((e) => e.name),
      } as Rental;
      onExtended?.(updated);
      setPaymentForRental(updated);
    } catch (e) {
      toast.error(
        "Не удалось продлить",
        (e as Error).message ?? "Попробуйте ещё раз",
      );
    } finally {
      setSaving(false);
    }
  };

  // Когда открыт PaymentAcceptDialog, скрываем основной диалог продления
  // (физически не удаляем — оставляем dialog в DOM-стеке, чтобы при
  // отмене оплаты оператор мог увидеть параметры продления и решить).
  if (paymentForRental) {
    return (
      <PaymentAcceptDialog
        rental={paymentForRental}
        onClose={() => {
          // Закрытие модалки оплаты — закрываем и весь поток продления.
          // Аренда уже создана; rent-платёж paid=false останется в системе
          // как «ожидает оплаты» (оператор разберётся отдельно).
          setPaymentForRental(null);
          requestClose();
        }}
        onPaid={() => {
          toast.success("Продление оплачено");
          setPaymentForRental(null);
          requestClose();
        }}
      />
    );
  }

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
          <Repeat size={16} className="text-blue-600" />
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            Продлить аренду
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
            <span>
              {rental.scooter} · {MODEL_LABEL[rental.model]}
            </span>
            <span className="text-muted-2">
              до {rental.endPlanned} {rental.startTime || "12:00"}
            </span>
          </div>

          <label className="text-[12px] font-semibold text-ink">
            На сколько дней продлить
            <input
              type="number"
              min={MIN_RENTAL_DAYS}
              max={90}
              value={days}
              onChange={(e) =>
                setDays(
                  Math.max(MIN_RENTAL_DAYS, Number(e.target.value) || MIN_RENTAL_DAYS),
                )
              }
              className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
            />
            <div className="mt-1 text-[10px] text-muted-2">
              минимум {MIN_RENTAL_DAYS} {MIN_RENTAL_DAYS === 1 ? "сутки" : "суток"} — тариф пересчитается автоматически
            </div>
          </label>

          {/* v0.4.25: автомат-тариф (показываем плашки) + чекбокс
              «Произвольный» с переключателем ₽/сут vs ₽/нед. В week
              режиме поле «срок» означает недели, sum = rate × weeks. */}
          <div>
            {!customMode && (
              <div className="grid grid-cols-3 gap-2">
                {(["short", "week", "month"] as const).map((p) => (
                  <div
                    key={p}
                    className={cn(
                      "rounded-[10px] px-3 py-2 text-[11px]",
                      p === period
                        ? "bg-blue-50 text-blue-700"
                        : "bg-surface-soft text-muted",
                    )}
                  >
                    <div className="font-semibold uppercase tracking-wider">
                      {TARIFF_PERIOD_LABEL[p]}
                    </div>
                    <div className="mt-0.5 tabular-nums">
                      {TARIFF[rental.model][p]} ₽/сут
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-surface-soft p-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={customMode}
                  onChange={(e) => setCustomMode(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-blue-600"
                />
                <span className="text-[12px] font-semibold">
                  Произвольный тариф
                </span>
              </label>
              {customMode && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={customRate || ""}
                    onChange={(e) =>
                      setCustomRate(Math.max(0, Number(e.target.value) || 0))
                    }
                    placeholder="3000"
                    className="h-8 w-24 rounded-[8px] border border-border bg-surface px-2 text-[12px] tabular-nums text-ink outline-none focus:border-blue-600"
                  />
                  <div className="inline-flex rounded-[8px] bg-white p-0.5 ring-1 ring-border">
                    {(["day", "week"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setCustomUnit(u)}
                        className={cn(
                          "rounded-[6px] px-2 py-1 text-[11px] font-semibold transition-colors",
                          customUnit === u
                            ? "bg-blue-600 text-white"
                            : "text-muted hover:text-ink",
                        )}
                      >
                        {u === "day" ? "₽/сут" : "₽/нед"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {isWeeklyCustom && (
              <div className="mt-2 text-[11px] text-blue-700">
                Поле «дней» в week-режиме воспринимается как недели:
                ввод «{Math.max(1, Math.round(days / 7))}» = {days} дн.
                Итого {weeks} × {rate} = {sum} ₽.
              </div>
            )}
          </div>

          {/* v0.4.82: экипировка на новый период. Если изменилась —
              сработает /equipment-change после extend, доплата висит
              как manual_charge до приёма оплаты. */}
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Экипировка на новый период
            </div>
            <EquipmentEditor value={equipment} onChange={setEquipment} />
            {equipmentChanged && (
              <div className="mt-1.5 rounded-[8px] bg-blue-50 px-2.5 py-1.5 text-[11px] text-blue-700">
                Состав экипировки изменён. После продления автоматически
                применится: доплата (или возврат на депозит) будет
                рассчитана за период от сегодня до новой даты возврата
                и попадёт в окно «Принять оплату».
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Calc label="Новый возврат" value={newEndPlanned} />
            <Calc
              label="Ставка"
              value={`${rate} ₽/${isWeeklyCustom ? "нед" : "сут"}`}
            />
            <Calc
              label="К оплате"
              value={`${fmt(sum)} ₽`}
              hint={isWeeklyCustom ? `${rate} × ${weeks} нед` : `${rate} × ${days}`}
              emphasize
            />
          </div>

          <div className="rounded-[10px] bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
            По бизнес-логике при продлении подписывается{" "}
            <b>новый договор</b>: старая аренда закроется как «Завершена», будет
            создана новая активная с тем же скутером. Залог переходит без
            повторной оплаты.
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
            onClick={handleExtend}
            className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700"
          >
            <Check size={13} /> Продлить и перейти к оплате
          </button>
        </div>
      </div>
    </div>
  );
}

function Calc({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] px-3 py-2",
        emphasize ? "bg-blue-50 text-blue-700" : "bg-surface-soft text-ink",
      )}
    >
      <div className="text-[11px] text-muted-2">{label}</div>
      <div
        className={cn(
          "font-semibold tabular-nums",
          emphasize ? "text-[16px]" : "text-[13px]",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted-2">{hint}</div>}
    </div>
  );
}
