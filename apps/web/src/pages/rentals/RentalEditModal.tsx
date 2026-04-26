import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { patchRental } from "./rentalsStore";
import { useApiScooters } from "@/lib/api/scooters";
import type { Rental } from "@/lib/mock/rentals";

/**
 * Редактирование существующей аренды. Разрешено director/admin/creator.
 * Основные изменения, которые реально нужны в операционке:
 *   • привязать скутер (если не был выбран на момент создания)
 *   • сдвинуть плановую дату возврата
 *   • скорректировать тариф / сумму / заметку
 *   • сменить статус
 * Все изменения логируются в activity_log с указанием автора.
 */
export function RentalEditModal({
  rental,
  onClose,
}: {
  rental: Rental;
  onClose: () => void;
}) {
  const { data: scooters = [] } = useApiScooters();
  const [closing, setClosing] = useState(false);

  // Изначальные значения
  const initialScooterId = rental.scooterId ?? null;
  const [scooterId, setScooterId] = useState<number | null>(initialScooterId);
  // Дата выдачи скутера. Полезно при ошибке оформления (выдали 22-го,
  // а в системе записали 26-е). Формат DD.MM.YYYY.
  const [startDate, setStartDate] = useState(rental.start);
  const [startTime, setStartTime] = useState(rental.startTime ?? "14:00");
  const [endPlanned, setEndPlanned] = useState(rental.endPlanned); // DD.MM.YYYY
  const [endTime, setEndTime] = useState(rental.startTime ?? "12:00");
  const [rate, setRate] = useState<number>(rental.rate);
  const [days, setDays] = useState<number>(rental.days);
  const [note, setNote] = useState<string>(rental.note ?? "");
  const [saving, setSaving] = useState(false);

  const scooterOptions = useMemo(
    () =>
      scooters
        .filter(
          (s) =>
            !s.archivedAt &&
            (s.baseStatus === "rental_pool" || s.id === initialScooterId),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [scooters, initialScooterId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };

  const dirty =
    scooterId !== initialScooterId ||
    startDate !== rental.start ||
    startTime !== (rental.startTime ?? "14:00") ||
    endPlanned !== rental.endPlanned ||
    rate !== rental.rate ||
    days !== rental.days ||
    (note ?? "") !== (rental.note ?? "");

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Готовим PATCH: новая сумма = rate * days (если поменяли)
      const newSum = rate * days;

      // scooterId меняется отдельным PATCH, т.к. patchRental из Rental-типа
      // не умеет в scooterId. Делаем прямо через API.
      if (scooterId !== initialScooterId) {
        await api.patch(`/api/rentals/${rental.id}`, {
          scooterId,
        });
      }

      // Остальные поля через стандартный хелпер
      const patch: Partial<Rental> = {};
      if (startDate !== rental.start) patch.start = startDate;
      if (endPlanned !== rental.endPlanned) patch.endPlanned = endPlanned;
      if (rate !== rental.rate) patch.rate = rate;
      if (days !== rental.days) {
        patch.days = days;
        patch.sum = newSum;
      }
      if ((note ?? "") !== (rental.note ?? "")) {
        patch.note = note.trim() || undefined;
      }
      // startTime используется для конвертации start/endPlanned в ISO
      patch.startTime = startTime;
      if (Object.keys(patch).length > 0) {
        patchRental(rental.id, patch);
      }

      toast.success(
        "Аренда изменена",
        "Запись добавлена в журнал действий на дашборде.",
      );
      requestClose();
    } catch (e) {
      toast.error("Не удалось сохранить", (e as Error).message ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/55 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "mt-16 w-full max-w-[520px] overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Изменить аренду
            </div>
            <div className="text-[15px] font-bold text-ink">
              Аренда #{String(rental.id).padStart(4, "0")}
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <Field label="Скутер">
            {scooterOptions.length === 0 ? (
              <div className="text-[12px] text-muted">
                Нет доступных скутеров (статус «Парк аренды»). Отправьте
                скутер в парк аренды из карточки скутера.
              </div>
            ) : (
              <select
                value={scooterId ?? ""}
                onChange={(e) =>
                  setScooterId(e.target.value ? Number(e.target.value) : null)
                }
                className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
              >
                <option value="">— не выбран —</option>
                {scooterOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div className="grid grid-cols-[1.3fr_1fr] gap-2">
            <Field label="Дата выдачи (ДД.ММ.ГГГГ)">
              <input
                type="text"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="22.04.2026"
                className="h-10 w-full rounded-[10px] border border-border bg-white px-3 font-mono text-[14px] outline-none focus:border-blue"
              />
            </Field>
            <Field label="Время">
              <input
                type="text"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="14:30"
                className="h-10 w-full rounded-[10px] border border-border bg-white px-3 font-mono text-[14px] outline-none focus:border-blue"
              />
            </Field>
          </div>

          <div className="grid grid-cols-[1.3fr_1fr] gap-2">
            <Field label="Плановый возврат (ДД.ММ.ГГГГ)">
              <input
                type="text"
                value={endPlanned}
                onChange={(e) => setEndPlanned(e.target.value)}
                placeholder="26.04.2026"
                className="h-10 w-full rounded-[10px] border border-border bg-white px-3 font-mono text-[14px] outline-none focus:border-blue"
              />
            </Field>
            <Field label="Время">
              <input
                type="text"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder="14:30"
                className="h-10 w-full rounded-[10px] border border-border bg-white px-3 font-mono text-[14px] outline-none focus:border-blue"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Тариф, ₽/сут">
              <input
                type="number"
                value={rate}
                onChange={(e) => setRate(Math.max(0, Number(e.target.value) || 0))}
                className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
              />
            </Field>
            <Field label="Дней">
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
              />
            </Field>
          </div>

          <div className="rounded-[10px] bg-surface-soft px-3 py-2 text-[12px] text-muted">
            Новая сумма: <b className="text-ink">{(rate * days).toLocaleString("ru-RU")} ₽</b>
          </div>

          <Field label="Заметка">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-blue"
            />
          </Field>

          <div className="text-[11px] text-muted-2">
            Изменения фиксируются в журнале действий с указанием автора.
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full bg-surface px-4 py-2 text-[13px] font-semibold text-ink-2 hover:bg-border"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!dirty || saving}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
              !dirty || saving
                ? "cursor-not-allowed bg-surface text-muted-2"
                : "bg-ink text-white hover:bg-blue-600",
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      {children}
    </div>
  );
}
