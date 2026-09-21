import {
  Crown,
  ShieldCheck,
  ShieldAlert,
  Wrench,
  User as UserIcon,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { ReleaseViewsPanel } from "@/release/ReleaseViewsPanel";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useApiUsers, type ApiStaffUser } from "@/lib/api/users";
import { useMe } from "@/lib/api/auth";
import { PERMISSION_DEFS, isFullAccess } from "@/lib/permissions";
import { StaffAccountDialog } from "@/pages/staff/StaffAccountDialog";
import { StaffResetPasswordModal } from "@/pages/staff/StaffResetPasswordModal";
import { StaffPasswordRevealModal } from "@/pages/staff/StaffPasswordRevealModal";
import type { AuthRole } from "@/lib/api/auth";
import { cn } from "@/lib/utils";
import { MobileEmpty } from "../ui";

const ROLE_LABEL: Record<AuthRole, string> = {
  creator: "Создатель",
  director: "Директор",
  admin: "Администратор",
  mechanic: "Механик",
  accountant: "Бухгалтер",
};

const ROLE_ICON: Record<AuthRole, LucideIcon> = {
  creator: Crown,
  director: ShieldCheck,
  admin: ShieldAlert,
  mechanic: Wrench,
  accountant: UserIcon,
};

const AVATAR_CLS: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-soft text-green-ink",
  orange: "bg-orange-soft text-orange-ink",
  pink: "bg-red-soft text-red-ink",
  purple: "bg-purple-soft text-purple-ink",
};

function roleRank(r: AuthRole): number {
  return r === "creator" ? 0 : r === "director" ? 1 : r === "admin" ? 2 : r === "mechanic" ? 3 : 4;
}

export function MobileStaff() {
  const { data: users = [], isLoading } = useApiUsers();
  const { data: me } = useMe();
  // 14.09: заводить сотрудников, задавать пароль и права можно и с телефона —
  // то же окно, что на компьютере, на весь экран.
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<ApiStaffUser | null>(null);
  const [resetUser, setResetUser] = useState<ApiStaffUser | null>(null);
  const [revealed, setRevealed] = useState<{
    name: string;
    login: string;
    password: string;
    kind: "created" | "reset";
  } | null>(null);

  const sorted = useMemo(
    () =>
      [...users].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return roleRank(a.role) - roleRank(b.role);
      }),
    [users],
  );

  if (isLoading) {
    return <div className="py-10 text-center text-[13px] text-muted-2">Загрузка…</div>;
  }

  if (sorted.length === 0) {
    return (
      <MobileEmpty icon={<UserCog size={26} />} title="Сотрудников нет" />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Планшет: кнопка по содержимому справа, а не полосой во всю ширину. */}
      <div className="flex tab:justify-end">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[14px] font-bold text-white active:scale-[0.99] tab:w-auto tab:px-6"
        >
          <Plus size={18} /> Новый сотрудник
        </button>
      </div>
      {/* 15.09: кто посмотрел обновление. */}
      <ReleaseViewsPanel compact />
      {/* Планшет: карточки людей в две колонки. */}
      <div className="grid grid-cols-1 gap-2 tab:grid-cols-2 tab:gap-3">
        {sorted.map((u) => (
          <StaffRow key={u.id} user={u} onOpen={() => setEditUser(u)} />
        ))}
      </div>

      {addOpen && (
        <StaffAccountDialog
          user={null}
          onClose={() => setAddOpen(false)}
          onCreated={(r) =>
            setRevealed({ name: r.name, login: r.login, password: r.initialPassword, kind: "created" })
          }
        />
      )}
      {editUser && (
        <StaffAccountDialog
          user={editUser}
          isSelf={editUser.id === me?.id}
          onClose={() => setEditUser(null)}
          onResetPassword={(u) => {
            setEditUser(null);
            setResetUser(u);
          }}
        />
      )}
      {resetUser && (
        <StaffResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onReset={(newPassword) =>
            setRevealed({ name: resetUser.name, login: resetUser.login, password: newPassword, kind: "reset" })
          }
        />
      )}
      {revealed && <StaffPasswordRevealModal data={revealed} onClose={() => setRevealed(null)} />}
    </div>
  );
}

function StaffRow({ user, onOpen }: { user: ApiStaffUser; onOpen: () => void }) {
  const Icon = ROLE_ICON[user.role];
  const hidden = PERMISSION_DEFS.filter((d) => user.permissions && !user.permissions[d.key]).map(
    (d) => d.label,
  );
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-card-sm active:bg-surface-soft",
        !user.active && "opacity-60",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
          AVATAR_CLS[user.avatarColor] ?? "bg-blue-50 text-blue-600",
        )}
      >
        {initials || "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-bold text-ink">{user.name}</span>
          {!user.active && (
            <span className="shrink-0 rounded-full bg-surface-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-2">
              выкл
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-muted">
          {user.position || ROLE_LABEL[user.role]} · @{user.login}
        </div>
        {!isFullAccess(user.role) && hidden.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {hidden.map((label) => (
              <span key={label} className="rounded-full bg-surface-soft px-2 py-0.5 text-[10.5px] font-semibold text-ink-2">
                не видит: {label.toLowerCase()}
              </span>
            ))}
          </div>
        )}
      </div>
      {isFullAccess(user.role) && (
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
          <Icon size={14} /> {ROLE_LABEL[user.role]}
        </div>
      )}
    </button>
  );
}
