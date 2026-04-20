import { autoUpdater } from "electron-updater";
import log from "electron-log";
import type { BrowserWindow } from "electron";

autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

/** Интервал повторной проверки обновлений (30 минут) */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

type WindowGetter = () => BrowserWindow | null;

let checkIntervalId: NodeJS.Timeout | null = null;

export function initAutoUpdater(getWindow: WindowGetter) {
  autoUpdater.on("checking-for-update", () => {
    log.info("updater: checking for update");
  });

  autoUpdater.on("update-available", (info) => {
    log.info("updater: update available", info.version);
    getWindow()?.webContents.send("updater:update-available", {
      version: info.version,
    });
  });

  autoUpdater.on("update-not-available", () => {
    log.info("updater: up to date");
  });

  autoUpdater.on("download-progress", (progress) => {
    log.info(
      `updater: download ${Math.round(progress.percent)}% (${Math.round(progress.bytesPerSecond / 1024)} KB/s)`,
    );
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("updater: downloaded", info.version);
    getWindow()?.webContents.send("updater:update-downloaded", {
      version: info.version,
    });
  });

  autoUpdater.on("error", (err) => {
    log.error("updater: error", err);
  });

  // Первая проверка сразу
  checkForUpdatesNow();

  // И далее периодически, пока приложение работает
  if (checkIntervalId) clearInterval(checkIntervalId);
  checkIntervalId = setInterval(() => {
    log.info("updater: periodic check");
    checkForUpdatesNow();
  }, CHECK_INTERVAL_MS);
}

export function checkForUpdatesNow() {
  autoUpdater.checkForUpdates().catch((err) => {
    log.error("updater: checkForUpdates failed", err);
  });
}

/**
 * Тихая установка и авто-перезапуск — без системных диалогов NSIS,
 * без выбора каталога, без окна прогресса.
 * isSilent=true — не показывать UI инсталлятора
 * isForceRunAfter=true — запустить приложение после установки
 */
export function quitAndInstallSilently() {
  log.info("updater: quitAndInstall (silent)");
  autoUpdater.quitAndInstall(true, true);
}
