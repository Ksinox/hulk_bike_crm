import { useEffect, useState } from "react";
import { KeyRound, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useResetUserPassword,
  type ApiStaffUser,
} from "@/lib/api/users";

export function StaffResetPasswordModal({
  user,
  onClose,
  onReset,
}: {
  user: ApiStaffUser;
  onClose: () => void;
  onReset: (newPassword: string) => void;
}) {
  const mut = useResetUserPassword();
  const [mode, setMode] = useState<"generate" | "manual">("generate");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSubmit = mode === "generate" || password.length >= 6;

  const submit = async () => {
    setErr(null);
    try {
      const res = await mut.mutateAsync({
        id: user.id,
        newPassword: mode === "manual" ? password : undefined,
      });
      onReset(res.newPassword);
      onClose();
    } catch {
      setErr("Не удалось сбросить пароль");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/55 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-16 w-full max-w-[440px] overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <KeyRound size={16} /> Сброс пароля
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <div className="rounded-xl bg-orange-soft/60 px-3 py-2.5 text-[12px] text-orange-ink">
            <b>{user.name}</b> (@{user.login}) — текущий пароль больше не
            будет работать. Сотрудник при ближайшем входе будет обязан
            сменить временный пароль на свой.
          </div>

          <div>
            <div className="mb-2 inline-flex rounded-full bg-surface-soft p-0.5">
              <SwitchOpt
                active={mode === "generate"}
                onClick={() => setMode("generate")}
              >
                Сгенерировать
              </SwitchOpt>
              <SwitchOpt
                active={mode === "manual"}
                onClick={() => setMode("manual")}
              >
                Задать вручную
              </SwitchOpt>
            </div>
            {mode === "manual" ? (
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                maxLength={200}
                placeholder="Мин. 6 символов"
                className="h-10 w-full rounded-[10px] border border-border bg-white px-3 font-mono text-[14px] outline-none focus:border-blue"
              />
            ) : (
              <div className="text-[12px] text-muted">
                Система сгенерирует безопасный случайный пароль и покажет его
                один раз.
              </div>
            )}
          </div>

          {err && (
            <div className="rounded-[10px] border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-ink">
              {err}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-surface-soft px-4 py-2 text-[13px] font-semibold text-ink-2 hover:bg-border"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit || mut.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
                !canSubmit || mut.isPending
                  ? "cursor-not-allowed bg-surface-soft text-muted-2"
                  : "bg-red text-white hover:bg-red/90",
              )}
            >
              {mut.isPending && <Loader2 size={14} className="animate-spin" />}
              Сбросить пароль
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SwitchOpt({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
        active ? "bg-ink text-white" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
