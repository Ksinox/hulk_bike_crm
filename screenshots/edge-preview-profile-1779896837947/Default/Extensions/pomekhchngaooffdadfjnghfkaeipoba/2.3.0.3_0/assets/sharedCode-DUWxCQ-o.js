import { g as getBlitzExtConfig } from './blitz-ext-De4c8IqC.js';

const DEFAULT_LOG_LEVEL = "error";
const LOG_LEVEL_WEIGHT = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
};
function resolveLevel() {
  const blitzExtConfig = getBlitzExtConfig();
  const runtimeDebugFlag = typeof blitzExtConfig.debug === "boolean" ? blitzExtConfig.debug : void 0;
  if (runtimeDebugFlag === true) {
    return "debug";
  }
  if (runtimeDebugFlag === false) {
    return "error";
  }
  return DEFAULT_LOG_LEVEL;
}
function shouldLog(level) {
  const effectiveLevel = resolveLevel();
  if (effectiveLevel === "silent") {
    return false;
  }
  return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[effectiveLevel];
}
function log(level, message, optionalParams = []) {
  if (!shouldLog(level)) {
    return;
  }
  switch (level) {
    case "debug":
      console.debug(message, ...optionalParams);
      break;
    case "info":
      console.info(message, ...optionalParams);
      break;
    case "warn":
      console.warn(message, ...optionalParams);
      break;
    case "error":
      console.error(message, ...optionalParams);
      break;
  }
}
function getLevel() {
  return resolveLevel();
}
function debug(message, ...optionalParams) {
  log("debug", message, optionalParams);
}
function info(message, ...optionalParams) {
  log("info", message, optionalParams);
}
function warn(message, ...optionalParams) {
  log("warn", message, optionalParams);
}
function error(message, ...optionalParams) {
  log("error", message, optionalParams);
}
const logger = {
  getLevel,
  debug,
  info,
  warn,
  error
};

function getGlobal() {
  if (typeof self !== "undefined") {
    return self;
  }
  if (typeof window !== "undefined") {
    return window;
  }
  if (typeof global !== "undefined") {
    return global;
  }
  if (typeof globalThis !== "undefined") {
    return globalThis;
  }
  throw new Error("unable to locate global object");
}
const globalwindow = getGlobal();
function shareDetectApi() {
  const errorMessage = "extension API not found. Both `chrome` and `browser` are undefined.";
  if ("browser" in globalwindow && typeof globalwindow.browser !== "undefined") {
    return globalwindow.browser;
  }
  if ("chrome" in globalwindow && typeof globalwindow.chrome !== "undefined") {
    return globalwindow.chrome;
  }
  throw new Error(errorMessage);
}
const EnumReason = {
  INSTALL: "install",
  UPDATE: "update"};

export { EnumReason as E, globalwindow as g, logger as l, shareDetectApi as s };
