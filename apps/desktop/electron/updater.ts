import { autoUpdater } from "electron-updater";
import log from "electron-log";
import type { BrowserWindow } from "electron";

autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

type WindowGetter = () => BrowserWindow | null;

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

  checkForUpdatesNow();
}

export function checkForUpdatesNow() {
  autoUpdater.checkForUpdates().catch((err) => {
    log.error("updater: checkForUpdates failed", err);
  });
}
