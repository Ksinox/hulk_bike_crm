import { isElectron } from "@/platform";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

type VersionPayload = { version: string };

export function startWebVersionCheck(
  onNewVersion: (next: string, current: string) => void,
) {
  if (isElectron) return () => {};

  let currentVersion: string | null = null;

  const check = async () => {
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as VersionPayload;
      if (currentVersion === null) {
        currentVersion = data.version;
        return;
      }
      if (data.version !== currentVersion) {
        onNewVersion(data.version, currentVersion);
      }
    } catch {
      // Сеть/парсинг — игнорируем, попробуем в следующий раз
    }
  };

  void check();
  const handle = window.setInterval(check, CHECK_INTERVAL_MS);
  return () => window.clearInterval(handle);
}
