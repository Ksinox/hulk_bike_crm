import { E as EnumReason, l as logger, s as shareDetectApi } from './sharedCode-DUWxCQ-o.js';
import { i as initBlitzExt } from './blitz-ext-De4c8IqC.js';

const runtimeOnInstalled = ({ api, installedDetails }) => {
  if (installedDetails.reason === EnumReason.INSTALL) {
    logger.debug(`[runtimeOnInstalled❗] installedDetails`, `<${typeof installedDetails}>`, installedDetails);
    api.action.openPopup().then(() => true).catch((error) => logger.error("[runtimeOnInstalled] Failed to open popup", error));
  }
  if (installedDetails.reason === EnumReason.UPDATE) {
    const versionCurrent = api.runtime.getManifest().version;
    const versionPrevious = installedDetails.previousVersion ?? "";
    logger.info(`Updated from ${versionPrevious} to ${versionCurrent}!`);
  }
};
const runtimeOnConnect = ({ api, runtimePort }) => {
  const [_, hostName] = runtimePort.name.split("|");
  const hostPort = api.runtime.connectNative(String(hostName));
  runtimePort.onMessage.addListener((message) => hostPort.postMessage(message));
  runtimePort.onDisconnect.addListener(() => hostPort.disconnect());
  hostPort.onMessage.addListener((message) => runtimePort.postMessage(message));
  hostPort.onDisconnect.addListener(() => {
    if (api.runtime.lastError) {
      runtimePort.postMessage({
        error: "Disconnected",
        message: api.runtime.lastError.message
      });
      logger.warn("Disconnected:", api.runtime.lastError.message);
    } else {
      runtimePort.postMessage({ error: "Disconnected" });
    }
    runtimePort.disconnect();
  });
};

initBlitzExt();
logger.info("[Background] Starting service worker");
(() => {
  let api;
  try {
    api = shareDetectApi();
  } catch (error) {
    logger.error("[Background] API detection failed:", error);
    return;
  }
  logger.debug("[Background] API detected:", typeof api);
  const hasRuntime = typeof api.runtime !== "undefined" && api.runtime !== null;
  const hasRuntimeId = hasRuntime && typeof api.runtime.id === "string" && api.runtime.id.length > 0;
  if (!hasRuntimeId) {
    logger.error("[Background] Chrome API not found or invalid!");
    return;
  }
  logger.debug("[Background] ✓ Extension ID:", api.runtime.id);
  api.runtime.onInstalled.addListener((installedDetails) => {
    logger.debug("[Background] onInstalled triggered:", installedDetails.reason);
    runtimeOnInstalled({
      api,
      installedDetails
    });
  });
  api.runtime.onConnect.addListener((runtimePort) => {
    logger.debug("[Background] onConnect triggered:", runtimePort.name);
    runtimeOnConnect({
      api,
      runtimePort
    });
  });
  logger.info("[Background] ✓ Service worker initialized");
})();
