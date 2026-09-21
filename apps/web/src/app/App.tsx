import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { authKeys } from "@/lib/api/auth";
import { Sidebar } from "./Sidebar";
import { Dashboard } from "@/pages/dashboard/Dashboard";
import { Clients } from "@/pages/clients/Clients";
import { Rentals } from "@/pages/rentals/Rentals";
import { Debtors } from "@/pages/debtors/Debtors";
import { Documents } from "@/pages/documents/Documents";
import { Garage } from "@/pages/fleet/Garage";
import { Service } from "@/pages/service/Service";
import { Settings } from "@/pages/settings/Settings";
import { Staff } from "@/pages/staff/Staff";
import { Analytics } from "@/pages/analytics/Analytics";
import { AnalyticsWall } from "@/pages/analytics/AnalyticsWall";
import { Progress } from "@/pages/progress/Progress";
import { Partners } from "@/pages/partners/Partners";
import { Sales } from "@/pages/sales/Sales";
import { Finance } from "@/pages/finance/Finance";
import { Buyout } from "@/pages/buyout/Buyout";
import { Applications } from "@/pages/applications/Applications";
import { UpdateToast } from "./UpdateToast";
import { TitleBar } from "./TitleBar";
import { startWebVersionCheck } from "@/lib/version-check";
import { APP_VERSION } from "@/data/releases";
import { normalizeRoute } from "./route";
import { isElectron } from "@/platform";
import { loadRoute, saveRoute, type RouteId } from "./route";
import { onNavigate } from "./navigationStore";
import { useMe } from "@/lib/api/auth";
import { useAppSettings } from "@/lib/api/app-settings";
import { useBillingPeriodAnchors } from "@/lib/api/billing-period";
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
  drawerLayout,
  sideColumnWidth,
  DRAWER_MAX_W,
  useDashboardDrawer,
} from "@/pages/dashboard/DashboardDrawer";
import { NewApplicationDetector } from "@/pages/clients/NewApplicationDetector";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/useIsMobile";
import { MobileApp } from "@/mobile/MobileApp";
import { ReleaseTour } from "@/release/ReleaseTour";
import { RentalCalculator } from "@/pages/calculator/RentalCalculator";
import { DirectorKeyGateProvider } from "@/components/DirectorKeyGate";

export function App() {
  const isMobile = useIsMobile();
  const { data: me, isLoading, isError, error: meError } = useMe();
  // 15.09: почему показываем вход — чтобы человек не гадал, куда делась сессия.
  const loginNotice = (() => {
    const b = meError instanceof ApiError ? (meError.body as { error?: string; reason?: string } | null) : null;
    if (b?.error === "session_revoked") return b.reason === "update" ? "update" : "revoked";
    if (b?.error === "user_deactivated") return "deactivated";
    return null;
  })();
  useEffect(() => {
    const onEnded = () => {
      // Только если человек внутри CRM. На экране входа сессии и так нет:
      // перезапрос /me пересоздавал форму и стирал набираемый пароль.
      if (!queryClient.getQueryData(authKeys.me)) return;
      void queryClient.invalidateQueries({ queryKey: authKeys.me });
    };
    window.addEventListener("hulk:session-ended", onEnded);
    return () => window.removeEventListener("hulk:session-ended", onEnded);
  }, []);
  // v0.4.1: подгружаем глобальные настройки на старте — внутри хука
  // billing_period_start_day прокидывается в lib/billingPeriod (легаси
  // быстрый путь).
  //
  // 15.09: только после входа. На экране входа эти запросы получали 401 раз
  // в 30 секунд и на каждый фокус окна (на телефоне — открытие клавиатуры).
  useAppSettings({ enabled: !!me });
  // v0.7: источник правды расчётного периода — якоря (anchors). Хук грузит
  // их с сервера и прокидывает в lib/billingPeriod, перетирая плоское
  // значение app_settings. Так смена дня старта не переписывает прошлое.
  useBillingPeriodAnchors({ enabled: !!me });
  /**
   * Новая сборка на сервере. `version` — номер для людей (2.0.3); `same` —
   * номер тот же, что у открытой страницы: вышли исправления без новой
   * версии (18.09: на превью и после хотфиксов тост писал «Доступна
   * версия 2.0.2», хотя человек уже на 2.0.2).
   */
  const [webUpdate, setWebUpdate] = useState<{ version: string; same: boolean } | null>(null);
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
    // В webUpdate кладём пользовательскую версию (1.0.0) для тоста; если её нет
    // в version.json (старая сборка) — падаем на build-id.
    return startWebVersionCheck((next, _cur, appVersion) =>
      setWebUpdate({ version: appVersion ?? next, same: appVersion === APP_VERSION }),
    );
  }, []);

  useEffect(() => {
    return onNavigate((req) => {
      const r = normalizeRoute(req.route);
      setRoute(r);
      saveRoute(r);
    });
  }, []);

  const onSelect = (id: RouteId) => {
    const r = normalizeRoute(id);
    setRoute(r);
    saveRoute(r);
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
    return <Login notice={loginNotice} />;
  }

  // Экран на второй монитор (06.09): отдельное окно без сайдбара и шапки —
  // открывается кнопкой «На второй монитор» в «Аналитике».
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("screen") === "analytics-wall"
  ) {
    return <AnalyticsWall />;
  }

  // Юзер обязан сменить пароль (создан/сброшен creator'ом или director'ом).
  // Показываем блокирующий экран — пока не поменяет, в CRM не пускаем.
  if (me.mustChangePassword) {
    return <ForceChangePassword />;
  }

  // Тост «Доступна новая версия» — ОБЩИЙ для мобилы и десктопа. Одна
  // кнопка «Обновить» (18.09, заказчик): после обновления и так открывается
  // полноэкранный показ того, что изменилось, — «Что нового» было лишним.
  const updateToastNode = webUpdate ? (
    <UpdateToast
      title={webUpdate.same ? "Доступно обновление" : `Доступна версия ${webUpdate.version}`}
      description={
        webUpdate.same
          ? "Вышли исправления — обновите страницу, чтобы их получить."
          : "Обновите страницу и посмотрите, что изменилось."
      }
      actionLabel="Обновить"
      onAction={() => window.location.reload()}
      onClose={() => setWebUpdate(null)}
    />
  ) : null;

  // Мобильный слой — отдельная оболочка (нижний таб-бар + свои экраны).
  // Десктоп-путь ниже не задействуется. Навигация общая (route/onSelect).
  if (isMobile) {
    return (
      <DashboardDrawerProvider>
        <MobileApp route={route} onSelect={onSelect} />
        {/* 15.09: показ обновления — титул, карточки, подсказки на месте. */}
        <ReleaseTour route={route} onSelect={onSelect} isMobile />
        {updateToastNode}
        <NewApplicationDetector />
        <RentalCalculator />
        <DirectorKeyGateProvider />
        <ToastContainer />
        <ConfirmContainer />
        <PickContainer />
        <PromptContainer />
      </DashboardDrawerProvider>
    );
  }

  return (
    <DashboardDrawerProvider>
      <AppShell route={route} onSelect={onSelect} />
      <ReleaseTour route={route} onSelect={onSelect} isMobile={false} />
      {updateToastNode}
      <NewApplicationDetector />
      <RentalCalculator />
      <DirectorKeyGateProvider />
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
}: {
  route: RouteId;
  onSelect: (id: RouteId) => void;
}) {
  const { stack, close, side } = useDashboardDrawer();
  const hasDrawers = stack.length > 0;
  // v0.9.2: уход на ДРУГУЮ страницу закрывает quick-view drawer — иначе
  // карточка drawer'а накладывается на собственную панель страницы
  // (классический случай: дашборд открыл аренду в drawer → переход на
  // «Аренды» → её панель + завис drawer = две карточки внахлёст).
  // Drill-in и quick-view route НЕ меняют, поэтому их это не трогает.
  // closeRef — чтобы effect зависел только от route и не закрывал drawer
  // сразу при открытии (ссылка close меняется при каждом setStack).
  const closeRef = useRef(close);
  closeRef.current = close;
  const prevRouteRef = useRef(route);
  useEffect(() => {
    if (prevRouteRef.current !== route) {
      prevRouteRef.current = route;
      closeRef.current();
    }
  }, [route]);
  // v0.7.0: «Аренды» — на всю ширину (своя push-раскладка карточки).
  // Остальные страницы — центрированный контейнер max-w-[1440px].
  // Аналитика (07.09) сама держит отступы и высоту — ей нужен весь экран.
  const fullWidth = route === "rentals" || route === "analytics";
  const scrollRef = useRef<HTMLDivElement>(null);
  // Высота скролл-области = вьюпорт минус electron-titlebar (36px).
  const shellHeight = isElectron ? "calc(100vh - 36px)" : "100vh";

  /**
   * Ширина ряда «контент + колонки». Нужна, чтобы карточка помещалась
   * целиком: контент сжимается под неё, а не выталкивает её за экран
   * (фидбэк 01.09). Меряем сам контейнер, а не окно — так учитываются
   * и сайдбар, и полосы прокрутки.
   */
  const [shellWidth, setShellWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setShellWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    setShellWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, [hasDrawers]);

  /** Сколько места оставить контенту под открытыми колонками. */
  const drawerFit = useMemo(() => {
    const widths = [
      ...stack.map(() => DRAWER_MAX_W),
      ...(side ? [sideColumnWidth(side.kind)] : []),
    ];
    return drawerLayout(shellWidth, widths);
  }, [stack.length, side, shellWidth]);

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
    ) : route === "debtors" ? (
      <Debtors />
    ) : route === "fleet" ? (
      <Garage />
    ) : route === "service" ? (
      <Service />
    ) : route === "staff" ? (
      <Staff />
    ) : route === "docs" ? (
      <Documents />
    ) : route === "progress" || route === "whats-new" ? (
      <Progress />
    ) : route === "partners" ? (
      <Partners />
    ) : route === "sales" ? (
      <Sales />
    ) : route === "finance" ? (
      <Finance />
    ) : route === "rassrochki" ? (
      <Buyout />
    ) : route === "settings" || route === "storage" ? (
      <Settings />
    ) : route === "analytics" ? (
      <Analytics />
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
              style={{
                minWidth: fullWidth ? undefined : drawerFit.contentMin,
              }}
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
            <DashboardDrawerStack available={shellWidth} />
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
      </div>
    </>
  );
}
