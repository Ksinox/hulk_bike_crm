import { useEffect, useMemo, useState, type ReactNode } from "react";
import { KeyRound, Loader2, LogOut, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTabletLayout } from "@/lib/useIsMobile";
import { TABLET_DIALOG_PANEL } from "@/mobile/tablet";
import { ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Switch } from "@/components/ui/switch";
import { ChoiceCards } from "@/components/ui/choice-cards";
import {
  useCreateUser,
  useLogoutEverywhere,
  usePatchUser,
  type ApiStaffUser,
  type CreateUserResult,
  type StaffKind,
} from "@/lib/api/users";
import {
  PERMISSION_DEFS,
  defaultPerms,
  isFullAccess,
  type PermissionKey,
  type Perms,
} from "@/lib/permissions";
import { PermissionPreview } from "./PermissionPreview";

/**
 * Аккаунт сотрудника (14.09) — одно окно на создание и правку.
 *
 * Слева — кто это (имя с фамилией, должность, логин), пароль, который
 * задаёт только директор, ответ «новый или уже работает» и права на
 * щепетильные данные. Справа — живой предпросмотр: как изменится экран
 * человека, когда директор щёлкает переключателем.
 */

const COLORS = ["blue", "green", "orange", "pink", "purple"] as const;
type Color = (typeof COLORS)[number];

const KIND_OPTIONS = [
  {
    value: "existing" as StaffKind,
    title: "Уже работает у нас",
    text: "Работал в CRM под общей учёткой. При первом входе увидит, что изменилось.",
  },
  {
    value: "new" as StaffKind,
    title: "Новый сотрудник",
    text: "Раньше в CRM не работал. Прошлые обновления показывать не будем.",
  },
];

export function StaffAccountDialog({
  user,
  isSelf,
  onClose,
  onCreated,
  onResetPassword,
}: {
  /** null — новый сотрудник. */
  user: ApiStaffUser | null;
  isSelf?: boolean;
  onClose: () => void;
  onCreated?: (r: CreateUserResult) => void;
  /** Открыть окно «Задать новый пароль» для этого аккаунта. */
  onResetPassword?: (u: ApiStaffUser) => void;
}) {
  const creating = user == null;
  const fullAccess = !creating && isFullAccess(user.role);

  const createMut = useCreateUser();
  const patchMut = usePatchUser();
  const logoutMut = useLogoutEverywhere();

  const [name, setName] = useState(user?.name ?? "");
  const [position, setPosition] = useState(user?.position ?? "");
  const [login, setLogin] = useState(user?.login ?? "");
  const [color, setColor] = useState<Color>((user?.avatarColor as Color) ?? "blue");
  const [passMode, setPassMode] = useState<"generate" | "manual">("generate");
  const [password, setPassword] = useState("");
  const [kind, setKind] = useState<StaffKind | null>(user?.staffKind ?? null);
  const [perms, setPerms] = useState<Perms>(() => ({
    ...defaultPerms(),
    ...(user?.permissions ?? {}),
  }));
  const [active, setActive] = useState(user?.active ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [logoutAsk, setLogoutAsk] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loginOk = /^[a-z0-9._-]{2,50}$/.test(login.trim());
  const canSave = creating
    ? name.trim().length > 0 &&
      loginOk &&
      (passMode === "generate" || password.length >= 6) &&
      kind != null
    : name.trim().length > 0;

  const dirty = useMemo(() => {
    if (creating) return true;
    const permsChanged = PERMISSION_DEFS.some((d) => perms[d.key] !== user.permissions[d.key]);
    return (
      name.trim() !== user.name ||
      position.trim() !== (user.position ?? "") ||
      color !== user.avatarColor ||
      kind !== user.staffKind ||
      active !== user.active ||
      (!fullAccess && permsChanged)
    );
  }, [creating, user, name, position, color, kind, active, perms, fullAccess]);

  const setPerm = (key: PermissionKey, on: boolean) =>
    setPerms((prev) => ({ ...prev, [key]: on }));

  const submit = async () => {
    setErr(null);
    try {
      if (creating) {
        const result = await createMut.mutateAsync({
          name: name.trim(),
          login: login.trim().toLowerCase(),
          // Техническая роль. Кем человек работает, говорит должность, а что
          // он видит — права.
          role: "admin",
          avatarColor: color,
          password: passMode === "manual" ? password : undefined,
          position: position.trim() || undefined,
          staffKind: kind ?? undefined,
          permissions: perms,
        });
        onCreated?.(result);
        onClose();
        return;
      }
      await patchMut.mutateAsync({
        id: user.id,
        patch: {
          ...(name.trim() !== user.name ? { name: name.trim() } : {}),
          ...(position.trim() !== (user.position ?? "") ? { position: position.trim() || null } : {}),
          ...(color !== user.avatarColor ? { avatarColor: color } : {}),
          ...(kind && kind !== user.staffKind ? { staffKind: kind } : {}),
          ...(active !== user.active ? { active } : {}),
          ...(!fullAccess ? { permissions: perms } : {}),
        },
      });
      toast.success("Аккаунт сохранён", "Права вступят в силу у сотрудника в течение минуты");
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setErr("Такой логин уже занят — придумайте другой.");
      } else if (e instanceof ApiError && e.status === 400) {
        setErr(
          isSelf && active === false
            ? "Отключить свой собственный аккаунт нельзя."
            : "Проверьте поля: логин — латиница, цифры, точка, дефис; от 2 до 50 символов.",
        );
      } else {
        setErr("Не удалось сохранить. Проверьте связь и попробуйте ещё раз.");
      }
    }
  };

  const logoutEverywhere = async () => {
    if (!user) return;
    try {
      await logoutMut.mutateAsync(user.id);
      setLogoutAsk(false);
      toast.success("Вход сброшен", `${user.name} вышел на всех устройствах`);
    } catch {
      toast.error("Не удалось сбросить вход");
    }
  };

  const pending = createMut.isPending || patchMut.isPending;
  /** Планшет: окно во весь экран, кнопки и поля под палец. */
  const tabletLayout = useTabletLayout();

  return (
    // Окно фиксированной высоты: шапка и кнопки на месте, прокручивается
    // только середина. Иначе на телефоне содержимое вылезало за фон окна.
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center bg-ink/55 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={creating ? "Новый сотрудник" : `Аккаунт: ${user.name}`}
        className={cn(
          "flex h-[100dvh] w-full flex-col overflow-hidden bg-surface-soft shadow-card-lg sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[1040px] sm:rounded-2xl",
          tabletLayout && TABLET_DIALOG_PANEL,
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3.5">
          <div className="min-w-0">
            <div className="text-[16px] font-bold text-ink">
              {creating ? "Новый сотрудник" : user.name}
            </div>
            <div className="text-[12px] text-muted">
              {creating
                ? "Логин и пароль вы передадите человеку лично"
                : fullAccess
                  ? "Полный доступ — права не настраиваются"
                  : `@${user.login}`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-2 hover:bg-surface-soft hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>

        <div
          className={cn(
            "grid min-h-0 flex-1 items-start gap-4 overflow-y-auto overscroll-contain p-4 sm:p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]",
            // Планшет: две колонки и в портрете тоже — ширины хватает.
            tabletLayout && "grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6 px-7 py-5",
          )}
        >
          {/* ---------------- форма ---------------- */}
          <div className="flex min-w-0 flex-col gap-4">
            <Card title="Кто это">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Имя и фамилия" htmlFor="acc-name">
                  <TextInput id="acc-name" value={name} onChange={setName} placeholder="Иван Петров" maxLength={100} />
                </Field>
                <Field label="Должность" htmlFor="acc-position">
                  <TextInput
                    id="acc-position"
                    value={position}
                    onChange={setPosition}
                    placeholder="Менеджер по продажам"
                    maxLength={100}
                  />
                </Field>
                <Field
                  label="Логин"
                  htmlFor="acc-login"
                  hint={creating ? "Латиница и цифры. Его вводят на экране входа." : undefined}
                >
                  {creating ? (
                    <TextInput
                      id="acc-login"
                      value={login}
                      onChange={(v) => setLogin(v.toLowerCase())}
                      placeholder="nikita"
                      maxLength={50}
                      mono
                    />
                  ) : (
                    <div className="flex h-11 items-center font-mono text-[14px] text-ink-2">@{user.login}</div>
                  )}
                </Field>
                <Field label="Цвет на экране входа">
                  <div className="flex h-11 items-center gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Цвет ${c}`}
                        aria-pressed={color === c}
                        onClick={() => setColor(c)}
                        className={cn(
                          "h-8 w-8 rounded-full transition-transform",
                          color === c && "scale-110 ring-2 ring-ink ring-offset-2",
                        )}
                        style={{ background: avatarGradient(c) }}
                      />
                    ))}
                  </div>
                </Field>
              </div>
            </Card>

            <Card title="Пароль">
              {creating ? (
                <div className="flex flex-col gap-2.5">
                  <div className="inline-flex w-fit rounded-full bg-surface-soft p-0.5" role="group" aria-label="Как задать пароль">
                    <Seg active={passMode === "generate"} onClick={() => setPassMode("generate")}>
                      Сгенерировать
                    </Seg>
                    <Seg active={passMode === "manual"} onClick={() => setPassMode("manual")}>
                      Задать самому
                    </Seg>
                  </div>
                  {passMode === "manual" ? (
                    <TextInput
                      id="acc-password"
                      value={password}
                      onChange={setPassword}
                      placeholder="Не короче 6 символов"
                      maxLength={200}
                      mono
                    />
                  ) : (
                    <p className="text-[12.5px] leading-snug text-muted">
                      После создания CRM покажет пароль один раз — передайте его человеку лично.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onResetPassword?.(user)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-soft px-4 text-[13px] font-semibold text-ink hover:bg-blue-50"
                  >
                    <KeyRound size={14} /> Задать новый пароль
                  </button>
                  {logoutAsk ? (
                    <span className="inline-flex flex-wrap items-center gap-2 rounded-full bg-orange-soft px-3 py-1.5 text-[12.5px] font-semibold text-orange-ink">
                      Выйти на всех устройствах?
                      <button
                        type="button"
                        onClick={logoutEverywhere}
                        disabled={logoutMut.isPending}
                        className="rounded-full bg-ink px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50"
                      >
                        Да, выйти
                      </button>
                      <button type="button" onClick={() => setLogoutAsk(false)} className="text-[12px] text-orange-ink/80">
                        Отмена
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLogoutAsk(true)}
                      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-soft px-4 text-[13px] font-semibold text-ink hover:bg-blue-50"
                    >
                      <LogOut size={14} /> Выйти на всех устройствах
                    </button>
                  )}
                </div>
              )}
              {!fullAccess && (
                <p className="mt-2.5 rounded-[12px] bg-surface-soft px-3 py-2 text-[12.5px] leading-snug text-ink-2">
                  Сам сотрудник пароль не меняет — за новым он приходит к вам. Новый пароль сразу
                  сбрасывает вход на всех его устройствах.
                </p>
              )}
            </Card>

            {!fullAccess && (
              <Card title={<span id="acc-kind-title">Новый сотрудник или уже работает у вас?</span>}>
                <ChoiceCards
                  value={kind}
                  onChange={setKind}
                  options={KIND_OPTIONS}
                  required={creating}
                  labelledBy="acc-kind-title"
                />
                {creating && kind == null && (
                  <p className="mt-2 text-[12.5px] font-semibold text-orange-ink">
                    Без ответа аккаунт не создать.
                  </p>
                )}
              </Card>
            )}

            {!fullAccess && (
              <Card title="Что видит">
                <div className="flex flex-col">
                  {PERMISSION_DEFS.map((d) => (
                    <div
                      key={d.key}
                      className="flex items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0"
                    >
                      <label htmlFor={`perm-${d.key}`} className="min-w-0 flex-1 cursor-pointer">
                        <span className="block text-[14px] font-bold text-ink">{d.label}</span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-muted">{d.where}</span>
                      </label>
                      <Switch
                        id={`perm-${d.key}`}
                        checked={perms[d.key]}
                        onChange={(on) => setPerm(d.key, on)}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[12px] leading-snug text-muted-2">
                  Действия под ключом директора — удаление аренды, списание техники, смена VIN —
                  работают как раньше.
                </p>
              </Card>
            )}

            {!creating && !isSelf && (
              <Card title="Доступ">
                <div className="flex items-center gap-3">
                  <label htmlFor="acc-active" className="min-w-0 flex-1 cursor-pointer">
                    <span className="block text-[14px] font-bold text-ink">
                      {active ? "Аккаунт включён" : "Аккаунт отключён"}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-muted">
                      Отключённый аккаунт выходит отовсюду и войти не может.
                    </span>
                  </label>
                  <Switch id="acc-active" checked={active} onChange={setActive} />
                </div>
              </Card>
            )}
          </div>

          {/* ---------------- предпросмотр ---------------- */}
          <div className="min-w-0">
            <div className="lg:sticky lg:top-4">
              {fullAccess ? (
                <Card title="Что видит">
                  <p className="text-[13px] leading-snug text-ink-2">
                    У директора полный доступ: все показатели, прибыль, доли партнёров и раздел
                    «Сотрудники».
                  </p>
                </Card>
              ) : (
                <PermissionPreview perms={perms} personName={name || "сотрудник"} />
              )}
            </div>
          </div>
        </div>

        <footer
          className={cn(
            "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]",
            tabletLayout && "gap-3 px-7 py-4",
          )}
        >
          {err && <span className="mr-auto text-[12.5px] font-semibold text-red-ink">{err}</span>}
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "h-11 rounded-full px-5 text-[13.5px] font-semibold text-muted hover:text-ink",
              tabletLayout && "h-14 min-w-[150px] text-[15px]",
            )}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSave || !dirty || pending}
            className={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-full bg-ink px-5 text-[13.5px] font-bold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-surface-soft disabled:text-muted-2",
              tabletLayout && "h-14 min-w-[240px] justify-center text-[16px]",
            )}
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            {creating ? "Создать аккаунт" : "Сохранить"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-card-sm">
      <h3 className="mb-3 text-[13px] font-bold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </label>
      {children}
      {hint && <span className="text-[11.5px] text-muted-2">{hint}</span>}
    </div>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  maxLength,
  mono,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  mono?: boolean;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={cn(
        "h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-muted-2 focus:border-blue-600",
        mono && "font-mono",
      )}
    />
  );
}

function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
        active ? "bg-ink text-white" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function avatarGradient(color?: string): string {
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
