import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, KeyRound, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useApprovalsStatus,
  usePendingApprovals,
  useApproveRequest,
  useRejectRequest,
  type ApprovalRequest,
} from "@/lib/api/approvals";
import { ACTION_META } from "@/lib/directorGate";
import { toast } from "@/lib/toast";

/**
 * Пункт 1 — «висящие подтверждения» для директора.
 *
 * Кнопка-колокольчик с ключом (бейдж = число ожидающих запросов) — в шапке
 * на десктопе и на мобиле. Открывает панель: каждая карточка — краткий
 * отчёт операции (что произойдёт, кто запросил, когда), поле ключа и
 * Подтвердить / Отклонить. Сценарий заказчика: менеджер запустил операцию →
 * позвонил директору → директор открыл с телефона, ознакомился, ввёл ключ.
 */

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "только что";
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return new Date(iso).toLocaleDateString("ru-RU");
}

/** Кнопка для шапки. Рендерится только когда ключ установлен И есть запросы. */
export function ApprovalsBell({ className }: { className?: string }) {
  const { data } = useApprovalsStatus();
  const [open, setOpen] = useState(false);
  const pending = data?.pending ?? 0;
  if (!data?.keySet || pending === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Подтверждения — ждут ключ директора"
        className={cn(
          "relative flex h-9 items-center gap-1.5 rounded-full bg-amber-100 px-3 text-[12.5px] font-bold text-amber-900 transition-transform hover:scale-[1.03] active:scale-95",
          className,
        )}
      >
        <KeyRound size={15} />
        Подтверждения
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-extrabold text-white">
          {pending}
        </span>
      </button>
      {open && <ApprovalsPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function ApprovalsPanel({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = usePendingApprovals();
  const items = data?.items ?? [];
  return createPortal(
    <div
      className="fixed inset-0 z-[180] flex items-end justify-center bg-ink/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface shadow-card-lg sm:max-h-[85vh] sm:rounded-3xl"
      >
        <div className="relative shrink-0 bg-ink px-5 py-4 text-white">
          <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-amber-500/30 blur-[50px]" />
          <div className="relative flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <KeyRound size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
                Ключ директора
              </div>
              <div className="font-display text-[16px] font-bold leading-tight">
                Висящие подтверждения
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted">
              <Loader2 size={16} className="animate-spin" /> Загружаем…
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted">
              Все запросы обработаны.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((r) => (
                <ApprovalCard key={r.id} r={r} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ApprovalCard({ r }: { r: ApprovalRequest }) {
  const meta = ACTION_META[r.action];
  const approve = useApproveRequest();
  const reject = useRejectRequest();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = approve.isPending || reject.isPending;
  const details = Array.isArray(r.detailsJson) ? r.detailsJson : [];

  const run = async (kind: "approve" | "reject") => {
    if (!key.trim() || busy) return;
    setError(null);
    try {
      if (kind === "approve") {
        await approve.mutateAsync({ id: r.id, key: key.trim() });
        toast.success("Подтверждено", r.summary);
      } else {
        await reject.mutateAsync({ id: r.id, key: key.trim() });
        toast.info("Отклонено", r.summary);
      }
    } catch (e) {
      setError(
        (e as { status?: number }).status === 403
          ? "Неверный ключ."
          : "Не удалось обработать запрос.",
      );
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="px-4 pb-3 pt-3.5">
        {meta && (
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-amber-700">
            {meta.title}
          </div>
        )}
        <div className="text-[13.5px] font-bold leading-snug text-ink">
          {r.summary}
        </div>
        {details.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {details.map((d, i) => (
              <li
                key={i}
                className="flex gap-2 text-[12px] leading-snug text-muted"
              >
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-2" />
                {d}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 text-[11.5px] text-muted-2">
          Запросил{" "}
          <b className="font-semibold text-ink-2">
            {r.requestedByName ?? "сотрудник"}
          </b>{" "}
          · {timeAgo(r.createdAt)}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-border bg-surface-soft/60 px-3 py-2.5">
        <input
          type="password"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && run("approve")}
          placeholder="Ключ"
          autoComplete="off"
          className={cn(
            "h-11 w-0 min-w-0 flex-1 rounded-xl border-2 bg-surface px-3 text-center text-[15px] font-bold tracking-[0.2em] text-ink outline-none transition-colors placeholder:text-[13px] placeholder:font-normal placeholder:tracking-normal",
            error ? "border-red-300" : "border-border focus:border-blue-500",
          )}
        />
        <button
          type="button"
          onClick={() => run("approve")}
          disabled={!key.trim() || busy}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-green-ink px-4 text-[13px] font-bold text-white transition-transform hover:brightness-110 active:scale-95 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Check size={15} />
          )}
          Подтвердить
        </button>
        <button
          type="button"
          onClick={() => run("reject")}
          disabled={!key.trim() || busy}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-soft text-red-ink transition-transform hover:brightness-95 active:scale-95 disabled:opacity-40"
          title="Отклонить"
        >
          <X size={16} />
        </button>
      </div>
      {error && (
        <div className="border-t border-red-100 bg-red-50/60 px-4 py-1.5 text-center text-[12px] font-semibold text-red-ink">
          {error}
        </div>
      )}
    </div>
  );
}
