import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as path from "node:path";
import log from "electron-log";
import { initAutoUpdater, checkForUpdatesNow } from "./updater";

log.transports.file.level = "info";
log.info("Халк Байк CRM стартует", { version: app.getVersion() });

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#f8fafc",
    title: "Халк Байк CRM",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    void mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // extraResources кладёт web-бандл в process.resourcesPath/web
    const indexPath = path.join(process.resourcesPath, "web", "index.html");
    void mainWindow.loadFile(indexPath);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

void app.whenReady().then(() => {
  createWindow();
  if (!isDev) {
    // Даём UI проявиться, потом стартуем апдейтер
    setTimeout(() => initAutoUpdater(() => mainWindow), 4_000);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("app:getVersion", () => app.getVersion());
ipcMain.on("updater:checkForUpdates", () => {
  if (!isDev) checkForUpdatesNow();
});
ipcMain.on("updater:quitAndInstall", () => {
  const { autoUpdater } = require("electron-updater");
  autoUpdater.quitAndInstall();
});
