declare global {
  interface Window {
    hulkDesktop?: {
      getVersion: () => Promise<string>;
      onUpdateAvailable: (cb: (info: { version: string }) => void) => void;
      onUpdateDownloaded: (cb: (info: { version: string }) => void) => void;
      quitAndInstall: () => void;
      checkForUpdates: () => void;
    };
  }
}

export const isElectron = typeof window !== "undefined" && !!window.hulkDesktop;

export const desktop = {
  getVersion: () => window.hulkDesktop?.getVersion() ?? Promise.resolve("web"),
  onUpdateAvailable: (cb: (info: { version: string }) => void) =>
    window.hulkDesktop?.onUpdateAvailable(cb),
  onUpdateDownloaded: (cb: (info: { version: string }) => void) =>
    window.hulkDesktop?.onUpdateDownloaded(cb),
  quitAndInstall: () => window.hulkDesktop?.quitAndInstall(),
  checkForUpdates: () => window.hulkDesktop?.checkForUpdates(),
};
