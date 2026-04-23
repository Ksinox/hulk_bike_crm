import { useEffect, useState } from "react";
import { Loader2, Power, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { usePatchUser, type ApiStaffUser } from "@/lib/api/users";

const ROLES: { id: Exclude<ApiStaffUser["role"], "creator">; label: string }[] = [
  { id: "director", label: "Директор" },
  { id: "admin", label: "Администратор" },
  { id: "mechanic", label: "Механик" },
  { id: "accountant", label: "Бухгалтер" },
];

export function StaffEditModal({
  user,
  isSelf,
  onClose,
}: {
  user: ApiStaffUser;
  isSelf: boolean;
  onClose: () => void;
}) {
  const mut = usePatchUser();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<ApiStaffUser["role"]>(user.role);
  const [active, setActive] = useState(user.active);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isCreator = user.role === "creator";
  const dirty =
    name.trim() !== user.name.trim() ||
    role !== user.role ||
    active !== user.active;

  const submit = async () => {
    setErr(null);
    try {
      const patch: Parameters<typeof mut.mutateAsync>[0]["patch"] = {};
      if (name.trim() !== user.name.trim()) patch.name = name.trim();
      if (role !== user.role && role !== "creator")
        patch.role = role as Exclude<ApiStaffUser["role"], "creator">;
      if (active !== user.active) patch.active = active;
      if (Object.keys(patch).length === 0) return onClose();
      await mut.mutateAsync({ id: user.id, patch });
      onClose();
    } catch (e) {
      setErr(
        e instanceof ApiError && e.status === 400
          ? "Нельзя деактивировать самого себя"
          : "Не удалось сохранить изменения",
      );
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
          <div className="text-[15px] font-bold text-ink">
            Изменить сотрудника
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
          <div className="text-[11px] text-muted-2">
            Логин{" "}
            <span className="font-mono font-bold text-muted">
              @{user.login}
            </span>{" "}
            нельзя поменять. Чтобы сменить пароль — откройте «Сбросить пароль».
          </div>

          <Field label="Имя">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
            />
          </Field>

          {!isCreator && (
            <Field label="Роль">
              <div className="flex flex-wrap gap-1.5">
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRole(r.id)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
                      role === r.id
                        ? "bg-ink text-white"
                        : "bg-surface-soft text-ink-2 hover:bg-blue-50",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {!isSelf && (
            <Field label="Доступ к системе">
              <button
                type="button"
                onClick={() => setActive((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
                  active
                    ? "bg-green-soft text-green-ink hover:bg-green/20"
                    : "bg-surface-soft text-muted-2 hover:bg-red-soft hover:text-red-ink",
                )}
              >
                <Power size={13} />
                {active ? "Активен (может входить)" : "Отключён"}
              </button>
              <div className="mt-1.5 text-[11px] text-muted-2">
                Отключённый сотрудник не сможет войти, но его история работы
                сохраняется.
              </div>
            </Field>
          )}

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
              disabled={!dirty || mut.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
                !dirty || mut.isPending
                  ? "cursor-not-allowed bg-surface-soft text-muted-2"
                  : "bg-ink text-white hover:bg-blue-600",
              )}
            >
              {mut.isPending && <Loader2 size={14} className="animate-spin" />}
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      {children}
    </div>
  );
}
