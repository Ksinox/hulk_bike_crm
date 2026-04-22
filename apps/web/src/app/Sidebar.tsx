import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bike,
  CircleAlert,
  ClipboardCheck,
  FileText,
  Home,
  LogOut,
  Receipt,
  Settings,
  ShoppingBag,
  UserCog,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UpdateBanner, useDesktopUpdate } from "./UpdateBanner";
import { isElectron } from "@/platform";
import type { RouteId } from "./route";
import { useMe } from "@/lib/api/auth";

type NavItem = {
  id: RouteId | "logout";
  label: string;
  icon: LucideIcon;
  ready?: boolean;
};

const mainItems: NavItem[] = [
  { id: "dashboard", label: "Дашборд", icon: Home, ready: true },
  { id: "clients", label: "Клиенты", icon: Users, ready: true },
  { id: "rentals", label: "Аренды", icon: Bike, ready: true },
  { id: "fleet", label: "Скутеры", icon: ShoppingBag, ready: true },
  { id: "rassrochki", label: "Рассрочки", icon: Receipt },
  { id: "sales", label: "Продажи", icon: Wallet },
  { id: "service", label: "Ремонты", icon: Wrench },
  { id: "incidents", label: "Инциденты", icon: CircleAlert },
  { id: "tasks", label: "Задачи", icon: ClipboardCheck },
  { id: "analytics", label: "Аналитика", icon: BarChart3 },
  { id: "docs", label: "Документы", icon: FileText },
];

/** Пункты, видимые только директору/создателю */
const directorItems: NavItem[] = [
  { id: "staff", label: "Сотрудники", icon: UserCog },
];

const footerItems: NavItem[] = [
  { id: "settings", label: "Настройки", icon: Settings },
  { id: "logout", label: "Выход", icon: LogOut },
];

export function Sidebar({
  activeId,
  onSelect,
}: {
  activeId: RouteId;
  onSelect: (id: RouteId) => void;
}) {
  const { data: me } = useMe();
  const [expanded, setExpanded] = useState(false);
  const { phase, version } = useDesktopUpdate();
  const canManageStaff = me?.role === "director" || me?.role === "creator";
  const [tooltip, setTooltip] = useState<{
    label: string;
    top: number;
    left: number;
  } | null>(null);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (expanded) setTooltip(null);
  }, [expanded]);

  const handleEnter = (
    e: React.MouseEvent<HTMLButtonElement>,
    label: string,
  ) => {
    if (expanded) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTooltip({ label, top: r.top + r.height / 2 - 14, left: r.right + 12 });
  };
  const handleLeave = () => setTooltip(null);

  return (
    <>
      <aside
        ref={asideRef}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={cn(
          "sticky z-50 flex flex-shrink-0 flex-col overflow-hidden rounded-2xl bg-surface py-4 shadow-card transition-[width,padding,box-shadow]",
          expanded ? "w-[232px] px-3 shadow-card-lg" : "w-[68px] px-[10px]",
          isElectron
            ? "top-[54px] h-[calc(100vh-72px)]"
            : "top-[18px] h-[calc(100vh-36px)]",
        )}
        style={{
          transitionDuration: "360ms",
          transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <div className="mb-[10px] ml-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[14px] bg-ink text-white">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth="2" />
            <path
              d="M8 7v10M16 7v10M8 12h8"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="flex flex-col gap-1">
          {[...mainItems, ...(canManageStaff ? directorItems : [])].map((item) => (
            <NavRow
              key={item.id}
              item={item}
              active={item.id === activeId}
              expanded={expanded}
              onEnter={handleEnter}
              onLeave={handleLeave}
              onSelect={onSelect}
            />
          ))}
        </div>

        <div className="flex-1" />

        <UpdateBanner phase={phase} version={version} expanded={expanded} />

        <div className="flex flex-col gap-1">
          {footerItems.map((item) => (
            <NavRow
              key={item.id}
              item={item}
              active={item.id === activeId}
              expanded={expanded}
              onEnter={handleEnter}
              onLeave={handleLeave}
              onSelect={onSelect}
            />
          ))}
        </div>
      </aside>

      {tooltip && (
        <div
          className="pointer-events-none fixed z-[9999] rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-white shadow-card"
          style={{ top: tooltip.top, left: tooltip.left }}
        >
          {tooltip.label}
          <span
            className="absolute top-1/2 -translate-y-1/2"
            style={{
              left: -5,
              borderTop: "5px solid transparent",
              borderBottom: "5px solid transparent",
              borderRight: "5px solid hsl(var(--ink))",
            }}
          />
        </div>
      )}
    </>
  );
}

function NavRow({
  item,
  active,
  expanded,
  onEnter,
  onLeave,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  expanded: boolean;
  onEnter: (e: React.MouseEvent<HTMLButtonElement>, label: string) => void;
  onLeave: () => void;
  onSelect: (id: RouteId) => void;
}) {
  const Icon = item.icon;
  const isLogout = item.id === "logout";
  const disabled = !isLogout && item.ready !== true;

  const tooltipLabel = disabled ? `${item.label} · скоро` : item.label;

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseEnter={(e) => onEnter(e, tooltipLabel)}
      onMouseLeave={onLeave}
      onClick={() => {
        if (disabled || isLogout) return;
        onSelect(item.id as RouteId);
      }}
      title={disabled ? "Раздел в разработке" : undefined}
      className={cn(
        "relative flex h-11 items-center gap-3 overflow-hidden whitespace-nowrap rounded-[14px] px-3 text-left transition-colors",
        active && "bg-ink text-white",
        !active && !disabled && "text-muted hover:bg-blue-50 hover:text-blue-600",
        !active && disabled && "cursor-not-allowed text-muted-2 opacity-50",
      )}
    >
      <Icon size={20} className="flex-shrink-0" />
      <span
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 text-[13px] font-semibold transition-[opacity,transform]",
          expanded
            ? "pointer-events-auto translate-x-0 opacity-100 [transition-delay:80ms]"
            : "pointer-events-none -translate-x-1.5 opacity-0",
        )}
        style={{
          transitionDuration: "320ms",
          transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <span className="truncate">{item.label}</span>
        {disabled && (
          <span className="ml-auto rounded-full bg-surface-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-2">
            скоро
          </span>
        )}
      </span>
    </button>
  );
}
