import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Dashboard } from "@/pages/dashboard/Dashboard";
import { Clients } from "@/pages/clients/Clients";
import { Rentals } from "@/pages/rentals/Rentals";
import { Documents } from "@/pages/documents/Documents";
import { Garage } from "@/pages/fleet/Garage";
import { Service } from "@/pages/service/Service";
import { Settings } from "@/pages/settings/Settings";
import { Staff } from "@/pages/staff/Staff";
import { WhatsNew } from "@/pages/whats-new/WhatsNew";
import { Applications } from "@/pages/applications/Applications";
import { UpdateToast } from "./UpdateToast";
import { TitleBar } from "./TitleBar";
import { startWebVersionCheck } from "@/lib/version-check";
import { isElectron } from "@/platform";
import { loadRoute, saveRoute, type RouteId } from "./route";
import { onNavigate } from "./navigationStore";
import { useMe } from "@/lib/api/auth";
import { useAppSettings } from "@/lib/api/app-settings";
import { setRole } from "@/lib/role";
import { Login } from "./Login";
import { ForceChangePassword } from "./ForceChangePassword";
import {
  ToastContainer,
  ConfirmContainer,
  PickContainer,
  PromptContainer,
} from "@/lib/toast";
import {
  DashboardDrawerProvider,
  DashboardDrawerStack,
  useDashboardDrawer,
} from "@/pages/dashboard/DashboardDrawer";
import { NewApplicationDetector } from "@/pages/clients/NewApplicationDetector";
import { cn } from "@/lib/utils";

export function App() {
  const { data: me, isLoading, isError } = useMe();
  // v0.4.1: подгружаем глобальные настройки на старте — внутри хука
  // billing_period_start_day прокидывается в lib/billingPeriod.
  useAppSettings();
  const [webUpdate, setWebUpdate] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteId>(() => loadRoute());

  // Синхронизация роли в UI-сторе (lib/role) с реальной ролью из сессии.
  // - director/admin: role фиксируется = me.role
  // - creator: оставляем то что было в localStorage (может "смотреть как" director/admin)
  useEffect(() => {
    if (!me) return;
    if (me.role === "director" || me.role === "admin") {
      setRole(me.role);
    }
    // для creator не трогаем — пусть пользуется переключателем в Topbar
  }, [me?.role]);

  useEffect(() => {
    return startWebVersionCheck((next) => setWebUpdate(next));
  }, []);

  useEffect(() => {
    return onNavigate((req) => {
      setRoute(req.route);
      saveRoute(req.route);
    });
  }, []);

  const onSelect = (id: RouteId) => {
    setRoute(id);
    saveRoute(id);
  };

  // Пока проверяем сессию — показываем заглушку.
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-soft text-muted">
        Загрузка…
      </div>
    );
  }
  // Нет сессии → экран входа
  if (isError || !me) {
    return <Login />;
  }

  // Юзер обязан сменить пароль (создан/сброшен creator'ом или director'ом).
  // Показываем блокирующий экран — пока не поменяет, в CRM не пускаем.
  if (me.mustChangePassword) {
    return <ForceChangePassword />;
  }

  return (
    <DashboardDrawerProvider>
      <AppShell
        route={route}
        onSelect={onSelect}
        webUpdate={webUpdate}
        onCloseUpdate={() => setWebUpdate(null)}
      />
      <NewApplicationDetector />
      <ToastContainer />
      <ConfirmContainer />
      <PickContainer />
      <PromptContainer />
    </DashboardDrawerProvider>
  );
}

/**
 * v0.7.18: AppShell живёт ВНУТРИ DashboardDrawerProvider, поэтому читает
 * стек drawer'ов. Когда стек пуст — раскладка прежняя (sidebar + контент,
 * скролл всей страницы). Когда открыт хотя бы один drawer — контент и
 * стек push-колонок кладутся в общий горизонтально-скроллящийся контейнер
 * фиксированной высоты (вьюпорт): drawer сдвигает контент влево, несколько
 * drawer'ов выстраиваются цепочкой, при переполнении — горизонтальный
 * скролл. То же поведение, что и у карточки в «Аренды» (не overlay).
 */
function AppShell({
  route,
  onSelect,
  webUpdate,
  onCloseUpdate,
}: {
  route: RouteId;
  onSelect: (id: RouteId) => void;
  webUpdate: string | null;
  onCloseUpdate: () => void;
}) {
  const { stack } = useDashboardDrawer();
  const hasDrawers = stack.length > 0;
  // v0.7.0: «Аренды» — на всю ширину (своя push-раскладка карточки).
  // Остальные страницы — центрированный контейнер max-w-[1440px].
  const fullWidth = route === "rentals";
  const scrollRef = useRef<HTMLDivElement>(null);
  // Высота скролл-области = вьюпорт минус electron-titlebar (36px).
  const shellHeight = isElectron ? "calc(100vh - 36px)" : "100vh";

  // Авто-скролл вправо при добавлении новой панели — свежий drawer в фокусе.
  useEffect(() => {
    if (!hasDrawers) return;
    const el = scrollRef.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [stack.length, hasDrawers]);

  // Колесо мыши над контейнером (вне вертикально-скроллящегося элемента) →
  // горизонтальный скролл цепочки drawer'ов. Нативный listener {passive:false}.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      let cur = e.target as HTMLElement | null;
      while (cur && cur !== el) {
        const cs = window.getComputedStyle(cur);
        if (
          (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
          cur.scrollHeight > cur.clientHeight
        ) {
          return; // даём работать вертикальному скроллу внутри колонки
        }
        cur = cur.parentElement;
      }
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasDrawers]);

  const pageNode =
    route === "clients" ? (
      <Clients />
    ) : route === "applications" ? (
      <Applications />
    ) : route === "rentals" ? (
      <Rentals />
    ) : route === "fleet" ? (
      <Garage />
    ) : route === "service" ? (
      <Service />
    ) : route === "staff" ? (
      <Staff />
    ) : route === "docs" ? (
      <Documents />
    ) : route === "whats-new" ? (
      <WhatsNew />
    ) : route === "settings" ? (
      <Settings />
    ) : (
      <Dashboard />
    );

  return (
    <>
      <TitleBar />
      {/* sidebar всегда прижат к левому краю на всех страницах. */}
      <div
        className="flex"
        style={
          hasDrawers
            ? {
                ...(isElectron ? { paddingTop: "36px" } : {}),
                height: shellHeight,
                overflow: "hidden",
              }
            : isElectron
              ? { minHeight: "100vh", paddingTop: "36px" }
              : { minHeight: "100vh" }
        }
      >
        <Sidebar activeId={route} onSelect={onSelect} />
        {hasDrawers ? (
          // Режим «расследования»: контент + цепочка push-колонок в общем
          // горизонтально-скроллящемся контейнере.
          <div
            ref={scrollRef}
            className="flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          >
            {/* Контент страницы — вертикально-скроллящаяся колонка, которая
                сжимается под напором drawer'ов до min-width, затем включается
                горизонтальный скролл всего ряда. */}
            <div
              className="flex min-h-0 flex-1 overflow-y-auto"
              style={{ minWidth: fullWidth ? undefined : 760 }}
            >
              <div
                className={cn(
                  "flex min-w-0 flex-1",
                  fullWidth ? "" : "mx-auto max-w-[1440px] gap-[18px] p-[18px]",
                )}
              >
                {pageNode}
              </div>
            </div>
            <DashboardDrawerStack />
          </div>
        ) : (
          <div
            className={cn(
              "flex min-w-0 flex-1",
              fullWidth ? "" : "mx-auto max-w-[1440px] gap-[18px] p-[18px]",
            )}
          >
            {pageNode}
          </div>
        )}
        {webUpdate && (
          <UpdateToast
            title="Доступна новая версия"
            description={`Обновите страницу, чтобы перейти на ${webUpdate}.`}
            actionLabel="Обновить"
            onAction={() => window.location.reload()}
            onClose={onCloseUpdate}
          />
        )}
      </div>
    </>
  );
}
