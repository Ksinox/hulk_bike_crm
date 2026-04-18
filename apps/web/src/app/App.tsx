import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Dashboard } from "@/pages/dashboard/Dashboard";
import { UpdateToast } from "./UpdateToast";
import { startWebVersionCheck } from "@/lib/version-check";

export function App() {
  const [webUpdate, setWebUpdate] = useState<string | null>(null);

  useEffect(() => {
    return startWebVersionCheck((next) => setWebUpdate(next));
  }, []);

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Dashboard />
      </div>
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
  );
}

import { desktop, isElectron } from "@/platform";

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
