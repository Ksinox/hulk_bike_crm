import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Dashboard } from "@/pages/dashboard/Dashboard";
import { UpdateToast } from "./UpdateToast";
import { TitleBar } from "./TitleBar";
import { startWebVersionCheck } from "@/lib/version-check";
import { desktop, isElectron } from "@/platform";

export function App() {
  const [webUpdate, setWebUpdate] = useState<string | null>(null);

  useEffect(() => {
    return startWebVersionCheck((next) => setWebUpdate(next));
  }, []);

  return (
    <>
      <TitleBar />
      <div
        className="mx-auto flex min-h-screen max-w-[1440px] gap-[18px] p-[18px]"
        style={isElectron ? { paddingTop: "calc(18px + 36px)" } : undefined}
      >
        <Sidebar />
        <Dashboard />
        {webUpdate && (
          <UpdateToast
            title="Доступна новая версия"
            description={`Обновите страницу, чтобы перейти на ${webUpdate}.`}
            actionLabel="Обновить"
            onAction={() => window.location.reload()}
            onClose={() => setWebUpdate(null)}
          />
        )}
        <ElectronUpdateWatcher />
      </div>
    </>
  );
}

function ElectronUpdateWatcher() {
  const [available, setAvailable] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<string | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    desktop.onUpdateAvailable(({ version }) => setAvailable(version));
    desktop.onUpdateDownloaded(({ version }) => setDownloaded(version));
  }, []);

  if (downloaded) {
    return (
      <UpdateToast
        title={`Обновление ${downloaded} готово`}
        description="Перезапустите приложение, чтобы применить обновление."
        actionLabel="Перезапустить"
        onAction={() => desktop.quitAndInstall()}
        onClose={() => setDownloaded(null)}
      />
    );
  }
  if (available) {
    return (
      <UpdateToast
        title={`Доступна версия ${available}`}
        description="Загрузка в фоне, мы уведомим когда можно будет перезапустить."
        onClose={() => setAvailable(null)}
      />
    );
  }
  return null;
}
