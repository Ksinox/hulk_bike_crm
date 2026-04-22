import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Calendar,
  ChevronDown,
  Crown,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  User as UserIcon,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { setRole, useRole, type UserRole } from "@/lib/role";
import { useLogout, useMe } from "@/lib/api/auth";

export function Topbar() {
  const { data: me } = useMe();
  const logoutMut = useLogout();
  const role = useRole();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Создатель может переключаться между ролями на лету для тестирования UI
  const isCreator = me?.role === "creator";

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const handleLogout = async () => {
    try {
      await logoutMut.mutateAsync();
    } finally {
      window.location.href = "/";
    }
  };

  const avatarInitials = (me?.name ?? "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-2.5 shadow-card-sm">
      <div className="flex min-w-[280px] items-center gap-2.5 rounded-full border border-transparent bg-surface-soft px-3.5 py-2 transition-colors focus-within:border-blue focus-within:bg-white">
        <Search size={16} className="text-muted-2" />
        <input
          type="text"
          placeholder="Поиск: клиент, скутер, № договора…"
          className="w-full border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted-2"
        />
      </div>
      <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[13px] font-semibold text-blue-700">
        <Calendar size={14} />
        Сегодня, пн 13 окт
      </div>
      <div className="flex-1" />

      {isCreator && <CreatorViewSwitcher current={role} onChange={setRole} />}

      <IconBtn aria-label="Настройки">
        <Settings size={18} />
      </IconBtn>
      <IconBtn aria-label="Уведомления">
        <Bell size={18} />
        <span
          className="absolute h-2 w-2 rounded-full border-2 border-surface bg-red"
          style={{ top: 8, right: 9 }}
        />
      </IconBtn>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title={me ? `${me.name} · ${roleLabel(me.role)}` : ""}
          className="flex h-10 items-center gap-2 rounded-[14px] pl-1.5 pr-2 text-sm font-bold transition-colors hover:bg-surface-soft"
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-white"
            style={{ background: avatarGradient(me?.avatarColor) }}
          >
            {avatarInitials || "?"}
          </div>
          <ChevronDown size={14} className="text-muted-2" />
        </button>

        {menuOpen && me && (
          <div className="absolute right-0 top-11 z-50 w-[230px] overflow-hidden rounded-[14px] bg-surface shadow-card-lg ring-1 ring-border">
            <div className="px-3 pb-2 pt-3">
              <div className="text-[13px] font-bold text-ink">{me.name}</div>
              <div className="mt-0.5 text-[11px] text-muted-2">
                {roleLabel(me.role)} · @{me.login}
              </div>
            </div>
            <div className="border-t border-border">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-soft hover:text-red-ink"
              >
                <LogOut size={14} />
                Выйти
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreatorViewSwitcher({
  current,
  onChange,
}: {
  current: UserRole;
  onChange: (r: UserRole) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const label = current === "director" ? "Директор" : "Администратор";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full bg-purple-soft px-3 py-1.5 text-[12px] font-bold text-purple-ink transition-colors hover:bg-purple/20"
        title="Creator: смотреть как роль"
      >
        <Crown size={13} /> Смотрю как: {label}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-[200px] overflow-hidden rounded-[12px] bg-surface shadow-card-lg ring-1 ring-border">
          <MenuItem
            label="Директор"
            icon={Crown}
            active={current === "director"}
            onClick={() => {
              onChange("director");
              setOpen(false);
            }}
          />
          <MenuItem
            label="Администратор"
            icon={ShieldCheck}
            active={current === "admin"}
            onClick={() => {
              onChange("admin");
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Crown;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors",
        active
          ? "bg-blue-50 font-bold text-blue-700"
          : "text-ink-2 hover:bg-surface-soft",
      )}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

function roleLabel(role: string): string {
  switch (role) {
    case "creator":
      return "Создатель";
    case "director":
      return "Директор";
    case "admin":
      return "Администратор";
    case "mechanic":
      return "Механик";
    case "accountant":
      return "Бухгалтер";
    default:
      return role;
  }
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

function IconBtn({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-surface-soft text-ink-2 transition-colors hover:bg-blue-50 hover:text-blue-600"
      {...rest}
    >
      {children}
    </button>
  );
}

// suppress unused warning
void Wrench;
void UserIcon;
