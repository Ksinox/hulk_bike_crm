import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RouteId } from "@/app/route";
import { useMe, useLogout } from "@/lib/api/auth";
import { FabProvider, type PageFab } from "./fab";
import { useSheetDrag, SheetHandle } from "./ui";
import {
  buildMoreItems,
  logoutIcon as LogoutIcon,
  moreIcon as MoreIcon,
  routeTitle,
  tabItems,
  type MobileNavItem,
} from "./nav";
import { MobileDashboard } from "./pages/MobileDashboard";
import { MobileRentals } from "./pages/MobileRentals";
import { MobileClients } from "./pages/MobileClients";
import { MobileScooters } from "./pages/MobileScooters";
import { MobileApplications } from "./pages/MobileApplications";
import { MobileDebtors } from "./pages/MobileDebtors";
import { MobileService } from "./pages/MobileService";
import { MobileStaff } from "./pages/MobileStaff";
import { MobileWhatsNew } from "./pages/MobileWhatsNew";
import { MobileSettings } from "./pages/MobileSettings";
import { MobileDocuments } from "./pages/MobileDocuments";
import { MobilePlaceholder } from "./pages/MobilePlaceholder";
import { StoragePage } from "@/pages/storage/StoragePage";

/**
 * Корень мобильного слоя. Полностью отдельная оболочка: верхняя панель,
 * прокручиваемый контент и нижний таб-бар (iOS-подобный). Десктоп-код
 * (App → AppShell → Sidebar) не задействован.
 *
 * Источник навигации общий с десктопом — RouteId + onSelect из App,
 * поэтому выбранный раздел синхронизирован между режимами (localStorage).
 */
export function MobileApp({
  route,
  onSelect,
}: {
  route: RouteId;
  onSelect: (id: RouteId) => void;
}) {
  const { data: me } = useMe();
  const canManageStaff = me?.role === "creator" || me?.role === "director";
  const moreItems = buildMoreItems(canManageStaff);
  const [moreOpen, setMoreOpen] = useState(false);
  const [fab, setFab] = useState<PageFab | null>(null);

  // Пока смонтирован мобильный слой — лочим прокрутку самой страницы, чтобы
  // высота dvh-корня совпадала с видимой областью и нижний таб-бар не уезжал
  // под браузерный тулбар iOS. min-height body из index.css перекрываем на 0.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyMinH: body.style.minHeight,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.minHeight = "0";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.minHeight = prev.bodyMinH;
    };
  }, []);

  const go = (id: RouteId) => {
    onSelect(id);
    setMoreOpen(false);
  };

  return (
    // App-shell, устойчивый к iOS Safari и адаптивный к ЛЮБОМУ размеру
    // экрана (телефон/планшет, любая ширина/высота):
    //  • корень h-[100dvh] — динамическая высота вьюпорта (учитывает
    //    браузерный тулбар iOS, в отличие от 100vh/inset-0), страница
    //    залочена (см. useEffect выше) → ничего не «уезжает»;
    //  • шапка и нижний таб-бар — В ПОТОКЕ (shrink-0), не position:fixed
    //    (fixed у нижней кромки на iOS уходит под тулбар);
    //  • скроллится только <main>;
    //  • FAB — absolute внутри relative-корня (не fixed) по той же причине.
    <FabProvider set={setFab}>
      <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-bg">
        <MobileTopBar title={routeTitle(route)} />

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6 pt-3 overscroll-contain">
          <MobilePage route={route} onSelect={go} />
        </main>

        <MobileTabBar
          route={route}
          onSelect={go}
          onMore={() => setMoreOpen(true)}
          moreActive={moreOpen || isMoreRoute(route)}
        />

        {fab && (
          <button
            type="button"
            onClick={fab.onClick}
            className="absolute bottom-[calc(72px+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-blue-600 px-5 text-[15px] font-bold text-white shadow-card-lg active:scale-95"
          >
            <Plus size={20} strokeWidth={2.5} />
            {fab.label}
          </button>
        )}

        {moreOpen && (
          <MoreSheet
            items={moreItems}
            activeRoute={route}
            onSelect={go}
            onClose={() => setMoreOpen(false)}
          />
        )}
      </div>
    </FabProvider>
  );
}

/* ───────────────────────── контент ───────────────────────── */

function MobilePage({
  route,
  onSelect,
}: {
  route: RouteId;
  onSelect: (id: RouteId) => void;
}) {
  switch (route) {
    case "dashboard":
      return <MobileDashboard onSelect={onSelect} />;
    case "rentals":
      return <MobileRentals />;
    case "clients":
      return <MobileClients />;
    case "fleet":
      return <MobileScooters />;
    case "applications":
      return <MobileApplications />;
    case "debtors":
      return <MobileDebtors />;
    case "service":
      return <MobileService />;
    case "staff":
      return <MobileStaff />;
    case "whats-new":
      return <MobileWhatsNew />;
    case "settings":
      return <MobileSettings />;
    case "docs":
      return <MobileDocuments />;
    case "storage":
      // Страница «Хранилище» адаптивна — переиспользуем десктопную в мобильной
      // обёртке (она и так grid-cols-1 на узком экране).
      return (
        <div className="px-1 pb-4">
          <StoragePage />
        </div>
      );
    default:
      return <MobilePlaceholder route={route} />;
  }
}

/* ───────────────────────── верхняя панель ───────────────────────── */

function MobileTopBar({ title }: { title: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 pt-[env(safe-area-inset-top)]">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] bg-ink text-white">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth="2" />
          <path
            d="M8 7v10M16 7v10M8 12h8"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h1 className="font-display text-[18px] font-bold tracking-tight text-ink">
        {title}
      </h1>
    </header>
  );
}

/* ───────────────────────── нижний таб-бар ───────────────────────── */

function MobileTabBar({
  route,
  onSelect,
  onMore,
  moreActive,
}: {
  route: RouteId;
  onSelect: (id: RouteId) => void;
  onMore: () => void;
  moreActive: boolean;
}) {
  return (
    <nav className="shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex h-[60px] max-w-md items-stretch justify-around px-1">
        {tabItems.map((item) => (
          <TabButton
            key={item.id}
            item={item}
            active={!moreActive && route === item.id}
            onClick={() => onSelect(item.id)}
          />
        ))}
        <button
          type="button"
          onClick={onMore}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl",
            moreActive ? "text-blue-600" : "text-muted",
          )}
        >
          <MoreIcon size={22} strokeWidth={moreActive ? 2.4 : 2} />
          <span className="text-[10px] font-semibold">Ещё</span>
        </button>
      </div>
    </nav>
  );
}

function TabButton({
  item,
  active,
  onClick,
}: {
  item: MobileNavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors",
        active ? "text-blue-600" : "text-muted",
      )}
    >
      <Icon size={22} strokeWidth={active ? 2.4 : 2} />
      <span className="text-[10px] font-semibold">{item.label}</span>
    </button>
  );
}

/* ───────────────────────── шторка «Ещё» ───────────────────────── */

function MoreSheet({
  items,
  activeRoute,
  onSelect,
  onClose,
}: {
  items: MobileNavItem[];
  activeRoute: RouteId;
  onSelect: (id: RouteId) => void;
  onClose: () => void;
}) {
  const logoutMut = useLogout();
  const { handleProps, sheetStyle } = useSheetDrag(onClose);
  const handleLogout = async () => {
    try {
      await logoutMut.mutateAsync();
    } finally {
      window.location.reload();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={sheetStyle}
        className="rounded-t-3xl bg-surface px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-card-lg animate-sheet-up"
      >
        <SheetHandle handleProps={handleProps} />
        <div className="grid grid-cols-4 gap-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeRoute;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-center transition-colors",
                  active ? "bg-blue-50 text-blue-600" : "text-ink hover:bg-surface-soft",
                )}
              >
                <Icon size={24} strokeWidth={2} />
                <span className="text-[11px] font-semibold leading-tight">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-surface-soft py-3 text-[14px] font-semibold text-red"
        >
          <LogoutIcon size={18} /> Выйти
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── utils ───────────────────────── */

function isMoreRoute(route: RouteId): boolean {
  return !tabItems.some((t) => t.id === route);
}
