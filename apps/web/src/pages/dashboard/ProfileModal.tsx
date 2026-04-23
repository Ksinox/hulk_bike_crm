import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useChangePassword,
  useMe,
  useUpdateMe,
} from "@/lib/api/auth";
import { ApiError } from "@/lib/api";

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const { data: me } = useMe();
  const updateMut = useUpdateMe();
  const pwdMut = useChangePassword();

  const [name, setName] = useState(me?.name ?? "");
  const [nameMsg, setNameMsg] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nameDirty = name.trim() !== (me?.name ?? "").trim() && name.trim().length >= 1;

  const saveName = async () => {
    setNameMsg(null);
    try {
      await updateMut.mutateAsync({ name: name.trim() });
      setNameMsg({ kind: "ok", text: "Имя сохранено" });
    } catch (e) {
      setNameMsg({
        kind: "err",
        text: e instanceof ApiError ? "Ошибка сохранения" : "Не удалось сохранить",
      });
    }
  };

  const canSavePwd =
    curPwd.length > 0 &&
    newPwd.length >= 6 &&
    newPwd === newPwd2;

  const pwdError =
    newPwd.length > 0 && newPwd.length < 6
      ? "Минимум 6 символов"
      : newPwd2.length > 0 && newPwd !== newPwd2
        ? "Пароли не совпадают"
        : null;

  const savePwd = async () => {
    setPwdMsg(null);
    try {
      await pwdMut.mutateAsync({
        currentPassword: curPwd,
        newPassword: newPwd,
      });
      setPwdMsg({ kind: "ok", text: "Пароль изменён" });
      setCurPwd("");
      setNewPwd("");
      setNewPwd2("");
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 403
          ? "Текущий пароль введён неверно"
          : "Не удалось сменить пароль";
      setPwdMsg({ kind: "err", text: msg });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/55 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-16 w-full max-w-[460px] overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div className="text-[15px] font-bold text-ink">Профиль</div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          {/* Имя */}
          <Section title="Как к вам обращаться">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameMsg(null);
              }}
              maxLength={100}
              placeholder="Ваше имя"
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] text-ink outline-none focus:border-blue"
            />
            <div className="mt-1 text-[11px] text-muted-2">
              Будет отображаться в приветствии и в меню.
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={saveName}
                disabled={!nameDirty || updateMut.isPending}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12px] font-bold transition-colors",
                  !nameDirty || updateMut.isPending
                    ? "cursor-not-allowed bg-surface-soft text-muted-2"
                    : "bg-ink text-white hover:bg-blue-600",
                )}
              >
                {updateMut.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Check size={13} />
                )}
                Сохранить имя
              </button>
              {nameMsg && (
                <span
                  className={cn(
                    "text-[12px] font-semibold",
                    nameMsg.kind === "ok" ? "text-green-ink" : "text-red-ink",
                  )}
                >
                  {nameMsg.text}
                </span>
              )}
            </div>
          </Section>

          {/* Пароль */}
          <Section title="Сменить пароль">
            <div className="flex flex-col gap-2">
              <PwdInput
                value={curPwd}
                onChange={(v) => {
                  setCurPwd(v);
                  setPwdMsg(null);
                }}
                placeholder="Текущий пароль"
                show={showPwd}
                onToggleShow={() => setShowPwd((v) => !v)}
                autoComplete="current-password"
              />
              <PwdInput
                value={newPwd}
                onChange={(v) => {
                  setNewPwd(v);
                  setPwdMsg(null);
                }}
                placeholder="Новый пароль (мин. 6 символов)"
                show={showPwd}
                onToggleShow={() => setShowPwd((v) => !v)}
                autoComplete="new-password"
              />
              <PwdInput
                value={newPwd2}
                onChange={(v) => {
                  setNewPwd2(v);
                  setPwdMsg(null);
                }}
                placeholder="Повторите новый пароль"
                show={showPwd}
                onToggleShow={() => setShowPwd((v) => !v)}
                autoComplete="new-password"
              />
            </div>
            {pwdError && (
              <div className="mt-1.5 text-[12px] font-semibold text-red-ink">
                {pwdError}
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={savePwd}
                disabled={!canSavePwd || pwdMut.isPending}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12px] font-bold transition-colors",
                  !canSavePwd || pwdMut.isPending
                    ? "cursor-not-allowed bg-surface-soft text-muted-2"
                    : "bg-ink text-white hover:bg-blue-600",
                )}
              >
                {pwdMut.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Check size={13} />
                )}
                Сменить пароль
              </button>
              {pwdMsg && (
                <span
                  className={cn(
                    "text-[12px] font-semibold",
                    pwdMsg.kind === "ok" ? "text-green-ink" : "text-red-ink",
                  )}
                >
                  {pwdMsg.text}
                </span>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {title}
      </div>
      {children}
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
        className="h-10 w-full rounded-[10px] border border-border bg-white px-3 pr-10 text-[14px] text-ink outline-none focus:border-blue"
      />
      <button
        type="button"
        onClick={onToggleShow}
        tabIndex={-1}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-2 hover:text-ink"
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}
