import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useApprovalsStatus,
  usePendingApprovals,
  useApproveRequest,
  useRejectRequest,
  type ApprovalRequest,
} from "@/lib/api/approvals";
import { ACTION_META, type BriefFact } from "@/lib/directorGate";
import { toast } from "@/lib/toast";
import { OperationBrief } from "./OperationBrief";

/**
 * «Ждут вашего решения» — запросы сотрудников директору.
 *
 * 22.10 (заказчик): директор с телефона заходит в CRM — у него уже висит
 * запрос: описана операция (что за аренда/скутер/платёж, было → стало, кто
 * просит), большая кнопка «Подтвердить». «Отклонить» случайно не нажать:
 * сначала спрашиваем «Точно отклонить?». Очередь видит только директор, и
 * при новом запросе окно открывается само.
 */

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "только что";
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return new Date(iso).toLocaleDateString("ru-RU");
}

/** Разбор деталей: новые запросы — { facts, note }, старые — массив строк. */
function detailsOf(r: ApprovalRequest): { facts: BriefFact[]; notes: string[] } {
  const d = r.detailsJson as unknown;
  if (Array.isArray(d)) return { facts: [], notes: d.filter((x): x is string => typeof x === "string") };
  if (d && typeof d === "object") {
    const o = d as { facts?: BriefFact[]; note?: string[] };
    return { facts: Array.isArray(o.facts) ? o.facts : [], notes: Array.isArray(o.note) ? o.note : [] };
  }
  return { facts: [], notes: [] };
}

const SEEN_KEY = "hulk-approvals-seen";
function readSeen(): Set<number> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as number[]);
  } catch {
    return new Set();
  }
}
function writeSeen(ids: number[]) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    /* приватный режим — просто не запоминаем */
  }
}

/** Кнопка в шапке — только у директора и только когда есть запросы. */
export function ApprovalsBell({ className }: { className?: string }) {
  const { data } = useApprovalsStatus();
  const isDirector = !!data?.isDirector;
  const pending = data?.pending ?? 0;
  const { data: list } = usePendingApprovals(isDirector && pending > 0);
  const [open, setOpen] = useState(false);

  // Новый запрос — окно открывается само (один раз на запрос).
  useEffect(() => {
    const items = list?.items ?? [];
    if (!isDirector || items.length === 0) return;
    const seen = readSeen();
    const fresh = items.filter((r) => !seen.has(r.id));
    if (fresh.length > 0) {
      writeSeen([...seen, ...fresh.map((r) => r.id)]);
      setOpen(true);
    }
  }, [list, isDirector]);

  if (!isDirector || pending === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ждут вашего решения"
        className={cn(
          "relative flex h-9 items-center gap-1.5 rounded-full bg-amber-100 px-3 text-[12.5px] font-bold text-amber-900 transition-transform hover:scale-[1.03] active:scale-95",
          className,
        )}
      >
        <span className="absolute inset-0 animate-ping rounded-full bg-amber-300/40" />
        <ShieldCheck size={15} className="relative" />
        <span className="relative hidden sm:inline">Ждут решения</span>
        <span className="relative flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-extrabold text-white">
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
        data-approvals-panel
        className="flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl bg-bg shadow-card-lg sm:max-h-[88vh] sm:rounded-3xl"
      >
        <div className="relative shrink-0 bg-ink px-5 pb-4 pt-5 text-white">
          <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-amber-500/30 blur-[50px]" />
          <div className="relative flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10">
              <ShieldCheck size={21} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
                Подтверждение директора
              </div>
              <div className="font-display text-[19px] font-bold leading-tight">
                {items.length > 1 ? `Ждут вашего решения · ${items.length}` : "Ждёт вашего решения"}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:p-4">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[14px] text-muted">
              <Loader2 size={16} className="animate-spin" /> Загружаем…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-soft text-green-ink">
                <Check size={22} strokeWidth={3} />
              </span>
              <div className="text-[15px] font-semibold text-ink">Все запросы решены</div>
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
  const [confirmReject, setConfirmReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = approve.isPending || reject.isPending;
  const { facts, notes } = detailsOf(r);
  const who = r.requestedByName ?? "Сотрудник";

  const run = async (kind: "approve" | "reject") => {
    if (busy) return;
    setError(null);
    try {
      if (kind === "approve") {
        await approve.mutateAsync({ id: r.id });
        toast.success("Подтверждено", `${who} может выполнить операцию`);
      } else {
        await reject.mutateAsync({ id: r.id });
        toast.info("Отклонено", `${who} увидит, что вы отказали`);
      }
    } catch (e) {
      setError((e as { message?: string }).message || "Не удалось — попробуйте ещё раз.");
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl bg-surface shadow-card" data-approval-card>
      {/* Кто и когда просит */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[15px] font-extrabold text-blue-700">
          {who.trim()[0]?.toUpperCase() ?? "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-ink">{who}</div>
          <div className="text-[13px] text-muted">просит подтвердить · {timeAgo(r.createdAt)}</div>
        </div>
        <KeyRound size={18} className="shrink-0 text-amber-600" />
      </div>

      <div className="px-4 py-4">
        <OperationBrief big title={meta?.title} summary={r.summary} facts={facts} notes={notes} warn={meta?.warn} />
      </div>

      {error && (
        <div className="mx-4 mb-3 rounded-xl bg-red-soft px-3 py-2 text-center text-[13px] font-semibold text-red-ink">
          {error}
        </div>
      )}

      {confirmReject ? (
        // Второй шаг: отказ — только осознанно.
        <div className="border-t border-red-100 bg-red-50/60 px-4 pb-4 pt-3">
          <div className="text-[15px] font-bold text-red-ink">Точно отклонить?</div>
          <div className="mt-0.5 text-[13px] text-muted">
            {who} увидит отказ, операция не выполнится.
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setConfirmReject(false)}
              disabled={busy}
              className="h-14 rounded-2xl bg-surface text-[15px] font-bold text-ink shadow-card-sm active:scale-[0.98]"
            >
              Не отклонять
            </button>
            <button
              type="button"
              onClick={() => run("reject")}
              disabled={busy}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-red text-[15px] font-bold text-white active:scale-[0.98] disabled:opacity-50"
            >
              {reject.isPending ? <Loader2 size={18} className="animate-spin" /> : <X size={18} strokeWidth={2.6} />}
              Да, отклонить
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={() => run("approve")}
            disabled={busy}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-green-ink text-[17px] font-bold text-white shadow-[0_6px_20px_rgba(22,163,74,0.25)] transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {approve.isPending ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} strokeWidth={3} />}
            Подтвердить
          </button>
          <button
            type="button"
            onClick={() => setConfirmReject(true)}
            disabled={busy}
            className="h-11 w-full rounded-2xl text-[14px] font-semibold text-muted transition-colors active:bg-surface-soft"
          >
            Отклонить…
          </button>
        </div>
      )}
    </div>
  );
}
