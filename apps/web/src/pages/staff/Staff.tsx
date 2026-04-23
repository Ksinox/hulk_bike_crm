import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Crown,
  KeyRound,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
  UserCog,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Topbar } from "@/pages/dashboard/Topbar";
import { useMe } from "@/lib/api/auth";
import {
  useApiUsers,
  type ApiStaffUser,
} from "@/lib/api/users";
import { StaffAddModal } from "./StaffAddModal";
import { StaffEditModal } from "./StaffEditModal";
import { StaffResetPasswordModal } from "./StaffResetPasswordModal";
import { StaffPasswordRevealModal } from "./StaffPasswordRevealModal";

const ROLE_LABEL: Record<ApiStaffUser["role"], string> = {
  creator: "Создатель",
  director: "Директор",
  admin: "Администратор",
  mechanic: "Механик",
  accountant: "Бухгалтер",
};

const ROLE_ICON: Record<ApiStaffUser["role"], LucideIcon> = {
  creator: Crown,
  director: ShieldCheck,
  admin: ShieldAlert,
  mechanic: Wrench,
  accountant: UserIcon,
};

export function Staff() {
  const { data: me } = useMe();
  const { data: users = [], isLoading } = useApiUsers();

  const canManage = me?.role === "creator" || me?.role === "director";

  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<ApiStaffUser | null>(null);
  const [resetUser, setResetUser] = useState<ApiStaffUser | null>(null);
  /** После создания/сброса — одноразовый показ пароля */
  const [revealed, setRevealed] = useState<{
    name: string;
    login: string;
    password: string;
    kind: "created" | "reset";
  } | null>(null);

  const sorted = useMemo(
    () =>
      [...users].sort((a, b) => {
        // активные сверху, затем по роли (creator → director → admin → mechanic → accountant)
        if (a.active !== b.active) return a.active ? -1 : 1;
        const rank = (r: ApiStaffUser["role"]) =>
          r === "creator"
            ? 0
            : r === "director"
              ? 1
              : r === "admin"
                ? 2
                : r === "mechanic"
                  ? 3
                  : 4;
        const d = rank(a.role) - rank(b.role);
        if (d !== 0) return d;
        return a.id - b.id;
      }),
    [users],
  );

  if (!canManage) {
    return (
      <main className="flex min-w-0 flex-1 flex-col gap-4">
        <Topbar />
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 rounded-2xl bg-surface p-10 text-center shadow-card-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-soft text-muted-2">
            <UserCog size={26} />
          </div>
          <div className="text-[15px] font-bold text-ink">
            Недостаточно прав
          </div>
          <div className="max-w-[380px] text-[13px] text-muted">
            Раздел «Сотрудники» доступен только директору и создателю.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
            Сотрудники
          </h1>
          <div className="mt-1.5 text-[13px] text-muted">
            {isLoading
              ? "Загрузка…"
              : `${users.length} ${plural(users.length, ["сотрудник", "сотрудника", "сотрудников"])} · ${users.filter((u) => u.active).length} активных`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-blue-600"
        >
          <Plus size={16} /> Добавить сотрудника
        </button>
      </header>

      <div className="overflow-hidden rounded-2xl bg-surface shadow-card-sm">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <Th style={{ width: "32%" }}>Имя</Th>
              <Th>Логин</Th>
              <Th>Роль</Th>
              <Th>Статус</Th>
              <Th>Последний вход</Th>
              <Th style={{ textAlign: "right" }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((u) => (
              <Row
                key={u.id}
                u={u}
                isSelf={u.id === me?.id}
                onEdit={() => setEditUser(u)}
                onReset={() => setResetUser(u)}
              />
            ))}
            {sorted.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  Пока никого нет. Нажмите «Добавить сотрудника».
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <StaffAddModal
          onClose={() => setAddOpen(false)}
          onCreated={(r) =>
            setRevealed({
              name: r.name,
              login: r.login,
              password: r.initialPassword,
              kind: "created",
            })
          }
        />
      )}
      {editUser && (
        <StaffEditModal
          user={editUser}
          isSelf={editUser.id === me?.id}
          onClose={() => setEditUser(null)}
        />
      )}
      {resetUser && (
        <StaffResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onReset={(newPassword) =>
            setRevealed({
              name: resetUser.name,
              login: resetUser.login,
              password: newPassword,
              kind: "reset",
            })
          }
        />
      )}
      {revealed && (
        <StaffPasswordRevealModal
          data={revealed}
          onClose={() => setRevealed(null)}
        />
      )}
    </main>
  );
}

function Row({
  u,
  isSelf,
  onEdit,
  onReset,
}: {
  u: ApiStaffUser;
  isSelf: boolean;
  onEdit: () => void;
  onReset: () => void;
}) {
  const RoleIcon = ROLE_ICON[u.role];
  const initials = u.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <tr className={cn("group", !u.active && "opacity-50")}>
      <Td>
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-white text-[12px] font-bold"
            style={{ background: avatarGradient(u.avatarColor) }}
          >
            {initials || "?"}
          </div>
          <div>
            <div className="font-semibold">
              {u.name}
              {isSelf && (
                <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                  это вы
                </span>
              )}
              {u.mustChangePassword && u.active && (
                <span
                  className="ml-2 rounded-full bg-orange-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-ink"
                  title="При следующем входе обязан сменить пароль"
                >
                  смена пароля
                </span>
              )}
            </div>
          </div>
        </div>
      </Td>
      <Td>
        <span className="font-mono text-[12px] text-muted">@{u.login}</span>
      </Td>
      <Td>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-2">
          <RoleIcon size={11} />
          {ROLE_LABEL[u.role]}
        </span>
      </Td>
      <Td>
        {u.active ? (
          <span className="inline-flex items-center gap-1 text-green-ink font-semibold">
            <CheckCircle2 size={13} /> активен
          </span>
        ) : (
          <span className="text-muted-2 font-semibold">выключен</span>
        )}
      </Td>
      <Td>
        <span className="text-muted">
          {u.lastLoginAt ? formatDate(u.lastLoginAt) : "—"}
        </span>
      </Td>
      <Td style={{ textAlign: "right" }}>
        <div className="inline-flex gap-1">
          <ActionBtn
            icon={KeyRound}
            label="Сбросить пароль"
            onClick={onReset}
            disabled={u.role === "creator" && isSelf}
          />
          <ActionBtn
            icon={Pencil}
            label="Изменить"
            onClick={onEdit}
          />
        </div>
      </Td>
    </tr>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
        disabled
          ? "cursor-not-allowed bg-surface-soft text-muted-2 opacity-50"
          : "bg-surface-soft text-ink-2 hover:bg-blue-50 hover:text-blue-700",
      )}
    >
      <Icon size={14} />
    </button>
  );
}

function Th({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th
      className="bg-surface-soft px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted first:rounded-tl-2xl last:rounded-tr-2xl"
      style={style}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className="border-b border-border px-4 py-3 align-middle"
      style={style}
    >
      {children}
    </td>
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

// suppress unused warnings
void Copy;
