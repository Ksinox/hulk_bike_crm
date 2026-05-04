import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Bike,
  Calendar,
  ChevronDown,
  Crown,
  LogOut,
  Settings,
  ShieldCheck,
  UserCog,
  UserPlus,
  User as UserIcon,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { setRole, useRole, type UserRole } from "@/lib/role";
import { useLogout, useMe } from "@/lib/api/auth";
import { GlobalSearch } from "./GlobalSearch";
import { ProfileModal } from "./ProfileModal";
import { AddClientModal } from "@/pages/clients/AddClientModal";
import { NewRentalModal } from "@/pages/rentals/NewRentalModal";
import { navigate } from "@/app/navigationStore";

export function Topbar() {
  const { data: me } = useMe();
  const logoutMut = useLogout();
  const role = useRole();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newRentalOpen, setNewRentalOpen] = useState(false);
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
      // В Electron страница загружена из file:///.../index.html —
      // переход на "/" уводит в корень ФС и даёт белый экран.
      // reload() одинаково работает и в вебе, и в .exe: после выхода
      // useMe вернёт null и приложение отрисует Login.
      window.location.reload();
    }
  };

  const avatarInitials = (me?.name ?? "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-2.5 shadow-card-sm">
      <GlobalSearch />
      <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[13px] font-semibold text-blue-700">
        <Calendar size={14} />
        {formatTodayRu()}
      </div>
      <div className="flex-1" />

      {/* v0.3.1: быстрые действия с дашборда — оператору не нужно
          переходить в «Клиенты» / «Аренды» чтобы создать запись.
          Заказчик: «всё должно быть доступно прямо с дашборда». */}
      <button
        type="button"
        onClick={() => setNewClientOpen(true)}
        className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-soft px-3 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        title="Новый клиент"
      >
        <UserPlus size={14} /> Новый клиент
      </button>
      <button
        type="button"
        onClick={() => setNewRentalOpen(true)}
        className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[13px] font-bold text-white transition-colors hover:bg-blue-600"
        title="Новая аренда"
      >
        <Bike size={14} /> Новая аренда
      </button>

      {isCreator && <CreatorViewSwitcher current={role} onChange={setRole} />}

      <IconBtn aria-label="Настройки — скоро" title="Настройки — скоро" disabled>
        <Settings size={18} />
        <SoonDot />
      </IconBtn>
      <IconBtn aria-label="Уведомления — скоро" title="Уведомления — скоро" disabled>
        <Bell size={18} />
        <SoonDot />
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
                onClick={() => {
                  setMenuOpen(false);
                  setProfileOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-soft hover:text-ink"
              >
                <UserCog size={14} />
                Профиль и пароль
              </button>
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
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
      {newClientOpen && (
        <AddClientModal
          onClose={() => setNewClientOpen(false)}
          onCreated={() => setNewClientOpen(false)}
        />
      )}
      {newRentalOpen && (
        <NewRentalModal
          onClose={() => setNewRentalOpen(false)}
          onCreated={(r) => {
            setNewRentalOpen(false);
            navigate({ route: "rentals", rentalId: r.id });
          }}
        />
      )}
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
  className,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-xl bg-surface-soft text-ink-2 transition-colors",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:bg-blue-50 hover:text-blue-600",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Точка-индикатор "скоро" в углу круглой кнопки. */
function SoonDot() {
  return (
    <span
      className="absolute rounded-full border-2 border-surface bg-muted-2/70"
      style={{ top: 6, right: 6, height: 8, width: 8 }}
    />
  );
}

/** Сегодня — на русском. Пример: "Сегодня, чт 23 апр". */
function formatTodayRu(): string {
  const d = new Date();
  const wd = d.toLocaleDateString("ru-RU", { weekday: "short" });
  const day = d.getDate();
  const mon = d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "");
  return `Сегодня, ${wd} ${day} ${mon}`;
}

// suppress unused warning
void Wrench;
void UserIcon;
