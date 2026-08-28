import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bike,
  Calculator,
  CircleAlert,
  ClipboardCheck,
  FileText,
  HardDrive,
  Home,
  Inbox,
  LogOut,
  Receipt,
  Scale,
  Settings,
  ShoppingBag,
  Sparkles,
  Handshake,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  Wrench,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UpdateBanner, useDesktopUpdate } from "./UpdateBanner";
import { isElectron } from "@/platform";
import type { RouteId } from "./route";
import { useMe } from "@/lib/api/auth";
import { useUnreadChangelog } from "@/pages/whats-new/useUnreadChangelog";
import { useApplications } from "@/lib/api/clientApplications";
import { toggleCalculator } from "@/lib/calc/calcStore";

type NavItem = {
  id: RouteId | "logout";
  label: string;
  icon: LucideIcon;
  ready?: boolean;
};

function buildMainItems(canManageStaff: boolean): NavItem[] {
  const items: NavItem[] = [
    { id: "dashboard", label: "Дашборд", icon: Home, ready: true },
    { id: "clients", label: "Клиенты", icon: Users, ready: true },
    { id: "applications", label: "Заявки", icon: Inbox, ready: true },
    { id: "rentals", label: "Аренды", icon: Bike, ready: true },
    { id: "fleet", label: "Скутеры", icon: ShoppingBag, ready: true },
  ];
  // «Сотрудники» — полностью скрыты для admin/mechanic/accountant.
  // Показываются только director/creator.
  if (canManageStaff) {
    items.push({ id: "staff", label: "Сотрудники", icon: UserCog, ready: true });
  }
  items.push(
    { id: "rassrochki", label: "Рассрочки", icon: Receipt },
    { id: "sales", label: "Продажи", icon: Wallet },
    // Пункт 11: расчёт выплат инвестору по партнёрской технике.
    { id: "partners", label: "Партнёрка", icon: Handshake, ready: true },
    { id: "service", label: "Ремонты", icon: Wrench, ready: true },
    { id: "incidents", label: "Инциденты", icon: CircleAlert },
    { id: "tasks", label: "Задачи", icon: ClipboardCheck },
    { id: "analytics", label: "Аналитика", icon: BarChart3 },
    { id: "docs", label: "Документы", icon: FileText, ready: true },
    { id: "debtors", label: "Должники", icon: Scale, ready: true },
    { id: "whats-new", label: "Что нового", icon: Sparkles, ready: true },
    { id: "progress", label: "Развитие", icon: TrendingUp, ready: true },
  );
  // «Хранилище» — обзор места (БД/файлы/диск) + браузер; только director/creator.
  if (canManageStaff) {
    items.push({
      id: "storage",
      label: "Хранилище",
      icon: HardDrive,
      ready: true,
    });
  }
  return items;
}

const footerItems: NavItem[] = [
  // v0.4.23: ready:true — раньше отсутствовал → пункт показывался с
  // меткой «скоро» и был задизаблен, хотя страница уже работает с v0.4.1.
  { id: "settings", label: "Настройки", icon: Settings, ready: true },
  { id: "logout", label: "Выход", icon: LogOut, ready: true },
];

export function Sidebar({
  activeId,
  onSelect,
}: {
  activeId: RouteId;
  onSelect: (id: RouteId) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { phase, version } = useDesktopUpdate();
  const { data: me } = useMe();
  const canManageStaff = me?.role === "creator" || me?.role === "director";
  const mainItems = buildMainItems(canManageStaff);
  const { unreadCount: changelogUnread } = useUnreadChangelog();
  // Считаем «новые» заявки (status='new'). polling уже включен в хуке.
  const newApplicationsQ = useApplications({ status: "new", poll: true });
  const newApplicationsCount = newApplicationsQ.data?.length ?? 0;
  const [tooltip, setTooltip] = useState<{
    label: string;
    top: number;
    left: number;
  } | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  /**
   * Правка 28.08: на низких экранах пункты меню не помещались. Скрытая
   * прокрутка колёсиком была так себе решением — заказчик прав. Теперь
   * показываем СТОЛЬКО, сколько реально влезает, а остальные прячем за
   * кнопкой «Ещё»: наведение (или клик) открывает панель сбоку со всеми
   * оставшимися разделами.
   */
  const listRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(mainItems.length);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreTop, setMoreTop] = useState(0);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);

  /** Сколько пунктов помещается по высоте: меряем реальную высоту строки. */
  useLayoutEffect(() => {
    const measure = () => {
      const list = listRef.current;
      const aside = asideRef.current;
      if (!list || !aside) return;
      const rowH = list.firstElementChild
        ? (list.firstElementChild as HTMLElement).offsetHeight + 4
        : 48;
      const available = list.clientHeight;
      if (available <= 0 || rowH <= 0) return;
      // Место под кнопку «Ещё», если поместились не все.
      const fitsAll = Math.floor(available / rowH) >= mainItems.length;
      const n = fitsAll
        ? mainItems.length
        : Math.max(1, Math.floor(available / rowH) - 1);
      setVisibleCount(n);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (listRef.current) ro.observe(listRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [mainItems.length]);

  const shownItems = mainItems.slice(0, visibleCount);
  const hiddenItems = mainItems.slice(visibleCount);

  const openMore = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    const r = moreBtnRef.current?.getBoundingClientRect();
    if (r) {
      // Панель выравниваем по кнопке, но не даём уехать за низ экрана.
      const height = Math.min(hiddenItems.length * 44 + 16, 420);
      setMoreTop(Math.min(r.top, window.innerHeight - height - 16));
    }
    setMoreOpen(true);
    (window as unknown as { __moreCalls?: number }).__moreCalls =
      ((window as unknown as { __moreCalls?: number }).__moreCalls ?? 0) + 1;
  };
  const scheduleCloseMore = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      (window as unknown as { __moreCloses?: number }).__moreCloses =
        ((window as unknown as { __moreCloses?: number }).__moreCloses ?? 0) + 1;
      setMoreOpen(false);
    }, 180);
  };

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
        onMouseLeave={() => {
          setExpanded(false);
          scheduleCloseMore();
        }}
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

        {/* Фикс 27.08: на низких экранах пунктов больше, чем помещается по
            высоте, а overflow-hidden их просто обрезал — нижние разделы
            (Документы, Должники, Аналитика…) было НЕ НАЖАТЬ. Теперь середина
            скроллится (колёсиком/тачпадом), а «Настройки»/«Выход» всегда
            прижаты снизу. На высоких экранах ничего не меняется — скролла
            нет. Плюс компакт-режим строк на низких экранах (index.css). */}
        <div
          ref={listRef}
          className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-hidden px-1"
        >
          {shownItems.map((item) => (
            <NavRow
              key={item.id}
              item={item}
              active={item.id === activeId}
              expanded={expanded}
              onEnter={handleEnter}
              onLeave={handleLeave}
              onSelect={onSelect}
              badgeCount={
                item.id === "whats-new"
                  ? changelogUnread
                  : item.id === "applications"
                    ? newApplicationsCount
                    : 0
              }
            />
          ))}

          {/* Не поместившиеся разделы — за кнопкой «Ещё» */}
          {hiddenItems.length > 0 && (
            /* Закрытие не вешаем на саму кнопку: при наведении сайдбар
               расширяется, кнопка смещается под курсором и ловит ложный
               mouseleave — панель схлопывалась сразу после открытия. */
            <button
              ref={moreBtnRef}
              type="button"
              onMouseEnter={openMore}
              onFocus={openMore}
              onClick={() => (moreOpen ? setMoreOpen(false) : openMore())}
              className={cn(
                "sidebar-row relative flex h-11 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap rounded-[14px] px-3 text-left transition-colors",
                moreOpen
                  ? "bg-blue-50 text-blue-600"
                  : "text-muted hover:bg-blue-50 hover:text-blue-600",
              )}
            >
              <span className="relative flex-shrink-0">
                <MoreHorizontal size={20} />
                {/* Красная точка, если в скрытых есть непрочитанное */}
                {!expanded &&
                  hiddenItems.some(
                    (i) => i.id === "whats-new" && changelogUnread > 0,
                  ) && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red ring-2 ring-surface" />
                  )}
              </span>
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
                <span className="truncate">Ещё</span>
                <span className="ml-auto rounded-full bg-surface-soft px-1.5 py-0.5 text-[10px] font-bold text-muted-2">
                  {hiddenItems.length}
                </span>
              </span>
            </button>
          )}
        </div>

        <UpdateBanner phase={phase} version={version} expanded={expanded} />

        {/* Калькулятор аренды — плавающее окно (не раздел). Открывается отсюда,
            хоткеями Alt+C / Num+, и из мобильного «Ещё». */}
        <button
          type="button"
          onMouseEnter={(e) => handleEnter(e, "Калькулятор · Alt + C")}
          onMouseLeave={handleLeave}
          onClick={() => toggleCalculator()}
          className="sidebar-row relative mb-1 flex h-11 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap rounded-[14px] px-3 text-left text-muted transition-colors hover:bg-blue-50 hover:text-blue-600"
        >
          <span className="relative flex-shrink-0">
            <Calculator size={20} />
          </span>
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
            <span className="truncate">Калькулятор</span>
            <span className="ml-auto rounded-md bg-surface-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-2">
              Alt C
            </span>
          </span>
        </button>

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

      {/* Панель со скрытыми разделами — выезжает сбоку от кнопки «Ещё».
          Держится, пока курсор на кнопке или на самой панели. */}
      {moreOpen && hiddenItems.length > 0 && (
        <div
          onMouseEnter={() => {
            if (closeTimer.current) window.clearTimeout(closeTimer.current);
          }}
          onMouseLeave={scheduleCloseMore}
          className="fixed z-[9998] w-[228px] rounded-2xl border border-border bg-surface p-1.5 shadow-card-lg animate-slide-in-right"
          style={{ left: expanded ? 244 : 80, top: moreTop }}
        >
          <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
            Ещё разделы
          </div>
          {hiddenItems.map((item) => {
            const Icon = item.icon;
            const disabled = item.ready !== true;
            const badge =
              item.id === "whats-new"
                ? changelogUnread
                : item.id === "applications"
                  ? newApplicationsCount
                  : 0;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onSelect(item.id as RouteId);
                  setMoreOpen(false);
                }}
                className={cn(
                  "flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[13px] font-semibold transition-colors",
                  item.id === activeId
                    ? "bg-ink text-white"
                    : disabled
                      ? "cursor-not-allowed text-muted-2 opacity-60"
                      : "text-ink-2 hover:bg-blue-50 hover:text-blue-600",
                )}
              >
                <Icon size={17} className="shrink-0" />
                <span className="truncate">{item.label}</span>
                {disabled && (
                  <span className="ml-auto rounded-full bg-surface-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-2">
                    скоро
                  </span>
                )}
                {!disabled && badge > 0 && (
                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red px-1.5 text-[10px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

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
  badgeCount = 0,
}: {
  item: NavItem;
  active: boolean;
  expanded: boolean;
  onEnter: (e: React.MouseEvent<HTMLButtonElement>, label: string) => void;
  onLeave: () => void;
  onSelect: (id: RouteId) => void;
  badgeCount?: number;
}) {
  const Icon = item.icon;
  const isLogout = item.id === "logout";
  const disabled = !isLogout && item.ready !== true;
  const showBadge = !active && badgeCount > 0;

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
        "sidebar-row relative flex h-11 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap rounded-[14px] px-3 text-left transition-colors",
        active && "bg-ink text-white",
        !active && !disabled && "text-muted hover:bg-blue-50 hover:text-blue-600",
        !active && disabled && "cursor-not-allowed text-muted-2 opacity-50",
      )}
    >
      <span className="relative flex-shrink-0">
        <Icon size={20} />
        {showBadge && !expanded && (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red ring-2 ring-surface" />
        )}
      </span>
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
        {showBadge && !disabled && (
          <span
            className={cn(
              "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
              active ? "bg-white/20 text-white" : "bg-red text-white",
            )}
          >
            {badgeCount}
          </span>
        )}
      </span>
    </button>
  );
}
