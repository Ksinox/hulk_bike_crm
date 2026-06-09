import { useMemo, useState } from "react";
import { Undo2, X, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { useApiPayments } from "@/lib/api/payments";
import type { ApiActivityItem } from "@/lib/api/activity";
import { rollbackLastPayment } from "./rentalsStore";
import type { Rental } from "@/lib/mock/rentals";

/**
 * «Откатить последнее действие» — защита от ошибочных действий «в день
 * совершения». Кнопка «Откатить» висит ПРЯМО НА СТРОКЕ той операции в
 * хронологии. Условие истекло (наступил следующий день / появилось новое
 * действие сверху) — кнопки нет.
 *
 * Поддержанные операции (Phase 1–2):
 *   • extend     — продление (восстановить период/сумму, удалить платёж);
 *   • equipment  — изменение экипировки (вернуть набор, удалить доплату/
 *                  возврат; для возврата на депозит — списать обратно).
 *
 * Привязка к «последнему действию»: смотрим на самое свежее событие
 * хронологии (activity[0]). Если оно откатываемого типа, за сегодня, и ему
 * соответствует последний платёж аренды — показываем кнопку. Так кнопка не
 * «промахивается» на старое продление, если сверху лежит другое действие.
 */

export type RollbackKind = "extend" | "equipment" | "created";

export type RollbackTarget =
  | { kind: "extend"; paymentId: number; extraDays: number; amount: number }
  | { kind: "equipment"; paymentId: number; amount: number; isRefund: boolean }
  | { kind: "created"; paymentId: number; amount: number };

/** matchAction по виду — на какой строке хронологии висит кнопка. */
export const ROLLBACK_MATCH: Record<RollbackKind, (action: string) => boolean> =
  {
    extend: (a) => a.includes("extend"),
    equipment: (a) => a.includes("equipment"),
    created: (a) => a === "created",
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

export function useRollbackTarget(
  rental: Rental,
  activity: ApiActivityItem[],
): RollbackTarget | null {
  const { data: payments } = useApiPayments(rental.id);
  return useMemo<RollbackTarget | null>(() => {
    const last = activity[0];
    if (!last) return null;
    const today = mskDay(new Date().toISOString());
    if (mskDay(last.createdAt) !== today) return null;

    const rows = (payments ?? []).filter((p) => p.rentalId === rental.id);
    const lastPay = [...rows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
    if (!lastPay) return null;
    if (mskDay(lastPay.createdAt) !== today) return null;
    const note = lastPay.note ?? "";

    // Продление — последний платёж с пометкой «продление на N дн».
    if (last.action.includes("extend")) {
      const m = note.match(/продлени[ея]\s+на\s+(\d+)\s*дн/i);
      if (!m) return null;
      return {
        kind: "extend",
        paymentId: lastPay.id,
        extraDays: Number(m[1]),
        amount: lastPay.amount,
      };
    }

    // Экипировка — только если последний платёж это её доплата/возврат
    // (изменение «в долг» платежа не создаёт → откат пока не показываем).
    if (last.action.includes("equipment")) {
      if (!/экипировк/i.test(note)) return null;
      return {
        kind: "equipment",
        paymentId: lastPay.id,
        amount: lastPay.amount,
        isRefund: /возврат/i.test(note),
      };
    }

    // Создание аренды — последний платёж это «оплата аренды при создании».
    if (last.action === "created") {
      if (!/оплата\s+аренды.*создани/i.test(note)) return null;
      return { kind: "created", paymentId: lastPay.id, amount: lastPay.amount };
    }

    return null;
  }, [activity, payments, rental.id]);
}

export function RollbackButton({
  rental,
  target,
  onClose,
}: {
  rental: Rental;
  target: RollbackTarget;
  /** Откат создания аренды архивирует её — карточку нужно закрыть. */
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const doRollback = async () => {
    setBusy(true);
    try {
      await rollbackLastPayment(rental.id, target.paymentId);
      if (target.kind === "extend") {
        toast.success("Продление откачено", `Вернулось ${fmtRub(target.amount)} ₽`);
      } else if (target.kind === "created") {
        toast.success("Создание аренды откачено", "Аренда отправлена в архив");
      } else {
        toast.success(
          "Изменение экипировки откачено",
          target.isRefund
            ? `Возврат ${fmtRub(target.amount)} ₽ отменён`
            : `Доплата ${fmtRub(target.amount)} ₽ отменена`,
        );
      }
      setOpen(false);
      // Аренда ушла в архив — закрываем карточку (её больше нет в активных).
      if (target.kind === "created") onClose?.();
    } catch (e) {
      toast.error(
        "Не удалось откатить",
        e instanceof ApiError ? e.message : (e as Error)?.message ?? "",
      );
    } finally {
      setBusy(false);
    }
  };

  const title =
    target.kind === "extend"
      ? "Откатить продление?"
      : target.kind === "created"
        ? "Откатить создание аренды?"
        : "Откатить изменение экипировки?";

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Откатить это действие (доступно только сегодня)"
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
              <div className="text-[15px] font-bold text-ink">{title}</div>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                aria-label="Закрыть"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-2 hover:bg-surface-soft"
              >
                <X size={16} />
              </button>
            </div>

            {target.kind === "extend" ? (
              <ExtendPreview rental={rental} target={target} />
            ) : target.kind === "created" ? (
              <CreatedPreview target={target} />
            ) : (
              <EquipmentPreview target={target} />
            )}

            <div className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted">
              <Lock size={13} className="mt-px shrink-0" />
              {target.kind === "extend"
                ? "Платёж продления удалится, период вернётся. "
                : target.kind === "created"
                  ? "Аренда уйдёт в архив, скутер освободится, платёж создания удалится. "
                  : "Прежний набор экипировки вернётся, платёж удалится. "}
              Доступно только сегодня — завтра откатить уже нельзя.
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

function ExtendPreview({
  rental,
  target,
}: {
  rental: Rental;
  target: Extract<RollbackTarget, { kind: "extend" }>;
}) {
  const curEnd = parseRu(rental.endPlanned);
  const newEnd = curEnd
    ? new Date(curEnd.getTime() - target.extraDays * 86_400_000)
    : null;
  const sumAfter = rental.sum - target.amount;
  return (
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
  );
}

function CreatedPreview({
  target,
}: {
  target: Extract<RollbackTarget, { kind: "created" }>;
}) {
  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <Row label="Аренда" before="создана" after="в архив" />
      <Row
        label="Платёж создания"
        before={`${fmtRub(target.amount)} ₽`}
        after="удалить"
        accent
      />
    </div>
  );
}

function EquipmentPreview({
  target,
}: {
  target: Extract<RollbackTarget, { kind: "equipment" }>;
}) {
  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <Row label="Экипировка" before="изменена" after="вернуть прежнюю" />
      <Row
        label={target.isRefund ? "Возврат клиенту" : "Доплата"}
        before={`${fmtRub(target.amount)} ₽`}
        after="отменить"
        accent
      />
    </div>
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
