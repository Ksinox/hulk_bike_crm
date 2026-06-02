import { i as initBlitzExt } from './blitz-ext-De4c8IqC.js';
import { g as globalwindow, l as logger, s as shareDetectApi } from './sharedCode-DUWxCQ-o.js';

function usePostMessage(message, targetOrigin = globalwindow.location.origin) {
  try {
    globalwindow.postMessage(message, targetOrigin);
  } catch (error) {
    logger.error("[usePostMessage] Failed to send message:", error);
  }
}

function createPort({
  eventData,
  state,
  browserRuntime,
  extensionId
}) {
  const portName = `FireWyrmPort${state.nextId += 1}|${eventData.host}`;
  logger.debug("[createPort] Creating port:", portName);
  const runtimePort = browserRuntime.connect({ name: portName });
  state.connectPorts[portName] = runtimePort;
  runtimePort.onMessage.addListener((message) => {
    logger.debug("[createPort] Native -> Page:", message);
    usePostMessage(
      {
        ...message,
        source: "host",
        port: portName,
        ext: extensionId
      },
      globalwindow.location.origin
    );
  });
  runtimePort.onDisconnect.addListener(() => {
    logger.debug("[createPort] Port disconnected:", portName);
    delete state.connectPorts[portName];
    const lastError = chrome.runtime.lastError;
    usePostMessage(
      {
        source: "host",
        port: portName,
        ext: extensionId,
        message: "Disconnected",
        error: lastError?.message
      },
      globalwindow.location.origin
    );
  });
  const notifyMessage = {
    source: "host",
    port: portName,
    ext: extensionId,
    message: "Port created"
  };
  usePostMessage(notifyMessage, globalwindow.location.origin);
  return runtimePort;
}

function portForward({
  eventData,
  state,
  extensionId
}) {
  const portName = eventData.port;
  const { port, source, ...cleanEvent } = eventData;
  logger.debug("[portForward] Page -> Native:", portName, cleanEvent);
  const runtimePort = state.connectPorts[String(portName)];
  const isValidPort = typeof portName === "string" && runtimePort !== void 0 && typeof runtimePort === "object" && "postMessage" in runtimePort;
  if (isValidPort) {
    try {
      runtimePort.postMessage(cleanEvent);
    } catch (error) {
      logger.error("[portForward] Error sending message:", error);
      delete state.connectPorts[String(portName)];
      usePostMessage(
        {
          source: "host",
          port: portName,
          ext: extensionId,
          message: "Error",
          error: error instanceof Error ? error.message : "Port disconnected"
        },
        globalwindow.location.origin
      );
    }
    return;
  }
  logger.debug("[portForward] Invalid or disconnected port:", portName);
  usePostMessage(
    {
      source: "host",
      port: portName,
      ext: extensionId,
      message: "Error",
      error: "Invalid or disconnected port"
    },
    globalwindow.location.origin
  );
}

function triggerLookup(payload) {
  const { firebreathId, extensionId, browserRuntime } = payload;
  const url = String("assets/plugin.ts-q624DBEM.js");
  const resources = [url].map((resource) => browserRuntime.getURL(resource));
  logger.debug("[triggerLookup] Sending resources:", resources);
  usePostMessage(
    {
      source: "extension",
      status: "ready",
      firebreath: firebreathId,
      extensionId,
      resources
    },
    globalwindow.location.origin
  );
}
function triggerCreateOrForward(payload) {
  const { eventData } = payload;
  if ("request" in eventData && eventData.request === "Create port") {
    return createPort(payload);
  }
  if ("port" in eventData && ["number", "string"].includes(typeof eventData.port)) {
    portForward(payload);
  }
  return void 0;
}

function useListRest(...rest) {
  return rest.every((f) => {
    if (typeof f === "boolean") return f;
    if (f === null) return false;
    if (Array.isArray(f) && f.length > 0) return true;
    if (typeof f === "object" && Object.keys(f).length > 0) return true;
    return Boolean(f);
  });
}

function hasFirebreath(payload) {
  const { eventData, firebreathId } = payload;
  const isLookupRequest = useListRest(
    eventData,
    eventData.firebreath === firebreathId,
    eventData.request === "lookup"
  );
  if (isLookupRequest) {
    triggerLookup(payload);
  }
}
function hasSource(payload) {
  const { eventData, extensionId } = payload;
  const isValidSource = useListRest(
    eventData,
    eventData.source,
    eventData.source === "page",
    eventData.ext === extensionId
  );
  return isValidSource ? triggerCreateOrForward(payload) : void 0;
}

function useDetectKey(enterObject, search) {
  return Object.keys(enterObject).includes(search);
}

(() => {
  initBlitzExt();
  let api;
  try {
    api = shareDetectApi();
  } catch (error) {
    logger.error("[Content Script] API detection failed:", error);
    return;
  }
  logger.debug("[Content Script] api", `<${typeof api}>`, api);
  const hasRuntime = typeof api.runtime !== "undefined" && api.runtime !== null;
  const hasRuntimeId = hasRuntime && typeof api.runtime.id === "string" && api.runtime.id.length > 0;
  if (!hasRuntimeId) {
    logger.error("[Content Script] Chrome API not found or invalid!");
    return;
  }
  logger.debug("[Content Script] ✓ Extension ID:", api.runtime.id);
  const browserRuntime = api.runtime;
  const connectPorts = {};
  const extensionId = browserRuntime.id;
  const firebreathId = "Reaxoft";
  const state = {
    nextId: 0,
    connectPorts
  };
  const initialization = (event) => {
    const eventData = event.data;
    if (event.source !== globalwindow) {
      return;
    }
    if (event.origin !== globalwindow.location.origin) {
      logger.warn("[Content Script] Rejected message from untrusted origin:", event.origin);
      return;
    }
    if (useDetectKey(eventData, "firebreath")) {
      const payload = {
        browserRuntime,
        eventData,
        extensionId,
        firebreathId
      };
      hasFirebreath(payload);
    }
    if (useDetectKey(eventData, "source")) {
      const payload = {
        browserRuntime,
        state,
        // Передаём state вместо отдельных полей
        eventData,
        extensionId
      };
      hasSource(payload);
    }
  };
  globalwindow.addEventListener(
    "message",
    (event) => initialization(event),
    false
  );
  logger.info("[Content Script] ✓ Message listener attached");
})();
