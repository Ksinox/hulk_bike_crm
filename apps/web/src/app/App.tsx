import { useEffect, useState } from "react";
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
import { ToastContainer, ConfirmContainer } from "@/lib/toast";
import { NewApplicationDetector } from "@/pages/clients/NewApplicationDetector";

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
    <>
      <TitleBar />
      <div
        className="mx-auto flex min-h-screen max-w-[1440px] gap-[18px] p-[18px]"
        style={isElectron ? { paddingTop: "calc(18px + 36px)" } : undefined}
      >
        <Sidebar activeId={route} onSelect={onSelect} />
        {route === "clients" ? (
          <Clients />
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
        )}
        {webUpdate && (
          <UpdateToast
            title="Доступна новая версия"
            description={`Обновите страницу, чтобы перейти на ${webUpdate}.`}
            actionLabel="Обновить"
            onAction={() => window.location.reload()}
            onClose={() => setWebUpdate(null)}
          />
        )}
      </div>
      <NewApplicationDetector />
      <ToastContainer />
      <ConfirmContainer />
    </>
  );
}
