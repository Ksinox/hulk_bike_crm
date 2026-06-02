function getDefaultDebugFlag() {
  return false;
}
function getBuildVersion() {
  return "2.3.0.3" ;
}
function getBuildDate() {
  return "2026-03-25T14:31:55.958Z" ;
}
function getRuntimeGlobal() {
  return globalThis;
}
function createBlitzExtConfig(debug = getDefaultDebugFlag()) {
  return {
    debug,
    version: getBuildVersion(),
    buildDate: getBuildDate()
  };
}
function initBlitzExt() {
  const runtimeGlobal = getRuntimeGlobal();
  const existingConfig = runtimeGlobal.BLITZ_EXT;
  const debug = typeof existingConfig?.debug === "boolean" ? existingConfig.debug : getDefaultDebugFlag();
  const nextConfig = createBlitzExtConfig(debug);
  runtimeGlobal.BLITZ_EXT = nextConfig;
  return nextConfig;
}
function getBlitzExtConfig() {
  return initBlitzExt();
}

export { getBlitzExtConfig as g, initBlitzExt as i };
