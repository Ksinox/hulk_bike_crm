import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import {
  useCreateUser,
  type CreateUserInput,
  type CreateUserResult,
} from "@/lib/api/users";

type Role = CreateUserInput["role"];
const ROLES: { id: Role; label: string }[] = [
  { id: "director", label: "Директор" },
  { id: "admin", label: "Администратор" },
  { id: "mechanic", label: "Механик" },
  { id: "accountant", label: "Бухгалтер" },
];

const COLORS: CreateUserInput["avatarColor"][] = [
  "blue",
  "green",
  "orange",
  "pink",
  "purple",
];

export function StaffAddModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (u: CreateUserResult) => void;
}) {
  const mut = useCreateUser();
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [color, setColor] = useState<CreateUserInput["avatarColor"]>("blue");
  const [passMode, setPassMode] = useState<"generate" | "manual">("generate");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSave =
    name.trim().length >= 1 &&
    /^[a-z0-9._-]{2,50}$/.test(login.trim()) &&
    (passMode === "generate" || password.length >= 6);

  const submit = async () => {
    setErr(null);
    try {
      const result = await mut.mutateAsync({
        name: name.trim(),
        login: login.trim().toLowerCase(),
        role,
        avatarColor: color,
        password: passMode === "manual" ? password : undefined,
      });
      onCreated(result);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setErr("Пользователь с таким логином уже существует");
      } else if (e instanceof ApiError && e.status === 400) {
        setErr("Проверьте поля — логин должен быть латиницей (a-z, 0-9, . _ -), 2–50 символов");
      } else {
        setErr("Не удалось создать сотрудника");
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/55 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-16 w-full max-w-[480px] overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div className="text-[15px] font-bold text-ink">Новый сотрудник</div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <Field label="Имя" hint="Как будет писаться в приветствии">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="Например: Вася Петров"
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
            />
          </Field>

          <Field
            label="Логин"
            hint="Латиница, цифры, точки/дефисы/подчёркивания. Вводить на экране входа."
          >
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value.toLowerCase())}
              maxLength={50}
              placeholder="vasya"
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 font-mono text-[14px] outline-none focus:border-blue"
            />
          </Field>

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

          <Field label="Цвет тайла на экране входа">
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-8 w-8 rounded-full transition-transform",
                    color === c && "scale-110 ring-2 ring-ink ring-offset-2",
                  )}
                  style={{ background: avatarGradient(c) }}
                  title={c}
                />
              ))}
            </div>
          </Field>

          <Field label="Пароль">
            <div className="mb-2 inline-flex rounded-full bg-surface-soft p-0.5">
              <SwitchOpt
                active={passMode === "generate"}
                onClick={() => setPassMode("generate")}
              >
                Сгенерировать
              </SwitchOpt>
              <SwitchOpt
                active={passMode === "manual"}
                onClick={() => setPassMode("manual")}
              >
                Задать вручную
              </SwitchOpt>
            </div>
            {passMode === "manual" ? (
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
                После сохранения система покажет случайный пароль один раз —
                скопируйте и передайте сотруднику.
              </div>
            )}
          </Field>

          <div className="text-[11px] text-muted-2">
            Сотрудник при первом входе будет обязан сменить пароль на свой.
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
              disabled={!canSave || mut.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
                !canSave || mut.isPending
                  ? "cursor-not-allowed bg-surface-soft text-muted-2"
                  : "bg-ink text-white hover:bg-blue-600",
              )}
            >
              {mut.isPending && <Loader2 size={14} className="animate-spin" />}
              Создать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-muted-2">{hint}</div>}
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

function avatarGradient(color?: string): string {
  switch (color) {
    case "purple":
      return "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
    case "green":
      return "linear-gradient(135deg, #10b981 0%, #047857 100%)";
    case "orange":
      return "linear-gradient(135deg, #fb923c 0%, #ea580c 100%)";
    case "pink":
      return "linear-gradient(135deg, #ec4899 0%, #be185d 100%)";
    case "blue":
    default:
      return "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)";
  }
}
