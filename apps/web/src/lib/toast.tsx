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
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Undo2,
  X,
  XOctagon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastKind = "info" | "success" | "error" | "warn";

/** Действие «Отменить» в тосте: пока идёт полоса-таймер (ttl), клик откатывает
 *  только что сделанную операцию (наш rollback). Не успел — тост исчезнет, но
 *  откат всё ещё доступен в хронологии события. */
export type ToastAction = {
  label: string;
  onAct: () => void | Promise<void>;
};

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  ttl: number;
  action?: ToastAction;
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
  action?: ToastAction,
): string {
  const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  state.toasts = [...state.toasts, { id, kind, title, message, ttl, action }];
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
  /**
   * Тост со встроенной кнопкой отмены и полосой-таймером (по умолчанию 10 сек).
   * onAct вызывается при клике «Отменить» (наш откат операции). По умолчанию
   * вид success — «сделано, можно отменить».
   */
  action: (opts: {
    kind?: ToastKind;
    title: string;
    message?: string;
    actionLabel?: string;
    onAction: () => void | Promise<void>;
    ttl?: number;
  }) =>
    push(opts.kind ?? "success", opts.title, opts.message, opts.ttl ?? 10000, {
      label: opts.actionLabel ?? "Отменить",
      onAct: opts.onAction,
    }),
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
    <div className="pointer-events-none fixed left-3 right-3 top-3 z-[1000] flex flex-col gap-2 sm:bottom-5 sm:left-auto sm:right-5 sm:top-auto sm:w-full sm:max-w-[440px] sm:gap-3">
      <style>{`
@keyframes toastSpringIn{0%{opacity:0;transform:translateY(18px) scale(.9)}55%{opacity:1;transform:translateY(-3px) scale(1.015)}100%{transform:translateY(0) scale(1)}}
@keyframes toastSpringInTop{0%{opacity:0;transform:translateY(-18px) scale(.94)}55%{opacity:1;transform:translateY(3px) scale(1.012)}100%{transform:translateY(0) scale(1)}}
@keyframes toastBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.toast-bar{animation:toastBar linear forwards;transform-origin:left}
.toast-row:hover .toast-bar{animation-play-state:paused}
.toast-in{animation:toastSpringInTop .42s cubic-bezier(.34,1.56,.64,1) both}
@media(min-width:640px){.toast-in{animation:toastSpringIn .42s cubic-bezier(.34,1.56,.64,1) both}}
`}</style>
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} />
      ))}
    </div>
  );
}

const TOAST_ICON = {
  success: CheckCircle2,
  warn: AlertTriangle,
  info: Info,
  error: XOctagon,
} as const;

// Светлый стиль (как AlertToast default): белый фон, цветная рамка/иконка.
const TOAST_BORDER: Record<ToastKind, string> = {
  success: "border-green/40",
  warn: "border-amber-300",
  info: "border-blue-300",
  error: "border-red/40",
};
const TOAST_ICON_CLS: Record<ToastKind, string> = {
  success: "text-green-ink",
  warn: "text-amber-500",
  info: "text-blue-500",
  error: "text-red",
};
const TOAST_BAR_CLS: Record<ToastKind, string> = {
  success: "bg-green",
  warn: "bg-amber-400",
  info: "bg-blue-500",
  error: "bg-red",
};

function ToastRow({ toast: t }: { toast: Toast }) {
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  // Пауза таймера авто-закрытия при наведении (чтобы успеть прочитать/отменить).
  const remainingRef = useRef(t.ttl);
  const startRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const close = () => {
    setClosing(true);
    window.setTimeout(() => dismiss(t.id), 200);
  };

  useEffect(() => {
    const startTimer = () => {
      startRef.current = performance.now();
      timerRef.current = window.setTimeout(close, remainingRef.current);
    };
    startTimer();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id]);

  const pause = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      remainingRef.current -= performance.now() - startRef.current;
    }
  };
  const resume = () => {
    startRef.current = performance.now();
    timerRef.current = window.setTimeout(close, Math.max(300, remainingRef.current));
  };

  const Icon = TOAST_ICON[t.kind];

  const onUndo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await t.action?.onAct();
    } finally {
      close();
    }
  };

  return (
    <div
      onMouseEnter={pause}
      onMouseLeave={resume}
      role="alert"
      className={cn(
        "toast-row pointer-events-auto relative w-full overflow-hidden rounded-xl border bg-surface shadow-card-lg",
        TOAST_BORDER[t.kind],
        closing
          ? "-translate-y-2 opacity-0 transition-all duration-200 sm:translate-y-0 sm:translate-x-4"
          : "toast-in",
      )}
    >
      <div className="flex items-start gap-2.5 p-3 pb-3.5 sm:gap-3.5 sm:p-4 sm:pb-[18px]">
        <Icon
          size={26}
          className={cn(
            "mt-0.5 h-[22px] w-[22px] shrink-0 sm:h-[26px] sm:w-[26px]",
            TOAST_ICON_CLS[t.kind],
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold leading-tight text-ink sm:text-[15.5px]">
            {t.title}
          </div>
          {t.message && (
            <div className="mt-0.5 text-[12.5px] leading-snug text-ink-2 sm:mt-1 sm:text-[13.5px]">
              {t.message}
            </div>
          )}
          {t.action && (
            <button
              type="button"
              onClick={onUndo}
              disabled={busy}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-surface-soft px-3 py-1.5 text-[12.5px] font-bold text-ink ring-1 ring-inset ring-border transition-colors hover:bg-border hover:text-ink active:scale-[0.98] disabled:opacity-60 sm:mt-2.5 sm:px-3.5 sm:py-2 sm:text-[13.5px]"
            >
              <Undo2 size={15} /> {busy ? "Отменяем…" : t.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Закрыть"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-muted-2 transition-colors hover:bg-surface-soft hover:text-ink"
        >
          <X size={17} />
        </button>
      </div>
      {/* Полоса-таймер снизу: бежит за ttl, на hover — пауза. */}
      {!closing && (
        <div
          className={cn("toast-bar absolute bottom-0 left-0 h-1 w-full", TOAST_BAR_CLS[t.kind])}
          style={{ animationDuration: `${t.ttl}ms` }}
        />
      )}
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

/* ========== Диалог выбора из нескольких вариантов (v0.4.4) ========== */

type PickOption<T extends string> = {
  /** Идентификатор варианта (вернётся в Promise если выбран). */
  id: T;
  label: string;
  /** Подсказка под лейблом — уточнение. */
  hint?: string;
  tone?: "default" | "danger" | "primary";
  disabled?: boolean;
};

type PickArgs<T extends string> = {
  title: string;
  message?: string;
  options: PickOption<T>[];
  cancelText?: string;
};

type PickState = {
  title: string;
  message?: string;
  options: PickOption<string>[];
  cancelText?: string;
  resolve: (id: string | null) => void;
};

const pickListeners = new Set<(s: PickState | null) => void>();
let pickState: PickState | null = null;
function emitPick() {
  pickListeners.forEach((l) => l(pickState));
}

/**
 * Показать модалку с несколькими вариантами действий + «Отмена».
 * Возвращает id выбранного варианта или null, если пользователь отменил
 * (Esc, клик мимо, кнопка «Отмена»).
 *
 * Пример:
 *   const choice = await pickAction({
 *     title: "Что списываем?",
 *     options: [
 *       { id: "days", label: "Неоплаченные дни" },
 *       { id: "fine", label: "Проценты по просроченным дням" },
 *     ],
 *   });
 *   if (choice === "days") ...
 */
export function pickAction<T extends string>(
  args: PickArgs<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    pickState = {
      title: args.title,
      message: args.message,
      options: args.options as PickOption<string>[],
      cancelText: args.cancelText,
      resolve: (id) => resolve(id as T | null),
    };
    emitPick();
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

/* ========== Контейнер pickAction-диалога ========== */

export function PickContainer() {
  const [s, setS] = useState<PickState | null>(pickState);
  useEffect(() => {
    const l = (next: PickState | null) => setS(next);
    pickListeners.add(l);
    return () => {
      pickListeners.delete(l);
    };
  }, []);

  if (!s) return null;
  const close = (id: string | null) => {
    s.resolve(id);
    pickState = null;
    emitPick();
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm"
      onClick={() => close(null)}
      onKeyDown={(e) => {
        if (e.key === "Escape") close(null);
      }}
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <div className="text-[15px] font-bold text-ink">{s.title}</div>
          {s.message && (
            <div className="mt-1 text-[13px] leading-relaxed text-ink-2">
              {s.message}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 px-5 py-3">
          {s.options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={opt.disabled}
              onClick={() => !opt.disabled && close(opt.id)}
              className={cn(
                "w-full rounded-[10px] px-4 py-2.5 text-left text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                opt.tone === "danger"
                  ? "bg-red-soft text-red-ink hover:bg-red-soft/80"
                  : opt.tone === "primary"
                    ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "bg-surface-soft text-ink hover:bg-border",
              )}
            >
              <div>{opt.label}</div>
              {opt.hint && (
                <div className="mt-0.5 text-[11px] font-normal opacity-80">
                  {opt.hint}
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="flex justify-end border-t border-border bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={() => close(null)}
            className="rounded-full bg-surface px-4 py-2 text-[13px] font-semibold text-ink-2 hover:bg-border"
          >
            {s.cancelText ?? "Отмена"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========== Стилизованный prompt — ввод текста (v0.8.20) ========== */

type PromptArgs = {
  title: string;
  message?: string;
  placeholder?: string;
  initial?: string;
  multiline?: boolean;
  confirmText?: string;
  cancelText?: string;
};
type PromptState = PromptArgs & { resolve: (v: string | null) => void };
const promptListeners = new Set<(s: PromptState | null) => void>();
let promptState: PromptState | null = null;
function emitPrompt() {
  promptListeners.forEach((l) => l(promptState));
}

/**
 * Стилизованная замена window.prompt. Возвращает введённый текст (trimmed)
 * или null при отмене/пустом вводе. Единый стиль с confirmDialog/pickAction.
 */
export function promptDialog(args: PromptArgs): Promise<string | null> {
  return new Promise((resolve) => {
    promptState = { ...args, resolve };
    emitPrompt();
  });
}

export function PromptContainer() {
  const [s, setS] = useState<PromptState | null>(promptState);
  const [val, setVal] = useState("");
  useEffect(() => {
    const l = (next: PromptState | null) => {
      setS(next);
      setVal(next?.initial ?? "");
    };
    promptListeners.add(l);
    return () => {
      promptListeners.delete(l);
    };
  }, []);
  if (!s) return null;
  const close = (v: string | null) => {
    s.resolve(v);
    promptState = null;
    emitPrompt();
  };
  const submit = () => close(val.trim() ? val.trim() : null);
  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm"
      onClick={() => close(null)}
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <div className="text-[15px] font-bold text-ink">{s.title}</div>
          {s.message && (
            <div className="mt-1 text-[13px] leading-relaxed text-ink-2">
              {s.message}
            </div>
          )}
        </div>
        <div className="px-5 py-4">
          {s.multiline ? (
            <textarea
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value)}
              rows={3}
              placeholder={s.placeholder}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                if (e.key === "Escape") close(null);
              }}
              className="w-full resize-none rounded-[10px] border border-border bg-surface-soft px-3 py-2 text-[13px] text-ink outline-none focus:ring-2 focus:ring-blue-100"
            />
          ) : (
            <input
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder={s.placeholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") close(null);
              }}
              className="w-full rounded-[10px] border border-border bg-surface-soft px-3 py-2 text-[13px] text-ink outline-none focus:ring-2 focus:ring-blue-100"
            />
          )}
        </div>
        <div className="flex items-center justify-end gap-2 bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={() => close(null)}
            className="rounded-full bg-surface px-4 py-2 text-[13px] font-semibold text-ink-2 hover:bg-border"
          >
            {s.cancelText ?? "Отмена"}
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-600"
          >
            {s.confirmText ?? "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Обёртка на случай если где-то пригодится {children} */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ToastContainer />
      <ConfirmContainer />
      <PickContainer />
      <PromptContainer />
    </>
  );
}

// suppress unused
void useContext;
