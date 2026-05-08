import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  REJECTION_REASON_LABEL,
  type ApiApplication,
  type RejectInput,
  type RejectionReasonCode,
} from "@/lib/api/clientApplications";

const REASON_OPTIONS: { id: RejectionReasonCode; label: string }[] = [
  { id: "empty_photos", label: REJECTION_REASON_LABEL.empty_photos },
  { id: "unreadable", label: REJECTION_REASON_LABEL.unreadable },
  { id: "repeat_fake", label: REJECTION_REASON_LABEL.repeat_fake },
  { id: "bot", label: REJECTION_REASON_LABEL.bot },
  { id: "other", label: REJECTION_REASON_LABEL.other },
];

/**
 * Модалка причины отклонения / спама.
 * mode='reject' — клиент-отказ (нечитаемое фото, не подошёл и т.п.).
 * mode='spam'   — явный мусор (бот, повторная подделка).
 */
export function RejectApplicationModal({
  application,
  mode,
  onClose,
  onConfirm,
}: {
  application: ApiApplication;
  mode: "reject" | "spam";
  onClose: () => void;
  onConfirm: (input: RejectInput) => void | Promise<void>;
}) {
  const [reasonCode, setReasonCode] = useState<RejectionReasonCode>(
    mode === "spam" ? "bot" : "empty_photos",
  );
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm({
        reasonCode,
        reason: comment.trim() || null,
      });
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "spam" ? "Пометить как спам?" : "Отклонить заявку?";
  const cta = mode === "spam" ? "Пометить как спам" : "Отклонить";
  const ctaTone =
    mode === "spam"
      ? "bg-orange-ink hover:bg-orange-ink/90"
      : "bg-red-ink hover:bg-red-ink/90";

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-sm sm:p-8">
      <div className="my-6 w-full max-w-lg rounded-2xl bg-surface shadow-2xl">
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full text-white",
              mode === "spam" ? "bg-orange-ink" : "bg-red-ink",
            )}
          >
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1">
            <div className="text-[16px] font-bold text-ink">{title}</div>
            <div className="text-[12px] text-muted">
              {application.name || "Без имени"} ·{" "}
              {application.phone || "тел. не указан"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-soft"
          >
            <X size={16} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Причина
            </div>
            <div className="grid gap-1.5">
              {REASON_OPTIONS.map((opt) => {
                const active = reasonCode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setReasonCode(opt.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors",
                      active
                        ? "bg-ink text-white"
                        : "bg-surface-soft text-ink-2 hover:bg-blue-50 hover:text-blue-700",
                    )}
                  >
                    <span className="font-semibold">{opt.label}</span>
                    {active && (
                      <span className="text-[11px] text-white/70">выбрано</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Комментарий <span className="text-muted-2">(не обязательно)</span>
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 500))}
              placeholder="Например: на фото селфи не виден лица"
              className="min-h-[68px] w-full rounded-xl border border-border bg-surface p-3 text-[13px] outline-none focus:border-blue-600"
            />
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-full border border-border bg-surface px-4 text-[13px] font-semibold text-ink-2 hover:bg-surface-soft disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-4 text-[13px] font-bold text-white transition-colors disabled:opacity-50",
              ctaTone,
            )}
          >
            {busy ? "Сохраняем…" : cta}
          </button>
        </footer>
      </div>
    </div>
  );
}
