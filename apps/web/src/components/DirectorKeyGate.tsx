import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  KeyRound,
  Loader2,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api";
import {
  ACTION_META,
  setDirectorGateHandler,
  type ApprovalContext,
} from "@/lib/directorGate";

/**
 * Пункт 1 — окно «Ключ директора».
 *
 * Появляется автоматически, когда защищённое действие вернуло 428.
 * Показывает краткий отчёт операции (что произойдёт, на что повлияет) и два
 * пути: ввести ключ на месте ИЛИ отправить запрос директору — тот увидит его
 * с телефона в «Подтверждениях», ознакомится и подтвердит своим ключом.
 * Пока запрос висит — окно ждёт (поллинг), оператор может отменить.
 */

type GateState = {
  action: string;
  context: ApprovalContext | null;
  resolve: (v: string | null) => void;
};

export function DirectorKeyGateProvider() {
  const [gate, setGate] = useState<GateState | null>(null);

  useEffect(() => {
    setDirectorGateHandler(
      ({ action, context }) =>
        new Promise<string | null>((resolve) => {
          setGate({ action, context, resolve });
        }),
    );
    return () => setDirectorGateHandler(null);
  }, []);

  if (!gate) return null;
  return (
    <DirectorKeyDialog
      action={gate.action}
      context={gate.context}
      onDone={(v) => {
        gate.resolve(v);
        setGate(null);
      }}
    />
  );
}

function DirectorKeyDialog({
  action,
  context,
  onDone,
}: {
  action: string;
  context: ApprovalContext | null;
  onDone: (v: string | null) => void;
}) {
  const meta = ACTION_META[action] ?? {
    title: "Защищённое действие",
    generic: "Действие требует подтверждения ключом директора.",
  };
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Режим ожидания подтверждения директором (запрос отправлен).
  const [waitingId, setWaitingId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  // Поллинг статуса отправленного запроса (3 с).
  useEffect(() => {
    if (waitingId == null) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await api.get<{ status: string }>(
          `/api/approvals/${waitingId}`,
        );
        if (stop) return;
        if (r.status === "approved") onDone(`req:${waitingId}`);
        else if (r.status === "rejected") {
          setWaitingId(null);
          setError("Директор отклонил запрос.");
        }
      } catch {
        /* сеть мигнула — следующий тик */
      }
    };
    const t = window.setInterval(tick, 3000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [waitingId, onDone]);

  const submitKey = async () => {
    if (!key.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ ok: boolean; pass: string }>(
        "/api/approvals/verify",
        { key: key.trim(), action },
      );
      onDone(`pass:${r.pass}`);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403
          ? "Неверный ключ."
          : "Не удалось проверить ключ.",
      );
      setBusy(false);
    }
  };

  const sendToDirector = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ id: number }>("/api/approvals", {
        action,
        summary: context?.summary ?? meta.generic,
        details: context?.details,
      });
      setWaitingId(r.id);
    } catch {
      setError("Не удалось отправить запрос.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (waitingId != null) {
      try {
        await api.post(`/api/approvals/${waitingId}/cancel`, {});
      } catch {
        /* уже обработан — не мешаем закрыть */
      }
    }
    onDone(null);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[190] flex items-end justify-center bg-ink/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={cancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-t-3xl bg-surface shadow-card-lg sm:rounded-3xl"
      >
        {/* Шапка */}
        <div className="relative bg-ink px-5 py-4 text-white">
          <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-blue-600/40 blur-[50px]" />
          <div className="relative flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <KeyRound size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
                Ключ директора
              </div>
              <div className="font-display text-[16px] font-bold leading-tight">
                {meta.title}
              </div>
            </div>
            <button
              type="button"
              onClick={cancel}
              aria-label="Отмена"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          {/* Краткий отчёт операции */}
          <div className="rounded-2xl bg-surface-soft px-4 py-3">
            <div className="text-[13px] font-semibold leading-snug text-ink">
              {context?.summary ?? meta.generic}
            </div>
            {(context?.details?.length || meta.warn) && (
              <ul className="mt-2 flex flex-col gap-1">
                {(context?.details ?? []).map((d, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-[12px] leading-snug text-muted"
                  >
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-2" />
                    {d}
                  </li>
                ))}
                {meta.warn && (
                  <li className="mt-0.5 text-[12px] font-semibold text-amber-700">
                    {meta.warn}
                  </li>
                )}
              </ul>
            )}
          </div>

          {waitingId == null ? (
            <>
              {/* Ввод ключа на месте */}
              <div>
                <input
                  ref={inputRef}
                  type="password"
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && submitKey()}
                  placeholder="Ключ директора"
                  autoComplete="off"
                  className={cn(
                    "h-13 w-full rounded-2xl border-2 bg-surface px-4 py-3.5 text-center text-[18px] font-bold tracking-[0.25em] text-ink outline-none transition-colors placeholder:text-[14px] placeholder:font-normal placeholder:tracking-normal",
                    error
                      ? "border-red-300 bg-red-50/40"
                      : "border-border focus:border-blue-500",
                  )}
                />
                {error && (
                  <div className="mt-1.5 text-center text-[12.5px] font-semibold text-red-ink">
                    {error}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={submitKey}
                disabled={!key.trim() || busy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[14px] font-bold text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <ShieldCheck size={17} />
                )}
                Подтвердить
              </button>

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                  или
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              {/* Путь без ключа: запрос директору на телефон */}
              <button
                type="button"
                onClick={sendToDirector}
                disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-blue-100 bg-blue-50 text-[14px] font-bold text-blue-700 transition-colors hover:border-blue-200 hover:bg-blue-100 disabled:opacity-40"
              >
                <Smartphone size={17} />
                Отправить директору на подтверждение
              </button>
              <p className="-mt-1 text-center text-[11.5px] leading-snug text-muted-2">
                Директор увидит запрос в CRM (в том числе с телефона),
                ознакомится с операцией и подтвердит своим ключом.
              </p>
            </>
          ) : (
            <>
              {/* Ожидание подтверждения */}
              <div className="flex flex-col items-center gap-3 py-4">
                <span className="relative flex h-14 w-14 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-blue-200/70" />
                  <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                    <Smartphone size={22} />
                  </span>
                </span>
                <div className="text-center">
                  <div className="text-[14px] font-bold text-ink">
                    Запрос отправлен директору
                  </div>
                  <div className="mt-1 text-[12.5px] leading-snug text-muted">
                    Ждём подтверждения… Окно закроется само, как только
                    директор подтвердит операцию.
                  </div>
                </div>
                {error && (
                  <div className="text-[12.5px] font-semibold text-red-ink">
                    {error}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={cancel}
                className="flex h-11 w-full items-center justify-center rounded-2xl bg-surface-soft text-[13.5px] font-bold text-muted transition-colors hover:bg-border/60"
              >
                Отменить запрос
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
