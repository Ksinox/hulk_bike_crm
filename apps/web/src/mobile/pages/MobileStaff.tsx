import {
  Crown,
  ShieldCheck,
  ShieldAlert,
  Wrench,
  User as UserIcon,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useApiUsers, type ApiStaffUser } from "@/lib/api/users";
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
      {sorted.map((u) => (
        <StaffRow key={u.id} user={u} />
      ))}
      <p className="mt-1 text-center text-[12px] text-muted-2">
        Добавление, сброс паролей и роли — на компьютере
      </p>
    </div>
  );
}

function StaffRow({ user }: { user: ApiStaffUser }) {
  const Icon = ROLE_ICON[user.role];
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card-sm",
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
        <div className="mt-0.5 truncate text-[12px] text-muted">@{user.login}</div>
      </div>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
        <Icon size={14} /> {ROLE_LABEL[user.role]}
      </div>
    </div>
  );
}
