import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, LogOut, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import {
  authKeys,
  useChangePassword,
  useLogout,
  useMe,
} from "@/lib/api/auth";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Блокирующий экран: юзеру выставлен must_change_password.
 * Закрыть его можно ТОЛЬКО сменив пароль (или выйти и перезайти).
 */
export function ForceChangePassword() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const mut = useChangePassword();
  const logoutMut = useLogout();

  const [current, setCurrent] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const err2 =
    pwd.length > 0 && pwd.length < 6
      ? "Минимум 6 символов"
      : pwd2.length > 0 && pwd !== pwd2
        ? "Пароли не совпадают"
        : null;

  const canSubmit = current.length > 0 && pwd.length >= 6 && pwd === pwd2;

  const submit = async () => {
    setErr(null);
    try {
      await mut.mutateAsync({ currentPassword: current, newPassword: pwd });
      // После успеха инвалидируем me — mustChangePassword станет false
      // и App поднимет основной интерфейс.
      await qc.invalidateQueries({ queryKey: authKeys.me });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setErr(
          "Временный пароль введён неверно. Уточните у креатора или директора.",
        );
      } else if (e instanceof ApiError && e.status === 400) {
        setErr("Пароль слишком короткий (нужно минимум 6 символов)");
      } else {
        setErr("Не удалось сменить пароль. Попробуйте ещё раз.");
      }
    }
  };

  const handleLogout = async () => {
    try {
      await logoutMut.mutateAsync();
    } finally {
      // см. комментарий в Topbar.handleLogout — в Electron "/" ломает экран
      window.location.reload();
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0d14] text-white">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-amber-500/15 blur-[140px]" />
      </div>

      <div className="relative z-10 w-full max-w-[460px] rounded-2xl border border-white/10 bg-white/[0.05] p-7 shadow-[0_20px_80px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
        <div className="mb-3 flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200">
          <ShieldAlert size={12} />
          Требуется смена пароля
        </div>
        <h1 className="font-display text-[24px] font-bold leading-tight text-white">
          Здравствуйте, {me?.name?.split(/\s+/)[0] ?? "сотрудник"}!
        </h1>
        <p className="mt-1.5 text-[13px] text-white/70">
          Вам выдан временный пароль. Перед тем как начать работать, задайте
          свой — никто (даже создатель системы) его не увидит.
        </p>

        <div className="mt-5 flex flex-col gap-2.5">
          <PwdInput
            value={current}
            onChange={(v) => {
              setCurrent(v);
              setErr(null);
            }}
            placeholder="Временный пароль"
            show={show}
            onToggleShow={() => setShow((v) => !v)}
            autoComplete="current-password"
          />
          <PwdInput
            value={pwd}
            onChange={(v) => {
              setPwd(v);
              setErr(null);
            }}
            placeholder="Новый пароль (мин. 6 символов)"
            show={show}
            onToggleShow={() => setShow((v) => !v)}
            autoComplete="new-password"
          />
          <PwdInput
            value={pwd2}
            onChange={(v) => {
              setPwd2(v);
              setErr(null);
            }}
            placeholder="Повторите новый пароль"
            show={show}
            onToggleShow={() => setShow((v) => !v)}
            autoComplete="new-password"
          />
        </div>

        {err2 && (
          <div className="mt-2 text-[12px] font-semibold text-red-300">
            {err2}
          </div>
        )}
        {err && (
          <div className="mt-3 rounded-[10px] border border-red-400/30 bg-red-500/15 px-3 py-2 text-[12px] text-red-100">
            {err}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || mut.isPending}
          className={cn(
            "mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-[14px] font-bold transition-all",
            !canSubmit || mut.isPending
              ? "cursor-not-allowed bg-white/10 text-white/40"
              : "bg-white text-[#0a0d14] hover:bg-emerald-50",
          )}
        >
          {mut.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <KeyRound size={16} />
          )}
          Сменить пароль и войти
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white/5 px-4 py-2 text-[12px] font-semibold text-white/60 hover:bg-white/10 hover:text-white"
        >
          <LogOut size={13} /> Выйти
        </button>
      </div>
    </div>
  );
}

function PwdInput({
  value,
  onChange,
  placeholder,
  show,
  onToggleShow,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  show: boolean;
  onToggleShow: () => void;
  autoComplete?: string;
}) {
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="h-11 w-full rounded-[12px] border border-white/15 bg-white/[0.06] px-4 pr-10 text-[14px] text-white outline-none placeholder:text-white/30 focus:border-emerald-400/60 focus:bg-white/[0.08]"
      />
      <button
        type="button"
        onClick={onToggleShow}
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
