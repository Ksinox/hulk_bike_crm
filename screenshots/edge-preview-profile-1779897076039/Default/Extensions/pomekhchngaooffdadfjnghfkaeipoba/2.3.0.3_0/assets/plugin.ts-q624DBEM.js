(function (global = globalThis || window) {
  // 'use strict';
  global = global;
  globalThis = global;
  window = global;

  // src/blitz-ext.ts
  function getDefaultDebugFlag() {
    return false;
  }
  function getBuildVersion() {
    return "2.3.0.3" ;
  }
  function getBuildDate() {
    return "2026-03-25T14:31:56.865Z" ;
  }
  function getRuntimeGlobal() {
    return globalThis;
  }
  function createBlitzExtConfig(debug2 = getDefaultDebugFlag()) {
    return {
      debug: debug2,
      version: getBuildVersion(),
      buildDate: getBuildDate()
    };
  }
  function initBlitzExt() {
    const runtimeGlobal = getRuntimeGlobal();
    const existingConfig = runtimeGlobal.BLITZ_EXT;
    const debug2 = typeof existingConfig?.debug === "boolean" ? existingConfig.debug : getDefaultDebugFlag();
    const nextConfig = createBlitzExtConfig(debug2);
    runtimeGlobal.BLITZ_EXT = nextConfig;
    return nextConfig;
  }
  function getBlitzExtConfig() {
    return initBlitzExt();
  }

  // external/plugin/fireBreathPromise.ts
  (function() {
    const global2 = this;
    if (global2.FireBreathPromise) {
      return;
    }
    function isObject(obj) {
      const type = typeof obj;
      return type === "function" || type === "object" && !!obj;
    }
    const toString = Object.prototype.toString;
    let isFunction = function(obj) {
      return toString.call(obj) === "[object Function]";
    };
    if (typeof /./ !== "function") {
      isFunction = function(obj) {
        return typeof obj == "function" || false;
      };
    }
    function defer(fn, arg) {
      setTimeout(() => {
        fn(arg);
      }, 0);
    }
    const STATES = { PEND: 1, PROMISE: 2, RESOLVE: 3, REJECT: 4 };
    function DeferredObject(name) {
      const self2 = this;
      const fulfillHandlers = [];
      const rejectHandlers = [];
      let state = STATES.PEND;
      let value;
      self2.promise = {
        then(onFulfilled, onRejected) {
          const promise2 = new DeferredObject(`${name}-then`);
          function makeCallback(cbFunc, type) {
            return function handleCallback(value2) {
              try {
                if (isFunction(cbFunc)) {
                  const x = cbFunc(value2);
                  promise2.resolve(x);
                } else {
                  promise2[type](value2);
                }
              } catch (e) {
                promise2.reject(e);
              }
            };
          }
          if (state === STATES.RESOLVE) {
            defer(() => {
              makeCallback(onFulfilled, "resolve")(value);
            });
          } else if (state === STATES.REJECT) {
            defer(() => {
              makeCallback(onRejected, "reject")(value);
            });
          } else {
            fulfillHandlers.push(makeCallback(onFulfilled, "resolve"));
            rejectHandlers.push(makeCallback(onRejected, "reject"));
          }
          return promise2.promise;
        },
        name
      };
      function getThen(x) {
        try {
          return isObject(x) ? x.then : null;
        } catch (e) {
          self2.reject(e);
          return false;
        }
      }
      self2.resolve = function(x, force) {
        if (state === STATES.RESOLVE || state === STATES.REJECT) {
          return;
        } else if (x === self2 || x === self2.promise) {
          return self2.reject(new TypeError());
        } else if (state !== STATES.PEND && !force) {
          return;
        }
        const then = getThen(x);
        if (then === false) {
          return;
        }
        if (isFunction(then)) {
          let scope_settled = false;
          const resolve = function(x2) {
            if (scope_settled) {
              return;
            }
            scope_settled = true;
            self2.resolve(x2, true);
          };
          const reject = function(x2) {
            if (scope_settled) {
              return;
            }
            scope_settled = true;
            self2.reject(x2, true);
          };
          try {
            state = STATES.PROMISE;
            then.call(x, resolve, reject);
          } catch (e) {
            if (!scope_settled) {
              state = STATES.PEND;
              self2.reject(e);
            }
          }
        } else {
          value = x;
          state = STATES.RESOLVE;
          for (let i = 0; i < fulfillHandlers.length; ++i) {
            defer(fulfillHandlers[i], value);
          }
        }
      };
      self2.reject = function(x) {
        if (state === STATES.RESOLVE || state === STATES.REJECT) {
          return;
        } else if (x === self2 || x === self2.promise) {
          return self2.reject(new TypeError());
        }
        value = x;
        state = STATES.REJECT;
        for (let i = 0; i < rejectHandlers.length; ++i) {
          defer(rejectHandlers[i], value);
        }
      };
    }
    function makeDeferred(name) {
      return new DeferredObject(name);
    }
    global2.FireBreathPromise = makeDeferred;
  }).call(void 0);

  // external/plugin/firewyrm.ts
  ((function moduleLoader(currentModule, cachedModules, moduleNames) {
    const indexFunction = typeof globalThis.require === "function" && globalThis.require;
    function runModule(moduleName, isRequired = false) {
      if (typeof cachedModules[moduleName] !== "object") {
        if (typeof currentModule[moduleName] !== "object") {
          const requireFunction = typeof globalThis.require === "function" && globalThis.require;
          if (!isRequired && typeof requireFunction === "function") {
            return requireFunction(moduleName, true);
          }
          if (typeof indexFunction === "function") {
            return indexFunction(moduleName, true);
          }
          const error2 = new Error(" ");
          error2.message = `Cannot find module '${moduleName}'`;
          error2.code = "MODULE_NOT_FOUND";
          throw error2.code, error2;
        }
        const loadedModule = cachedModules[moduleName] = { exports: {} };
        currentModule[moduleName][0].call(
          loadedModule.exports,
          (requestedModule) => {
            const dependency = currentModule[moduleName][1][requestedModule];
            return runModule(dependency || requestedModule);
          },
          loadedModule,
          loadedModule.exports,
          moduleLoader,
          currentModule,
          cachedModules,
          moduleNames
        );
      }
      return cachedModules[moduleName].exports;
    }
    for (const moduleName of moduleNames) {
      runModule(moduleName);
    }
    return runModule;
  }))(
    {
      1: [
        function(require2, module, exports$1) {
          (function(chars) {
            exports$1.encode = function(arraybuffer) {
              const bytes = new Uint8Array(arraybuffer);
              let index;
              const length_ = bytes.length;
              let base64 = "";
              for (index = 0; index < length_; index += 3) {
                base64 += chars[bytes[index] >> 2];
                base64 += chars[(bytes[index] & 3) << 4 | bytes[index + 1] >> 4];
                base64 += chars[(bytes[index + 1] & 15) << 2 | bytes[index + 2] >> 6];
                base64 += chars[bytes[index + 2] & 63];
              }
              if (length_ % 3 === 2) {
                base64 = `${base64.slice(0, Math.max(0, base64.length - 1))}=`;
              } else if (length_ % 3 === 1) {
                base64 = `${base64.slice(0, Math.max(0, base64.length - 2))}==`;
              }
              return base64;
            };
            exports$1.decode = function(base64) {
              let bufferLength = base64.length * 0.75;
              const length_ = base64.length;
              let index;
              let p = 0;
              let encoded1;
              let encoded2;
              let encoded3;
              let encoded4;
              if (base64.at(-1) === "=") {
                bufferLength--;
                if (base64.at(-2) === "=") {
                  bufferLength--;
                }
              }
              const arraybuffer = new ArrayBuffer(bufferLength);
              const bytes = new Uint8Array(arraybuffer);
              for (index = 0; index < length_; index += 4) {
                encoded1 = chars.indexOf(base64[index]);
                encoded2 = chars.indexOf(base64[index + 1]);
                encoded3 = chars.indexOf(base64[index + 2]);
                encoded4 = chars.indexOf(base64[index + 3]);
                bytes[p += 1] = encoded1 << 2 | encoded2 >> 4;
                bytes[p += 1] = (encoded2 & 15) << 4 | encoded3 >> 2;
                bytes[p += 1] = (encoded3 & 3) << 6 | encoded4 & 63;
              }
              return arraybuffer;
            };
          })("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
        },
        {}
      ],
      2: [
        function(require2, module, exports$1) {
          (function() {
            if (this.FireBreathPromise) {
              return;
            }
            function isObject(object) {
              const type = typeof object;
              return type === "function" || type === "object" && !!object;
            }
            const { toString } = Object.prototype;
            let isFunction = function(object) {
              return toString.call(object) === "[object Function]";
            };
            if (typeof /./ !== "function") {
              isFunction = function(object) {
                return typeof object == "function" || false;
              };
            }
            function defer(function_, argument) {
              setTimeout(() => {
                function_(argument);
              }, 0);
            }
            const STATES = {
              PEND: 1,
              PROMISE: 2,
              RESOLVE: 3,
              REJECT: 4
            };
            function DeferredObject(name) {
              const self2 = this;
              const fulfillHandlers = [];
              const rejectHandlers = [];
              let state = STATES.PEND;
              let value;
              self2.promise = {
                then(onFulfilled, onRejected) {
                  const promise2 = new DeferredObject(`${name}-then`);
                  function makeCallback(callbackFunction, type) {
                    return function handleCallback(value2) {
                      try {
                        if (isFunction(callbackFunction)) {
                          const x = callbackFunction(value2);
                          promise2.resolve(x);
                        } else {
                          promise2[type](value2);
                        }
                      } catch (error2) {
                        promise2.reject(error2);
                      }
                    };
                  }
                  if (state === STATES.RESOLVE) {
                    defer(() => {
                      makeCallback(onFulfilled, "resolve")(value);
                    });
                  } else if (state === STATES.REJECT) {
                    defer(() => {
                      makeCallback(onRejected, "reject")(value);
                    });
                  } else {
                    fulfillHandlers.push(makeCallback(onFulfilled, "resolve"));
                    rejectHandlers.push(makeCallback(onRejected, "reject"));
                  }
                  return promise2.promise;
                },
                name
              };
              function getThen(x) {
                try {
                  return isObject(x) ? x.then : null;
                } catch (error2) {
                  self2.reject(error2);
                  return false;
                }
              }
              self2.resolve = function(x, force) {
                if (state === STATES.RESOLVE || state === STATES.REJECT) {
                  return;
                } else if (x === self2 || x === self2.promise) {
                  return self2.reject(new TypeError());
                } else if (state !== STATES.PEND && !force) {
                  return;
                }
                const then = getThen(x);
                if (then === false) {
                  return;
                }
                if (isFunction(then)) {
                  let scope_settled = false;
                  const resolve = function(x2) {
                    if (scope_settled) {
                      return;
                    }
                    scope_settled = true;
                    self2.resolve(x2, true);
                  };
                  const reject = function(x2) {
                    if (scope_settled) {
                      return;
                    }
                    scope_settled = true;
                    self2.reject(x2, true);
                  };
                  try {
                    state = STATES.PROMISE;
                    then.call(x, resolve, reject);
                  } catch (error2) {
                    if (!scope_settled) {
                      state = STATES.PEND;
                      self2.reject(error2);
                    }
                  }
                } else {
                  value = x;
                  state = STATES.RESOLVE;
                  for (const fulfillHandler of fulfillHandlers) {
                    defer(fulfillHandler, value);
                  }
                }
              };
              self2.reject = function(x) {
                if (state === STATES.RESOLVE || state === STATES.REJECT) {
                  return;
                } else if (x === self2 || x === self2.promise) {
                  return self2.reject(new TypeError());
                }
                value = x;
                state = STATES.REJECT;
                for (const rejectHandler of rejectHandlers) {
                  defer(rejectHandler, value);
                }
              };
            }
            function makeDeferred(name) {
              return new DeferredObject(name);
            }
            this.FireBreathPromise = makeDeferred;
          }).call(typeof module == "object" && module.exports ? module.exports : this);
        },
        {}
      ],
      3: [
        function(require2, module, exports$1) {
          (function(global2) {
            (function(globalScope) {
              const tools = require2("./tools");
              module.exports = function(parameters) {
                const browser = {};
                Object.defineProperties(browser, {
                  eval: {
                    value: evalFunction,
                    enumerable: true
                  },
                  getDocument: {
                    value: getDocument,
                    enumerable: true
                  },
                  getWindow: {
                    value: getWindow,
                    enumerable: true
                  },
                  invokeWithDelay: {
                    value: invokeWithDelay,
                    enumerable: true
                  },
                  readArray: {
                    value: readArray,
                    enumerable: true
                  },
                  readObject: {
                    value: readObject,
                    enumerable: true
                  }
                });
                return browser;
                function evalFunction(string_) {
                  try {
                    const function_ = new Function(`return ${string_}`);
                    return function_();
                  } catch (error2) {
                    const returnValue = {
                      $type: "error",
                      data: {
                        error: "exception thrown",
                        message: error2?.message
                      }
                    };
                    if (error2.stack) {
                      returnValue.stack = error2.stack;
                    }
                    return returnValue;
                  }
                }
                function invokeWithDelay(delay, object, rest, fname) {
                  const functionToCall = fname ? object?.[fname] : object;
                  if (!(tools.isNumber(delay) && tools.isFunction(functionToCall) && tools.isArray(rest))) {
                    return {
                      $type: "error",
                      data: {
                        error: "invalid parameters",
                        message: "Must provide at least delay (Number), obj (Function or Object), and args (Array)"
                      }
                    };
                  }
                  const releaseWyrmlings = tools.retainAllWyrmlings(rest);
                  setTimeout(() => {
                    functionToCall.apply(null, rest);
                    releaseWyrmlings();
                  }, delay);
                  return null;
                }
                function getDocument() {
                  return globalScope.document;
                }
                function getWindow() {
                  return globalScope.window;
                }
                function readArray(items) {
                  if (!items) {
                    return {
                      $type: "error",
                      data: {
                        error: "invalid object",
                        message: "The object does not exist"
                      }
                    };
                  }
                  if (!tools.isArray(items) && !(ArrayBuffer && ArrayBuffer.isView(items))) {
                    return {
                      $type: "error",
                      data: {
                        error: "invalid object",
                        message: "Object is not an array"
                      }
                    };
                  }
                  return {
                    $type: "one-level",
                    data: items
                  };
                }
                function readObject(object) {
                  if (!object) {
                    return {
                      $type: "error",
                      data: {
                        error: "invalid object",
                        message: "The object does not exist"
                      }
                    };
                  }
                  if (!tools.isObject(object)) {
                    return {
                      $type: "error",
                      data: {
                        error: "invalid object",
                        message: "Object is not a plain object"
                      }
                    };
                  }
                  return {
                    $type: "one-level",
                    data: object
                  };
                }
              };
            })(global2 === void 0 ? this : global2);
          }).call(this, globalThis);
        },
        { "./tools": 6 }
      ],
      4: [
        function(require2, module, exports$1) {
          (function(global2) {
            (function(globalScope) {
              const fbpromise = require2("fbpromise");
              const Deferred = globalScope?.FireBreathPromise || fbpromise.FireBreathPromise;
              module.exports = Deferred;
              Deferred.when = function(value) {
                const dfd = Deferred();
                dfd.resolve(value);
                return dfd.promise;
              };
              Deferred.reject = function(error2) {
                const dfd = Deferred();
                dfd.reject(error2);
                return dfd.promise;
              };
              Deferred.all = function(promises) {
                return Deferred.when(promises).then((promises2) => {
                  if (!(isArray(promises2) || isObject(promises2))) {
                    return promises2;
                  }
                  const resolved = isArray(promises2) ? [] : {};
                  let pendingCount = 0;
                  const dfd = Deferred();
                  for (const property in promises2) {
                    if (Object.hasOwn(promises2, property)) {
                      resolved[property] = void 0;
                      pendingCount++;
                      Deferred.all(promises2[property]).then(thenFunction(property), failFunction);
                    }
                  }
                  function thenFunction(property) {
                    return function(value) {
                      pendingCount--;
                      resolved[property] = value;
                      resolveIfDone();
                    };
                  }
                  function failFunction(error2) {
                    dfd.reject(error2);
                  }
                  function resolveIfDone() {
                    if (pendingCount === 0) {
                      dfd.resolve(resolved);
                    }
                  }
                  resolveIfDone();
                  return dfd.promise;
                });
              };
              function isArray(value) {
                return Array.isArray ? Array.isArray(value) : Object.prototype.toString.call(value) === "[object Array]";
              }
              function isObject(value) {
                return value && Object.prototype.toString.call(value) === "[object Object]";
              }
              Deferred.fn = function(object, method) {
                return function() {
                  const rest = Array.prototype.slice.call(arguments, 0);
                  const dfd = Deferred();
                  const callback = function(status, resp) {
                    if (status === "success") {
                      dfd.resolve(resp);
                    } else {
                      dfd.reject(resp);
                    }
                  };
                  rest.push(callback);
                  object[method].apply(object, rest);
                  return dfd.promise;
                };
              };
              Deferred.always = function(thennable, function_) {
                if (!(thennable?.then && function_)) {
                  return;
                }
                return thennable.then(
                  (success) => {
                    function_();
                    return success;
                  },
                  (error2) => {
                    function_();
                    return Deferred.reject(error2);
                  }
                );
              };
              return Deferred;
            })(global2 === void 0 ? this : global2);
          }).call(this, globalThis);
        },
        { fbpromise: 2 }
      ],
      5: [
        function(require2, module, exports$1) {
          (function(global2) {
            (function(globalScope) {
              const browser = require2("./browser");
              const Deferred = require2("./deferred");
              const tools = require2("./tools");
              FireWyrmJS.asVal = tools.asVal;
              module.exports = globalScope.FireWyrmJS = FireWyrmJS;
              function FireWyrmJS(wyrmhole) {
                const self2 = this;
                tools.defineProperties(self2, {
                  asVal: tools.asVal,
                  create,
                  registerObjectType: register,
                  wyrmhole
                });
                const supportedTypes = {};
                const baseWyrmlingStore = {};
                tools.addWyrmlingStore(baseWyrmlingStore, 0);
                wyrmhole.onMessage((msg, callback) => {
                  tools.handleMessage(wyrmhole, baseWyrmlingStore, supportedTypes, msg, callback);
                });
                function create(mimetype, rest) {
                  rest = rest || {};
                  const wyrmlingStore = baseWyrmlingStore[0];
                  const send = Deferred.fn(wyrmhole, "sendMessage");
                  return register("browser", browser).then(() => {
                    return send(["New", mimetype, rest]);
                  }).then((spawnId) => {
                    return tools.wrapAlienWyrmling(wyrmhole, wyrmlingStore, spawnId, 0);
                  }).then(
                    (queenling) => {
                      tools.defineProperties(queenling, {
                        destroy() {
                          return send(["Destroy", queenling.spawnId]);
                        }
                      });
                      return queenling;
                    },
                    (error2) => {
                      return Deferred.reject(error2);
                    }
                  );
                }
                function register(type, factoryFunction) {
                  return Deferred.when(factoryFunction).then((factory) => {
                    if (!type || typeof type !== "string") {
                      return Deferred.reject("Must provide a valid object type, e.g. application/myApp");
                    } else if (!tools.isFunction(factory)) {
                      return Deferred.reject("Must provide a function to invoke when a new instance is requested");
                    }
                    supportedTypes[type] = factory;
                  });
                }
              }
            })(global2 === void 0 ? this : global2);
          }).call(this, globalThis);
        },
        {
          "./browser": 3,
          "./deferred": 4,
          "./tools": 6
        }
      ],
      6: [
        function(require2, module, exports$1) {
          const base64 = require2("base64-arraybuffer");
          const Deferred = require2("./deferred");
          const validMessages = {
            New: true,
            Destroy: true,
            RelObj: true,
            Enum: true,
            DelP: true,
            GetP: true,
            SetP: true,
            Invoke: true
          };
          const LocalRelObjDelay = 1e3;
          const AutoReleaseWindow = 5e3;
          module.exports = {
            addWyrmlingStore,
            asVal: asValue,
            defineProperties,
            handleMessage,
            isArray,
            isFunction,
            isNumber,
            isObject,
            retainAllWyrmlings,
            wrapAlienWyrmling
          };
          function addWyrmlingStore(baseStore, spawnId, rootObject) {
            let nextId = 1;
            const newStore = {};
            Object.defineProperties(newStore, {
              baseStore: { value: baseStore },
              spawnId: { value: spawnId },
              destroy: {
                value() {
                  for (const objectId of Object.keys(newStore)) {
                    newStore.releaseObject(objectId);
                  }
                  delete baseStore[spawnId];
                }
              },
              getObject: {
                value(objectId) {
                  return newStore[objectId]?.[0];
                }
              },
              putObject: {
                value(object) {
                  const id = nextId++;
                  newStore[id] = [object];
                  return id;
                }
              },
              releaseObject: {
                value(objectId) {
                  const wyrmlingProperties = newStore.getWyrmlingProperties(objectId);
                  for (const property of Object.keys(wyrmlingProperties)) {
                    wyrmlingProperties[property].release();
                  }
                  clearInterval(wyrmlingProperties.__timer);
                  wyrmlingProperties.__timer = null;
                  delete newStore[objectId];
                }
              },
              setObjectProperty: {
                value(objectId, property, value) {
                  const object = newStore.getObject(objectId);
                  const wyrmlingProperties = newStore.getWyrmlingProperties(objectId);
                  if (wyrmlingProperties[property]) {
                    wyrmlingProperties[property].release();
                    delete wyrmlingProperties[property];
                  }
                  object[property] = value;
                  if (isWyrmling(value)) {
                    wyrmlingProperties[property] = value;
                    value.retain();
                  }
                  const wyrmPropertyKeys = Object.keys(wyrmlingProperties).length;
                  if (wyrmPropertyKeys === 0 && wyrmlingProperties.__timer) {
                    clearInterval(wyrmlingProperties.__timer);
                    wyrmlingProperties.__timer = null;
                  } else if (wyrmPropertyKeys && !wyrmlingProperties.__timer) {
                    wyrmlingProperties.__timer = setInterval(() => {
                      for (const property2 in wyrmlingProperties) {
                        if (Object.hasOwn(wyrmlingProperties, property2) && object[property2] !== wyrmlingProperties[property2]) {
                          newStore.setObjectProperty(objectId, property2, object[property2]);
                        }
                      }
                    }, AutoReleaseWindow);
                  }
                }
              },
              getWyrmlingProperties: {
                value(objectId) {
                  const items = newStore[objectId];
                  if (!isArray(items)) {
                    return {};
                  }
                  if (isObject(items[1])) {
                    return items[1];
                  }
                  const wyrmlingProperties = {};
                  Object.defineProperty(wyrmlingProperties, "__timer", {
                    value: null,
                    writable: true
                  });
                  items[1] = wyrmlingProperties;
                  return wyrmlingProperties;
                }
              }
            });
            Object.defineProperty(baseStore, spawnId, {
              value: newStore,
              configurable: true
            });
            if (rootObject !== void 0) {
              newStore[0] = [rootObject];
            }
            return newStore;
          }
          function asValue(object) {
            if (isPrimitive(object)) {
              return object;
            }
            if (object instanceof ArrayBuffer) {
              return {
                $type: "binary",
                data: base64.encode(object)
              };
            }
            return {
              $type: "json",
              data: object
            };
          }
          function defineProperties(object, props) {
            for (const property in props) {
              if (Object.hasOwn(props, property)) {
                Object.defineProperty(object, property, { value: props[property] });
              }
            }
          }
          function wrapAlienWyrmling(wyrmhole, wyrmlingStore, spawnId, objectId) {
            let referenceCount = 0;
            let released = false;
            const releasedFailure = Deferred.reject({
              error: "invalid object",
              message: "The object has been released"
            });
            const send = function(rest) {
              wyrmling.retain();
              const dfd = Deferred();
              const callback = function(status, resp) {
                if (status === "success") {
                  dfd.resolve(resp);
                } else {
                  dfd.reject(resp);
                }
                wyrmling.release();
              };
              wyrmhole.sendMessage(rest, callback);
              return dfd.promise;
            };
            var wyrmling = function() {
              const rest = [""].concat(Array.prototype.slice.call(arguments, 0));
              return wyrmling.invoke.apply(wyrmling, rest);
            };
            defineProperties(wyrmling, {
              spawnId,
              objectId,
              getProperty(property) {
                let propertyValue;
                const getPromise = released ? releasedFailure : send(["GetP", spawnId, objectId, property]).then((value) => {
                  return prepInboundValue(wyrmhole, wyrmlingStore, value);
                }).then((value) => {
                  propertyValue = value;
                  return value;
                });
                function magicalFunction() {
                  const rest = Array.prototype.slice.call(arguments, 0);
                  return getPromise.then(() => {
                    if (isWyrmling(propertyValue)) {
                      propertyValue.retain();
                      const invokePromise = propertyValue.apply(null, rest);
                      Deferred.always(invokePromise, () => {
                        propertyValue.release();
                      });
                      return invokePromise;
                    } else {
                      return Deferred.reject({
                        error: "could not invoke",
                        message: "The object is not invokable"
                      });
                    }
                  });
                }
                magicalFunction.then = getPromise.then;
                return magicalFunction;
              },
              setProperty(property, value) {
                if (released) {
                  return releasedFailure;
                }
                return prepOutboundValue(wyrmlingStore, value).then((v) => {
                  return send(["SetP", spawnId, objectId, property, v]);
                });
              },
              invoke(property) {
                if (released) {
                  return releasedFailure;
                }
                const rest = Array.prototype.slice.call(arguments, 1);
                return prepOutboundArguments(wyrmlingStore, rest).then((rest_) => {
                  return send(["Invoke", spawnId, objectId, property, rest_]);
                }).then((value) => {
                  return prepInboundValue(wyrmhole, wyrmlingStore, value);
                });
              },
              retain() {
                referenceCount++;
              },
              release() {
                if (referenceCount > 0) {
                  referenceCount--;
                }
                if (objectId === 0) {
                  return;
                }
                setTimeout(() => {
                  if (!referenceCount && !released) {
                    send(["RelObj", spawnId, objectId]);
                    released = true;
                  }
                }, 5e3);
              }
            });
            return send(["Enum", spawnId, objectId]).then((props) => {
              for (const property of props) {
                try {
                  createProperty(wyrmling, property);
                } catch {
                }
              }
              return wyrmling;
            });
          }
          function createProperty(wyrmling, property) {
            Object.defineProperty(wyrmling, property, {
              enumerable: true,
              configurable: false,
              // don't allow it to be deleted (it isn't ours)
              get() {
                return wyrmling.getProperty(property);
              },
              set(value) {
                return wyrmling.setProperty(property, value);
              }
            });
          }
          function prepOutboundValue(wyrmlingStore, value) {
            return Deferred.when(value).then((v) => {
              if (isPrimitive(v) || v.$type === "json" || v.$type === "binary" || v.$type === "error") {
                return v;
              }
              if (v.$type === "one-level") {
                for (const property in v.data) {
                  if (Object.hasOwn(v.data, property)) {
                    v.data[property] = prepOutboundValue(wyrmlingStore, v.data[property]);
                  }
                }
                return Deferred.all(v.data);
              }
              const objectId = wyrmlingStore.putObject(v);
              return {
                $type: "ref",
                data: [wyrmlingStore.spawnId, objectId]
              };
            });
          }
          function prepOutboundArguments(wyrmlingStore, rest) {
            return Deferred.when(rest).then((rargs) => {
              if (!isArray(rargs) || rargs.length === 0) {
                return [];
              }
              const toResolve = rest.map((value) => {
                return prepOutboundValue(wyrmlingStore, value).then((v) => {
                  return v;
                });
              });
              return Deferred.all(toResolve);
            });
          }
          function prepInboundValue(wyrmhole, wyrmlingStore, value) {
            return Deferred.when(value).then(() => {
              if (isPrimitive(value)) {
                return value;
              }
              if (value.$type === "local-ref") {
                const store = wyrmlingStore.baseStore;
                if (store[value.data[0]] && value.data[1] in store[value.data[0]]) {
                  return store[value.data[0]].getObject(value.data[1]);
                }
                return void 0;
              }
              if (value.$type === "ref") {
                return wrapAlienWyrmling(wyrmhole, wyrmlingStore, value.data[0], value.data[1]);
              }
              if (value.$type === "json") {
                return value.data;
              }
              if (value.$type === "binary") {
                return base64.decode(value.data);
              }
              const wyrmlings = [];
              function retainIfWyrmling(v) {
                if (isWyrmling(v)) {
                  v.retain();
                  wyrmlings.push(v);
                }
                return v;
              }
              for (const property in value) {
                if (Object.hasOwn(value, property)) {
                  value[property] = prepInboundValue(wyrmhole, wyrmlingStore, value[property]).then(retainIfWyrmling);
                }
              }
              const allFinishedPromise = Deferred.all(value);
              Deferred.always(allFinishedPromise, () => {
                for (const ling of wyrmlings) {
                  ling.release();
                }
              });
              return allFinishedPromise;
            });
          }
          function isValidMessage(msg) {
            if (!isArray(msg) || !validMessages[msg[0]]) {
              return false;
            }
            switch (msg[0]) {
              case "Destroy": {
                return msg.length === 2 && isNumber(msg[1]);
              }
              case "New": {
                return msg.length === 3 && msg[1] && isString(msg[1]);
              }
              case "Enum":
              case "RelObj": {
                return msg.length === 3 && isNumber(msg[1]) && isNumber(msg[2]);
              }
              case "DelP":
              case "GetP": {
                return msg.length === 4 && isNumber(msg[1]) && isNumber(msg[2]) && isString(msg[3]);
              }
              case "SetP": {
                return msg.length === 5 && isNumber(msg[1]) && isNumber(msg[2]) && isString(msg[3]);
              }
              case "Invoke": {
                return msg.length === 5 && isNumber(msg[1]) && isNumber(msg[2]) && isString(msg[3]) && isArray(msg[4]);
              }
            }
          }
          function getWyrmlingStoreForMessage(baseWyrmlingStore, msg) {
            return msg[1] in baseWyrmlingStore ? baseWyrmlingStore[msg[1]] : {};
          }
          function getObject(wyrmlingStore, msg) {
            return msg[2] in wyrmlingStore ? wyrmlingStore.getObject(msg[2]) : null;
          }
          function handleMessage(wyrmhole, baseWyrmlingStore, supportedTypes, msg, callback) {
            if (!isValidMessage(msg)) {
              return callback("error", {
                error: "invalid message",
                message: "Message was malformed"
              });
            }
            if (msg[0] === "New") {
              return handleNew(baseWyrmlingStore, supportedTypes, msg, callback);
            } else if (msg[0] === "Destroy") {
              return handleDestroy(baseWyrmlingStore, supportedTypes, msg, callback);
            }
            const store = getWyrmlingStoreForMessage(baseWyrmlingStore, msg);
            const object = getObject(store, msg);
            if (object === null) {
              return callback("error", {
                error: "invalid object",
                message: "The object does not exist"
              });
            }
            switch (msg[0]) {
              case "Enum": {
                return handleEnum(object, callback);
              }
              case "DelP": {
                return handleDelP(store, object, msg[3], callback);
              }
              case "GetP": {
                return handleGetP(store, object, msg[3], callback);
              }
              case "SetP": {
                return handleSetP(wyrmhole, store, object, msg[2], msg[3], msg[4], callback);
              }
              case "RelObj": {
                handleRelObj(store, msg[2], callback);
                return;
              }
              case "Invoke": {
                return handleInvoke(wyrmhole, store, object, msg[3], msg[4], callback);
              }
            }
          }
          function handleNew(baseWyrmlingStore, supportedTypes, msg, callback) {
            if (!(msg[1] in supportedTypes)) {
              return callback("error", {
                error: "invalid object type",
                message: `Object type ${msg[1]} is not supported`
              });
            }
            try {
              const princessling = supportedTypes[msg[1]](msg[2] || {});
              baseWyrmlingStore.nextId = baseWyrmlingStore.nextId || 1;
              const spawnId = baseWyrmlingStore.nextId++;
              addWyrmlingStore(baseWyrmlingStore, spawnId, princessling);
              callback("success", spawnId);
            } catch (error2) {
              callback("error", {
                error: "could not create object",
                message: error2?.message || "There was an unidentified error creating the object"
              });
            }
          }
          function handleDestroy(baseWyrmlingStore, supportedTypes, msg, callback) {
            const spawnId = msg[1];
            if (!baseWyrmlingStore[spawnId]?.getObject(0)) {
              return callback("error", {
                error: "could not destroy object",
                message: "The object does not exist"
              });
            }
            try {
              const princessling = baseWyrmlingStore[spawnId].getObject(0);
              baseWyrmlingStore[spawnId].destroy();
              if (isFunction(princessling._onDestroy)) {
                princessling._onDestroy();
              }
              callback("success", spawnId);
            } catch (error2) {
              callback("error", {
                error: "could not destroy object",
                message: error2?.message || "There was an unidentified error creating the object"
              });
            }
          }
          function handleEnum(object, callback) {
            const props = [];
            for (const property in object) {
              if (Object.hasOwn(object, property) && !property.startsWith("_")) {
                props.push(property);
              }
            }
            if (isArray(object) || isFunction(object)) {
              props.push("length");
            }
            return callback("success", props);
          }
          function handleDelP(wyrmlingStore, object, property, callback) {
            if (!Object.hasOwn(object, property)) {
              return callback("error", {
                error: "could not delete property",
                message: "Property does not exist on this object"
              });
            }
            try {
              delete object[property];
              callback("success", null);
            } catch (error2) {
              callback("error", {
                error: "could not delete property",
                message: error2?.message || "There was an unidentified error deleting the property"
              });
            }
          }
          function handleGetP(wyrmlingStore, object, property, callback) {
            if (!Object.hasOwn(object, property) && !(property === "length" && (isArray(object) || isFunction(object)))) {
              return callback("error", {
                error: "could not get property",
                message: "Property does not exist on this object"
              });
            }
            prepOutboundValue(wyrmlingStore, object[property]).then((value) => {
              callback("success", value);
            });
          }
          function handleSetP(wyrmhole, wyrmlingStore, object, objectId, property, value, callback) {
            if (!Object.hasOwn(object, property)) {
              return callback("error", {
                error: "could not set property",
                message: "Property does not exist on this object"
              });
            }
            prepInboundValue(wyrmhole, wyrmlingStore, value).then(
              (v) => {
                try {
                  wyrmlingStore.setObjectProperty(objectId, property, v);
                  callback("success", null);
                } catch (error2) {
                  callback("error", {
                    error: "could not set property",
                    message: error2?.message || "There was an unidentified error deleting the property"
                  });
                }
              },
              (error2) => {
                callback("error", {
                  error: "could not set property",
                  message: error2 || "There was an unidentified error setting the property"
                });
              }
            );
          }
          function handleRelObj(wyrmlingStore, objectId, callback) {
            if (objectId === 0) {
              return;
            }
            callback("success", null);
            setTimeout(() => {
              wyrmlingStore.releaseObject(objectId);
            }, LocalRelObjDelay);
          }
          function handleInvoke(wyrmhole, wyrmlingStore, object, property, rest, callback) {
            let returnValue;
            const promises = [];
            if (property) {
              if (!Object.hasOwn(object, property)) {
                return callback("error", {
                  error: "could not invoke property",
                  message: "Property does not exist on this object"
                });
              } else if (!isFunction(object[property])) {
                return callback("error", {
                  error: "could not invoke property",
                  message: "Property is not callable"
                });
              }
              for (const argument of rest) {
                promises.push(prepInboundValue(wyrmhole, wyrmlingStore, argument));
              }
              returnValue = Deferred.all(promises).then((rest_) => {
                return object[property].apply(object, rest_);
              });
            } else {
              if (!isFunction(object)) {
                return callback("error", {
                  error: "could not invoke object",
                  message: "Object is not callable"
                });
              }
              for (const argument of rest) {
                promises.push(prepInboundValue(wyrmhole, wyrmlingStore, argument));
              }
              returnValue = Deferred.all(promises).then((rest_) => {
                return object.apply(null, rest_);
              });
            }
            return Deferred.when(returnValue).then(
              (value) => {
                return prepOutboundValue(wyrmlingStore, value).then((v) => {
                  if (v && v.$type === "error") {
                    return callback("error", v.data);
                  }
                  return callback("success", v);
                });
              },
              (error2) => {
                const type = property ? "property" : "object";
                return callback("error", {
                  error: `could not invoke ${type}`,
                  message: error2 || `There was an unidentified error calling the ${type}`
                });
              }
            );
          }
          function findWyrmlings(thing) {
            let wyrmlings = [];
            if (isWyrmling(thing)) {
              return [thing];
            } else if (isArray(thing) || isObject(thing)) {
              for (const property in thing) {
                if (Object.hasOwn(thing, property)) {
                  wyrmlings = wyrmlings.concat(findWyrmlings(thing[property]));
                }
              }
            }
            return wyrmlings;
          }
          function retainAllWyrmlings(thing) {
            const wyrmlings = findWyrmlings(thing);
            for (const ling of wyrmlings) {
              ling.retain();
            }
            return function() {
              for (const ling of wyrmlings) {
                ling.release();
              }
            };
          }
          function isPrimitive(value) {
            if (value === null) {
              return true;
            }
            switch (typeof value) {
              case "object":
              case "function":
              case "symbol": {
                return false;
              }
              default: {
                return true;
              }
            }
          }
          const nativeIsArray = Array.isArray;
          function isArray(object) {
            return nativeIsArray ? Array.isArray(object) : Object.prototype.toString.call(object) === "[object Array]";
          }
          const optimizeIsFunction = typeof /./ !== "function" && typeof Int8Array !== "object";
          function isFunction(object) {
            return optimizeIsFunction ? typeof object === "function" || false : Object.prototype.toString.call(object) === "[object Function]";
          }
          function isNumber(value) {
            return Object.prototype.toString.call(value) === "[object Number]" && !isNaN(value);
          }
          function isObject(value) {
            return value && Object.prototype.toString.call(value) === "[object Object]";
          }
          function isString(value) {
            return typeof value === "string";
          }
          function isWyrmling(value) {
            return isFunction(value) && Object.hasOwn(value, "spawnId") && Object.hasOwn(value, "objectId") && Object.hasOwn(value, "getProperty") && Object.hasOwn(value, "setProperty") && Object.hasOwn(value, "invoke");
          }
        },
        {
          "./deferred": 4,
          "base64-arraybuffer": 1
        }
      ]
    },
    {},
    [5]
  );

  // src/logger.ts
  var DEFAULT_LOG_LEVEL = "error";
  var LOG_LEVEL_WEIGHT = {
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
  var logger = {
    getLevel,
    debug,
    info,
    warn,
    error
  };

  // src/sharedCode.ts
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
  var globalwindow = getGlobal();
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

  // external/plugin/wyrmhole.ts
  var COMMAND_EXCEPTION = "command exception";
  var CREATE_COMMAND = "create";
  var DEFAULT_NATIVE_HOST = "ru.reaxoft.firewyrmhost";
  var DESTROY_COMMAND = "destroy";
  var HOST_DISCONNECTED = "Host disconnected";
  var JAVASCRIPT_EXCEPTION = "Javascript Exception";
  var LIST_COMMAND = "list";
  var LOAD_ERROR_MESSAGE = "Error";
  var RESPONSE_TYPE = "resp";
  function getVendorRuntime() {
    return globalThis;
  }
  function createDeferred() {
    const runtime = getVendorRuntime();
    if (typeof runtime.FireBreathPromise === "function") {
      return runtime.FireBreathPromise();
    }
    throw new Error("FireBreathPromise is not available");
  }
  function getFirebreathRoot() {
    const root = getVendorRuntime().firebreath;
    return typeof root === "undefined" ? globalThis : root;
  }
  function isChunkedHostMessage(message) {
    return typeof message.msg === "string" && typeof message.c === "number" && typeof message.n === "number" && (typeof message.cmdId === "number" || typeof message.cmdId === "string");
  }
  function isDisconnectHostMessage(message) {
    return message.disconnect === true;
  }
  function isListHostMessage(message) {
    return "list" in message;
  }
  function isLoadErrorHostMessage(message) {
    return message.message === LOAD_ERROR_MESSAGE;
  }
  function stringifyError(error2) {
    return error2 instanceof Error ? error2.toString() : String(error2);
  }
  function createRejectedPromise(reason) {
    const deferred = createDeferred();
    deferred.reject(reason);
    return deferred.promise;
  }
  function connectWyrmhole(application) {
    const api = shareDetectApi();
    const deferred = createDeferred();
    const nativeHost = typeof application === "string" && application !== "" ? application : DEFAULT_NATIVE_HOST;
    const port = api.runtime.connectNative(nativeHost);
    deferred.resolve({
      port,
      sink(sink) {
        port.onMessage.addListener((message) => {
          sink(message);
        });
        port.onDisconnect.addListener(() => {
          sink({ disconnect: true });
        });
      }
    });
    return deferred.promise;
  }
  function messageWyrmhole(message) {
    this.postMessage(message);
  }
  function isUnknownArray(value) {
    return Array.isArray(value);
  }
  var wyrmholeApi;
  var Wyrmhole = class {
    constructor(transport, sink, api) {
      this.transport = transport;
      this.api = api;
      sink((message) => this.handleIncomingMessage(message));
    }
    commandMap = {};
    inMessages = {};
    listDeferreds = [];
    destroyed = false;
    disconnectReason;
    loadDeferred = null;
    loaded = false;
    nextCommandId = 1;
    onCommandHandler = null;
    onDisconnectHandler = null;
    handleIncomingMessage(message) {
      if ("plugin" in message && this.loadDeferred && !this.loaded) {
        this.loaded = true;
        this.loadDeferred.resolve(this);
        return;
      }
      if (message.status === "error" && this.loadDeferred && !this.loaded) {
        this.loadDeferred.reject(new Error(String(message.message)));
        this.loadDeferred = null;
        return;
      }
      if (isLoadErrorHostMessage(message) && this.loadDeferred && !this.loaded) {
        this.loadDeferred.reject(new Error(message.error));
        this.loadDeferred = null;
        return;
      }
      if (isListHostMessage(message)) {
        const listDeferred = this.listDeferreds.pop();
        if (listDeferred) {
          listDeferred.resolve(message);
        }
        return;
      }
      if (isDisconnectHostMessage(message)) {
        const disconnectReason = typeof message.message === "string" && message.message !== "" ? message.message : HOST_DISCONNECTED;
        this.handleDisconnect(disconnectReason);
        return;
      }
      if (isChunkedHostMessage(message)) {
        this.handleChunkedMessage(message);
      }
    }
    handleDisconnect(reason) {
      this.disconnectReason = reason;
      if (this.loadDeferred) {
        this.loadDeferred.reject(this.disconnectReason);
      }
      for (const commandId of Object.keys(this.commandMap)) {
        this.commandMap[commandId].reject(this.disconnectReason);
      }
      for (const deferred of this.listDeferreds) {
        deferred.reject(this.disconnectReason);
      }
      this.destroyed = true;
      if (this.onDisconnectHandler) {
        this.onDisconnectHandler(this.disconnectReason);
      }
    }
    handleChunkedMessage(message) {
      const commandId = String(message.cmdId);
      if (typeof this.inMessages[commandId] === "undefined") {
        this.inMessages[commandId] = {
          parts: Array.from({ length: message.c }).fill(""),
          count: 0
        };
      }
      const pendingMessage = this.inMessages[commandId];
      pendingMessage.parts[message.n - 1] = message.msg;
      pendingMessage.count += 1;
      if (pendingMessage.count >= message.c) {
        this.processCompleteMessage(message, pendingMessage.parts.join(""));
      }
    }
    processCompleteMessage(message, text) {
      if (message.type === RESPONSE_TYPE) {
        const deferred2 = this.commandMap[String(message.cmdId)];
        if (typeof deferred2 === "undefined") {
          throw new TypeError("Invalid msg id!");
        }
        try {
          deferred2.resolve(JSON.parse(text));
        } catch (error2) {
          deferred2.reject(error2);
        }
        return;
      }
      if (!this.onCommandHandler) {
        return;
      }
      const deferred = createDeferred();
      let promise = null;
      try {
        this.onCommandHandler(JSON.parse(text), (...callbackArgs) => {
          if (callbackArgs[0] === "success") {
            deferred.resolve(callbackArgs);
          } else {
            deferred.reject(callbackArgs[1]);
          }
        });
        promise = deferred.promise;
      } catch (error2) {
        this.command([
          "error",
          {
            error: COMMAND_EXCEPTION,
            message: stringifyError(error2)
          }
        ], Number(message.cmdId));
      }
      if (!promise) {
        return;
      }
      promise.then(
        (response) => this.command(response, Number(message.cmdId)),
        (error2) => this.command([
          "error",
          {
            error: JAVASCRIPT_EXCEPTION,
            message: stringifyError(error2)
          }
        ], Number(message.cmdId))
      );
    }
    message(message) {
      this.api.message.call(this.transport, message);
    }
    command(message, cmdId) {
      let commandId = cmdId;
      let type = "resp";
      if (typeof commandId === "undefined") {
        commandId = this.nextCommandId;
        this.nextCommandId += 1;
        type = "cmd";
      }
      this.message({
        cmdId: commandId,
        type,
        c: 1,
        n: 1,
        colonyId: 0,
        msg: JSON.stringify(message)
      });
      return commandId;
    }
    sendMessage(message, callback) {
      const deferred = createDeferred();
      if (this.destroyed) {
        callback?.(new Error("Wyrmhole not active"));
        return;
      }
      const commandId = this.command(message);
      this.commandMap[String(commandId)] = deferred;
      deferred.promise.then(
        (response) => {
          if (callback) {
            const callbackArgs = isUnknownArray(response) ? response : [response];
            callback(...callbackArgs);
          } else {
            logger.debug("[Wyrmhole] No callback for", response);
          }
        },
        (error2) => {
          if (callback) {
            callback("error", error2);
          } else {
            logger.debug("[Wyrmhole] No callback for error:", error2);
          }
        }
      );
    }
    onDisconnect(handler) {
      this.onDisconnectHandler = handler;
    }
    onMessage(handler) {
      this.onCommandHandler = handler;
    }
    loadPlugin(mimetype) {
      if (this.loadDeferred) {
        throw new Error("Plugin already loaded (or loading)");
      }
      this.loadDeferred = createDeferred();
      this.message({
        cmd: CREATE_COMMAND,
        mimetype
      });
      return this.loadDeferred.promise;
    }
    destroy() {
      if (this.destroyed) {
        return;
      }
      this.message({ cmd: DESTROY_COMMAND });
      this.destroyed = true;
    }
    listPlugins() {
      const deferred = createDeferred();
      if (this.destroyed) {
        deferred.reject(new Error("Wyrmhole not active"));
        return deferred.promise;
      }
      this.listDeferreds.unshift(deferred);
      this.message({ cmd: LIST_COMMAND });
      setTimeout(() => {
        deferred.reject(new Error("Timout talking to Wyrmhole"));
      }, 2e3);
      return deferred.promise.then((response) => response.status === "success" ? response.list : createRejectedPromise(response.error));
    }
  };
  function createWyrmhole(application, mimetype, host) {
    const deferred = createDeferred();
    let targetApplication = application;
    let targetMimetype = mimetype;
    if (typeof targetMimetype !== "string" || targetMimetype === "") {
      targetMimetype = targetApplication;
      targetApplication = void 0;
    }
    wyrmholeApi.connect(targetApplication, host).then((response) => {
      const wyrmhole = new Wyrmhole(response.port, response.sink, wyrmholeApi);
      wyrmholeApi.instances.push(wyrmhole);
      if (typeof targetMimetype === "string") {
        wyrmhole.loadPlugin(targetMimetype).then(
          (result) => deferred.resolve(result),
          (error2) => deferred.reject(error2)
        );
        return;
      }
      deferred.resolve(wyrmhole);
    });
    return deferred.promise;
  }
  var firebreathRoot = getFirebreathRoot();
  wyrmholeApi = {
    instances: [],
    create: createWyrmhole,
    connect: connectWyrmhole,
    message: messageWyrmhole,
    destroy() {
    }
  };
  firebreathRoot.wyrmhole = wyrmholeApi;

  // external/plugin/wyrmhole-page.ts
  var ANY_ORIGIN = "*";
  var CREATE_PORT_REQUEST = "Create port";
  var DISCONNECTED_MESSAGE = "Disconnected";
  var HOST_SOURCE = "host";
  var PAGE_SOURCE = "page";
  var PORT_CREATED_MESSAGE = "Port created";
  var connectMap = {};
  var ports = {};
  function getVendorRuntime2() {
    return globalThis;
  }
  function createDeferred2() {
    const runtime = getVendorRuntime2();
    if (typeof runtime.FireBreathPromise === "function") {
      return runtime.FireBreathPromise();
    }
    throw new Error("FireBreathPromise is not available");
  }
  function getFirebreathRoot2() {
    const root = getVendorRuntime2().firebreath;
    return typeof root !== "undefined" ? root : window;
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function isHostPortMessage(value) {
    return isRecord(value) && value.source === HOST_SOURCE && typeof value.ext === "string" && typeof value.port === "string";
  }
  function isPortCreatedMessage(value) {
    return isHostPortMessage(value) && value.message === PORT_CREATED_MESSAGE;
  }
  function emitPageMessage(message) {
    window.postMessage(message, ANY_ORIGIN);
  }
  function bindWithPort(data) {
    const deferred = connectMap[data.ext];
    if (typeof deferred === "undefined") {
      return;
    }
    delete connectMap[data.ext];
    deferred.resolve({
      port: {
        port: data.port,
        extId: data.ext
      },
      sink(listener) {
        ports[data.port] = (message) => {
          if (isHostPortMessage(message) && message.message === DISCONNECTED_MESSAGE) {
            listener({ disconnect: true });
            return;
          }
          listener(message);
        };
      }
    });
  }
  function onMessage(event) {
    if (event.source !== window) {
      return;
    }
    if (!isHostPortMessage(event.data)) {
      return;
    }
    if (isPortCreatedMessage(event.data)) {
      bindWithPort(event.data);
      return;
    }
    const portName = event.data.port;
    const listener = ports[portName];
    if (typeof listener === "undefined") {
      logger.debug("[WyrmholePage] Invalid port");
      return;
    }
    listener(event.data);
  }
  function destroyHelper() {
    Object.values(ports).forEach((listener) => {
      listener({ disconnect: true });
    });
    window.removeEventListener("message", onMessage);
  }
  var firebreathRoot2 = getFirebreathRoot2();
  firebreathRoot2.wyrmhole ??= {};
  window.addEventListener("message", onMessage, false);
  firebreathRoot2.wyrmhole.connect = function(extensionId, host) {
    const deferred = createDeferred2();
    connectMap[extensionId] = deferred;
    emitPageMessage({
      source: PAGE_SOURCE,
      ext: extensionId,
      request: CREATE_PORT_REQUEST,
      host
    });
    return deferred.promise;
  };
  firebreathRoot2.wyrmhole.message = function(message) {
    message.source = PAGE_SOURCE;
    message.port = this.port;
    message.ext = this.extId;
    emitPageMessage(message);
  };
  firebreathRoot2.wyrmhole.destroy = destroyHelper;

  // external/plugin.ts
  initBlitzExt();

})();
