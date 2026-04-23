/**
 * Глобальная система уведомлений. Заменяет alert() везде в приложении.
 * Стилизовано, плавающее в правом нижнем углу, автоматически скрывается.
 *
 * Использование из любого компонента:
 *   import { toast } from "@/lib/toast";
 *   toast.info("Сохранено");
 *   toast.success("Аренда создана");
 *   toast.error("Не удалось отправить в архив", "Проверьте соединение");
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastKind = "info" | "success" | "error" | "warn";

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  ttl: number;
};

type Listener = (toasts: Toast[]) => void;

const state = { toasts: [] as Toast[] };
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(state.toasts));
}

function push(
  kind: ToastKind,
  title: string,
  message?: string,
  ttl = 4500,
): string {
  const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  state.toasts = [...state.toasts, { id, kind, title, message, ttl }];
  emit();
  return id;
}

function dismiss(id: string) {
  state.toasts = state.toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  info: (title: string, message?: string) => push("info", title, message),
  success: (title: string, message?: string) => push("success", title, message),
  error: (title: string, message?: string) => push("error", title, message, 6000),
  warn: (title: string, message?: string) => push("warn", title, message, 5500),
  dismiss,
};

export function useToasts(): Toast[] {
  const [list, setList] = useState<Toast[]>(state.toasts);
  useEffect(() => {
    const l: Listener = (ts) => setList([...ts]);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return list;
}

export function ToastContainer() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex max-w-[380px] flex-col gap-2">
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastRow({ toast: t }: { toast: Toast }) {
  const ref = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setClosing(true);
      window.setTimeout(() => dismiss(t.id), 180);
    }, t.ttl);
    return () => window.clearTimeout(timer);
  }, [t.id, t.ttl]);

  const Icon =
    t.kind === "success"
      ? CheckCircle2
      : t.kind === "error"
        ? AlertTriangle
        : t.kind === "warn"
          ? AlertTriangle
          : Info;

  const colors =
    t.kind === "success"
      ? "border-green/40 bg-green-soft"
      : t.kind === "error"
        ? "border-red/40 bg-red-soft"
        : t.kind === "warn"
          ? "border-amber-400/40 bg-amber-50"
          : "border-blue-600/30 bg-blue-50";
  const iconCls =
    t.kind === "success"
      ? "text-green-ink"
      : t.kind === "error"
        ? "text-red-ink"
        : t.kind === "warn"
          ? "text-amber-700"
          : "text-blue-700";

  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 rounded-2xl border bg-surface p-3 shadow-card-lg transition-all",
        colors,
        closing
          ? "translate-x-6 opacity-0"
          : "animate-toast-in translate-x-0 opacity-100",
      )}
    >
      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", iconCls)}>
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-ink">{t.title}</div>
        {t.message && (
          <div className="mt-0.5 text-[12px] leading-snug text-ink-2">
            {t.message}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          setClosing(true);
          window.setTimeout(() => dismiss(t.id), 150);
        }}
        className="shrink-0 text-muted-2 hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* ========== Стилизованный confirm ========== */

type ConfirmArgs = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type ConfirmState = ConfirmArgs & {
  resolve: (ok: boolean) => void;
};

const confirmListeners = new Set<(s: ConfirmState | null) => void>();
let confirmState: ConfirmState | null = null;

function emitConfirm() {
  confirmListeners.forEach((l) => l(confirmState));
}

/**
 * Показать модалку подтверждения. Возвращает Promise<boolean>.
 * Пример:
 *   const ok = await confirmDialog({ title: "Удалить?", danger: true });
 *   if (!ok) return;
 */
export function confirmDialog(args: ConfirmArgs): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState = { ...args, resolve };
    emitConfirm();
  });
}

const ConfirmCtx = createContext<ConfirmState | null>(null);

export function ConfirmContainer() {
  const [s, setS] = useState<ConfirmState | null>(confirmState);
  useEffect(() => {
    const l = (next: ConfirmState | null) => setS(next);
    confirmListeners.add(l);
    return () => {
      confirmListeners.delete(l);
    };
  }, []);

  if (!s) return null;
  const close = (ok: boolean) => {
    s.resolve(ok);
    confirmState = null;
    emitConfirm();
  };

  return (
    <ConfirmCtx.Provider value={s}>
      <div
        className="fixed inset-0 z-[1100] flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm"
        onClick={() => close(false)}
      >
        <div
          className="w-full max-w-[420px] overflow-hidden rounded-2xl bg-surface shadow-card-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3 border-b border-border px-5 py-4">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                s.danger ? "bg-red-soft text-red-ink" : "bg-blue-50 text-blue-700",
              )}
            >
              <AlertTriangle size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold text-ink">{s.title}</div>
              {s.message && (
                <div className="mt-1 text-[13px] leading-relaxed text-ink-2">
                  {s.message}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 bg-surface-soft px-5 py-3">
            <button
              type="button"
              onClick={() => close(false)}
              className="rounded-full bg-surface px-4 py-2 text-[13px] font-semibold text-ink-2 hover:bg-border"
            >
              {s.cancelText ?? "Отмена"}
            </button>
            <button
              type="button"
              onClick={() => close(true)}
              className={cn(
                "rounded-full px-4 py-2 text-[13px] font-bold text-white",
                s.danger
                  ? "bg-red hover:bg-red/90"
                  : "bg-ink hover:bg-blue-600",
              )}
            >
              {s.confirmText ?? "Подтвердить"}
            </button>
          </div>
        </div>
      </div>
    </ConfirmCtx.Provider>
  );
}

/** Обёртка на случай если где-то пригодится {children} */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ToastContainer />
      <ConfirmContainer />
    </>
  );
}

// suppress unused
void useContext;
