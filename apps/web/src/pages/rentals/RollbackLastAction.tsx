import { useMemo, useState } from "react";
import { Undo2, X, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { useApiPayments } from "@/lib/api/payments";
import { rollbackLastPayment } from "./rentalsStore";
import type { Rental } from "@/lib/mock/rentals";

/**
 * «Откатить последнее действие» — защита от ошибочных действий «в день
 * совершения». Phase 1: откат ПРОДЛЕНИЯ.
 *
 * UX (по правке заказчика): НЕ отдельная плашка с текстом, а просто кнопка
 * «Откатить» ПРЯМО НА СТРОКЕ той операции в хронологии, для которой откат
 * доступен. Условие истекло (наступил следующий день) — кнопки больше нет.
 * По аналогии так же будет для любых будущих откатываемых операций.
 *
 *   • useRollbackTarget(rental) — есть ли сегодня откатываемое продление
 *     (последний платёж аренды с пометкой «продление на N дн» за сегодня).
 *   • <RollbackButton rental target /> — маленькая кнопка + окно подтверждения
 *     «было → станет». Рендерится оверлеем на строке продления в InlineHistory.
 *
 * Бэк проверяет границу (сегодня по МСК, это последнее действие, аренда не в
 * архиве), восстанавливает аренду из снимка и удаляет платёж продления. Сам
 * откат пишется в хронологию (action: payment_rolled_back).
 */

export type RollbackTarget = {
  paymentId: number;
  extraDays: number;
  amount: number;
};

function fmtRub(n: number): string {
  return n.toLocaleString("ru-RU");
}

/** ДД.ММ.ГГГГ → Date (локальная полночь) или null. */
function parseRu(s: string): Date | null {
  const m = s?.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}
function fmtRu(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}
/** Календарная дата по Москве (YYYY-MM-DD) из ISO — для границы «сегодня». */
function mskDay(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Есть ли у аренды откатываемое СЕГОДНЯ продление? Последнее действие аренды =
 * платёж с максимальным createdAt. Откатываемо, если он СЕГОДНЯ (МСК) и это
 * продление (по примечанию «продление на N дн»).
 */
export function useRollbackTarget(rental: Rental): RollbackTarget | null {
  const { data: payments } = useApiPayments(rental.id);
  return useMemo<RollbackTarget | null>(() => {
    const rows = (payments ?? []).filter((p) => p.rentalId === rental.id);
    if (!rows.length) return null;
    const last = [...rows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
    if (!last) return null;
    if (mskDay(last.createdAt) !== mskDay(new Date().toISOString())) return null;
    const m = (last.note ?? "").match(/продлени[ея]\s+на\s+(\d+)\s*дн/i);
    if (!m) return null;
    return { paymentId: last.id, extraDays: Number(m[1]), amount: last.amount };
  }, [payments, rental.id]);
}

export function RollbackButton({
  rental,
  target,
}: {
  rental: Rental;
  target: RollbackTarget;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const curEnd = parseRu(rental.endPlanned);
  const newEnd = curEnd
    ? new Date(curEnd.getTime() - target.extraDays * 86_400_000)
    : null;
  const sumAfter = rental.sum - target.amount;

  const doRollback = async () => {
    setBusy(true);
    try {
      await rollbackLastPayment(rental.id, target.paymentId);
      toast.success("Продление откачено", `Вернулось ${fmtRub(target.amount)} ₽`);
      setOpen(false);
    } catch (e) {
      toast.error(
        "Не удалось откатить",
        e instanceof ApiError ? e.message : (e as Error)?.message ?? "",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Откатить это продление (доступно только сегодня)"
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 shadow-sm ring-1 ring-inset ring-amber-200 transition-colors hover:bg-amber-100 hover:text-amber-800"
      >
        <Undo2 size={11} /> Откатить
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-sm animate-modal-in rounded-2xl bg-surface p-5 shadow-card-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[15px] font-bold text-ink">
                Откатить продление?
              </div>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                aria-label="Закрыть"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-2 hover:bg-surface-soft"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 rounded-xl bg-surface-soft p-3">
              <Row label="Продление" before={`+${target.extraDays} дн`} after="убрать" />
              {curEnd && newEnd && (
                <Row label="Возврат" before={fmtRu(curEnd)} after={fmtRu(newEnd)} />
              )}
              <Row
                label="Сумма аренды"
                before={`${fmtRub(rental.sum)} ₽`}
                after={`${fmtRub(sumAfter)} ₽`}
                accent
              />
            </div>

            <div className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted">
              <Lock size={13} className="mt-px shrink-0" />
              Платёж продления удалится, период вернётся. Доступно только сегодня
              — завтра откатить уже нельзя.
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-soft disabled:opacity-50"
              >
                Оставить
              </button>
              <button
                type="button"
                onClick={doRollback}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-amber-600 px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                <Undo2 size={14} /> {busy ? "Откатываем…" : "Откатить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  label,
  before,
  after,
  accent,
}: {
  label: string;
  before: string;
  after: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12.5px]">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-muted-2 line-through">{before}</span>
        <span className="text-muted-2">→</span>
        <span className={cn("font-bold", accent ? "text-green-ink" : "text-ink")}>
          {after}
        </span>
      </span>
    </div>
  );
}
