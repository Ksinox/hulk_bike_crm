import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Dashboard } from "@/pages/dashboard/Dashboard";
import { Clients } from "@/pages/clients/Clients";
import { Rentals } from "@/pages/rentals/Rentals";
import { UpdateToast } from "./UpdateToast";
import { TitleBar } from "./TitleBar";
import { startWebVersionCheck } from "@/lib/version-check";
import { isElectron } from "@/platform";
import { loadRoute, saveRoute, type RouteId } from "./route";
import { usePendingNavigation } from "./navigationStore";

export function App() {
  const [webUpdate, setWebUpdate] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteId>(() => loadRoute());
  const pending = usePendingNavigation();

  useEffect(() => {
    return startWebVersionCheck((next) => setWebUpdate(next));
  }, []);

  useEffect(() => {
    if (pending && pending.route !== route) {
      setRoute(pending.route);
      saveRoute(pending.route);
    }
  }, [pending, route]);

  const onSelect = (id: RouteId) => {
    setRoute(id);
    saveRoute(id);
  };

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
    </>
  );
}
