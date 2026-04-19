import { contextBridge, ipcRenderer } from "electron";

type UpdateInfo = { version: string };

contextBridge.exposeInMainWorld("hulkDesktop", {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  checkForUpdates: () => ipcRenderer.send("updater:checkForUpdates"),
  quitAndInstall: () => ipcRenderer.send("updater:quitAndInstall"),
  onUpdateAvailable: (cb: (info: UpdateInfo) => void) => {
    ipcRenderer.on("updater:update-available", (_evt, info: UpdateInfo) =>
      cb(info),
    );
  },
  onUpdateDownloaded: (cb: (info: UpdateInfo) => void) => {
    ipcRenderer.on("updater:update-downloaded", (_evt, info: UpdateInfo) =>
      cb(info),
    );
  },
  windowMinimize: () => ipcRenderer.send("window:minimize"),
  windowMaximize: () => ipcRenderer.send("window:maximize"),
  windowClose: () => ipcRenderer.send("window:close"),
});
