import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trash2, X, Link2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast, confirmDialog } from "@/lib/toast";
import {
  patchRental,
  getRentalChainIds,
  useRentals,
  useArchivedRentals,
  useChainPayments,
} from "./rentalsStore";
import { useDeleteRental } from "@/lib/api/rentals";
import type { Rental } from "@/lib/mock/rentals";

/**
 * Редактирование существующей аренды + связок (продлений).
 *
 * Если у аренды есть цепочка (parent + child-продления), сверху появляется
 * список «связок». Можно переключаться между ними — форма ниже редактирует
 * выбранную связку. Каждую связку можно удалить, если у неё нет более
 * поздних продлений (иначе нарушится цепочка).
 */
export function RentalEditModal({
  rental,
  onClose,
}: {
  rental: Rental;
  onClose: () => void;
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

  // === Цепочка продлений ===
  const activeRentals = useRentals();
  const archivedRentals = useArchivedRentals();
  const allRentals = useMemo(
    () => [...activeRentals, ...archivedRentals],
    [activeRentals, archivedRentals],
  );
  const chainIds = useMemo(
    () => getRentalChainIds(rental.id, allRentals),
    [rental.id, allRentals],
  );
  const chainRentals = useMemo(
    () =>
      chainIds
        .map((id) => allRentals.find((r) => r.id === id))
        .filter((r): r is Rental => !!r)
        // Скрываем вручную удалённые связки (archivedBy != null).
        // Авто-архивные родители при продлении (archivedBy == null) остаются.
        .filter((r) => !r.archivedBy),
    [chainIds, allRentals],
  );
  const hasChain = chainRentals.length > 1;

  // Сводные метрики по живым связкам — для отображения в шапке модалки.
  // При сохранении/удалении они обновляются реактивно через react-query.
  const liveChainIds = useMemo(
    () => chainRentals.map((r) => r.id),
    [chainRentals],
  );
  const chainPays = useChainPayments(liveChainIds);
  const chainDays = chainRentals.reduce((s, r) => s + (r.days || 0), 0);
  const chainSum = chainRentals.reduce((s, r) => s + (r.sum || 0), 0);
  const chainPaid = chainPays
    .filter((p) => p.paid && p.type !== "refund" && p.type !== "deposit")
    .reduce((s, p) => s + p.amount, 0);

  // Текущая связка для редактирования
  const [currentId, setCurrentId] = useState<number>(rental.id);
  const currentRental =
    chainRentals.find((r) => r.id === currentId) ?? rental;

  const deleteRental = useDeleteRental();

  /** У этой связки есть более поздние продления, ссылающиеся на неё? */
  const hasChildren = (id: number): boolean =>
    allRentals.some((r) => r.parentRentalId === id);

  const onDeleteSegment = async (segId: number) => {
    if (hasChildren(segId)) {
      toast.error(
        "Нельзя удалить",
        "У этой связки есть более поздние продления. Сначала удалите их.",
      );
      return;
    }
    const ok = await confirmDialog({
      title: "Удалить связку?",
      message: `Связка #${String(segId).padStart(4, "0")} будет перемещена в архив. Если это была единственная связка — вся аренда уйдёт в архив.`,
      confirmText: "Удалить",
      cancelText: "Отмена",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRental.mutateAsync(segId);
      toast.success("Связка удалена", `#${String(segId).padStart(4, "0")}`);
      // Если удалили текущую — переключимся на оставшуюся ближайшую.
      if (segId === currentId) {
        const remaining = chainRentals.filter((r) => r.id !== segId);
        if (remaining.length === 0) {
          requestClose();
        } else {
          setCurrentId(remaining[remaining.length - 1]!.id);
        }
      }
    } catch (e) {
      toast.error("Не удалось удалить", (e as Error).message ?? "");
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
          "mt-12 w-full max-w-[560px] overflow-hidden rounded-2xl bg-surface shadow-card-lg",
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
              {hasChain && (
                <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                  серия из {chainRentals.length}
                </span>
              )}
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

        {/* Сводка по серии — обновляется на лету при правке/удалении связок. */}
        <div className="grid grid-cols-3 gap-2 border-b border-border bg-white px-5 py-3 text-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
              За всё время
            </div>
            <div className="font-display text-[18px] font-extrabold tabular-nums text-blue-600">
              {chainPaid.toLocaleString("ru-RU")} ₽
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
              Дней в серии
            </div>
            <div className="font-display text-[18px] font-extrabold tabular-nums text-ink">
              {chainDays}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
              План аренды
            </div>
            <div className="font-display text-[18px] font-extrabold tabular-nums text-ink">
              {chainSum.toLocaleString("ru-RU")} ₽
            </div>
          </div>
        </div>

        {hasChain && (
          <div className="border-b border-border bg-surface-soft/50 px-5 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              <Link2 size={12} /> Связки серии
            </div>
            <div className="flex flex-col gap-1">
              {chainRentals.map((seg, idx) => {
                const isActive = seg.id === currentId;
                const segHasChildren = hasChildren(seg.id);
                const isRoot = seg.parentRentalId == null;
                return (
                  <div
                    key={seg.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-[12px]",
                      isActive
                        ? "border-blue-500 bg-blue-50"
                        : "border-border bg-white hover:border-blue-300",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setCurrentId(seg.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                          isRoot
                            ? "bg-green-soft text-green-ink"
                            : "bg-purple-soft text-purple-ink",
                        )}
                      >
                        {isRoot ? "Базовая" : `Продл. ${idx}`}
                      </span>
                      <span className="font-mono font-semibold text-ink">
                        #{String(seg.id).padStart(4, "0")}
                      </span>
                      <span className="text-muted-2">
                        {seg.start.slice(0, 5)} → {seg.endPlanned.slice(0, 5)}
                      </span>
                      <span className="text-muted-2">· {seg.days} дн</span>
                      <span className="ml-auto font-semibold tabular-nums text-ink">
                        {seg.sum.toLocaleString("ru-RU")} ₽
                      </span>
                      {isActive && (
                        <ChevronRight size={12} className="text-blue-600" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSegment(seg.id)}
                      disabled={segHasChildren || deleteRental.isPending}
                      title={
                        segHasChildren
                          ? "У этой связки есть продления — удалите их сначала"
                          : "Удалить связку"
                      }
                      className={cn(
                        "rounded-[6px] p-1",
                        segHasChildren
                          ? "cursor-not-allowed text-muted-2 opacity-30"
                          : "text-muted-2 hover:bg-red-soft hover:text-red-600",
                      )}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-[11px] text-muted-2">
              Кликните по связке, чтобы её отредактировать. Удаление возможно
              только для последней связки в цепочке.
            </div>
          </div>
        )}

        <RentalEditForm
          key={currentRental.id}
          rental={currentRental}
          // После сохранения модалка НЕ закрывается — пользователь может
          // продолжить править эту связку или переключиться на другую.
          // Цифры в карточке аренды и в списке связок обновятся
          // автоматически через инвалидацию react-query.
          onSaved={() => {}}
          onCancel={requestClose}
        />
      </div>
    </div>
  );
}

/**
 * Внутренняя форма правки одной связки. Ключуется по rental.id чтобы
 * перемонтироваться (и сбросить локальное состояние) при смене связки.
 */
function RentalEditForm({
  rental,
  onSaved,
  onCancel,
}: {
  rental: Rental;
  onSaved: () => void;
  onCancel: () => void;
}) {
  // Скутер сюда не подкручивается. Замена скутера — отдельный flow через
  // карточку «Условия» (кнопка «Заменить скутер»), который создаёт новую
  // связку. Здесь меняются только параметры: даты, тариф, дни, заметка.
  const [startDate, setStartDate] = useState(rental.start);
  const [startTime, setStartTime] = useState(rental.startTime ?? "14:00");
  const [endPlanned, setEndPlanned] = useState(rental.endPlanned);
  const [endTime, setEndTime] = useState(rental.startTime ?? "12:00");
  const [rate, setRate] = useState<number>(rental.rate);
  const initialDays =
    computeDaysBetween(rental.start, rental.endPlanned) ?? rental.days;
  const [days, setDays] = useState<number>(initialDays);
  const [note, setNote] = useState<string>(rental.note ?? "");
  const [saving, setSaving] = useState(false);

  const lastChanged = useRef<"dates" | "days" | "init">("init");

  useEffect(() => {
    if (lastChanged.current === "days") {
      lastChanged.current = "init";
      return;
    }
    const d = computeDaysBetween(startDate, endPlanned);
    if (d != null && d !== days) {
      lastChanged.current = "dates";
      setDays(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endPlanned]);

  useEffect(() => {
    if (lastChanged.current === "dates") {
      lastChanged.current = "init";
      return;
    }
    const newEnd = addDaysToDDMMYYYY(startDate, days);
    if (newEnd && newEnd !== endPlanned) {
      lastChanged.current = "days";
      setEndPlanned(newEnd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const dirty =
    startDate !== rental.start ||
    startTime !== (rental.startTime ?? "14:00") ||
    endPlanned !== rental.endPlanned ||
    rate !== rental.rate ||
    days !== rental.days ||
    rate * days !== rental.sum ||
    (note ?? "") !== (rental.note ?? "");

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const newSum = rate * days;

      const patch: Partial<Rental> = {};
      if (startDate !== rental.start) patch.start = startDate;
      if (endPlanned !== rental.endPlanned) patch.endPlanned = endPlanned;
      if (rate !== rental.rate) patch.rate = rate;
      if (days !== rental.days) patch.days = days;
      if (newSum !== rental.sum) patch.sum = newSum;
      if ((note ?? "") !== (rental.note ?? "")) {
        patch.note = note.trim() || undefined;
      }
      patch.startTime = startTime;
      if (Object.keys(patch).length > 0) {
        patchRental(rental.id, patch);
      }

      toast.success(
        "Связка изменена",
        "Запись добавлена в журнал действий на дашборде.",
      );
      onSaved();
    } catch (e) {
      toast.error("Не удалось сохранить", (e as Error).message ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="rounded-[10px] bg-blue-50 px-3 py-2 text-[12px] text-blue-700">
          Замена скутера — отдельная операция. Откройте вкладку{" "}
          <b>«Условия»</b> и нажмите «Заменить скутер» рядом с карточкой
          скутера.
        </div>

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
              onChange={(e) =>
                setRate(Math.max(0, Number(e.target.value) || 0))
              }
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
            />
          </Field>
          <Field label="Дней">
            <input
              type="number"
              value={days}
              onChange={(e) =>
                setDays(Math.max(1, Number(e.target.value) || 1))
              }
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
            />
          </Field>
        </div>

        <div className="rounded-[10px] bg-surface-soft px-3 py-2 text-[12px] text-muted">
          Новая сумма по этой связке:{" "}
          <b className="text-ink">
            {(rate * days).toLocaleString("ru-RU")} ₽
          </b>
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
          onClick={onCancel}
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
    </>
  );
}

/** Парсит «DD.MM.YYYY» в Date или null если формат битый. */
function parseDDMMYYYY(s: string): Date | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (
    d.getFullYear() !== yyyy ||
    d.getMonth() !== mm - 1 ||
    d.getDate() !== dd
  ) {
    return null;
  }
  return d;
}

function fmtDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function computeDaysBetween(startStr: string, endStr: string): number | null {
  const s = parseDDMMYYYY(startStr);
  const e = parseDDMMYYYY(endStr);
  if (!s || !e) return null;
  const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000);
  return diff > 0 ? diff : null;
}

function addDaysToDDMMYYYY(startStr: string, days: number): string | null {
  const s = parseDDMMYYYY(startStr);
  if (!s) return null;
  const e = new Date(s.getTime() + days * 86_400_000);
  return fmtDDMMYYYY(e);
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
