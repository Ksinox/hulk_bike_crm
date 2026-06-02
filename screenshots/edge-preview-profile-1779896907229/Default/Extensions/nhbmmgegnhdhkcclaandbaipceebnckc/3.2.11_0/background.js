
// --------------------------------- Общий код ---------------------------------

var manifest = chrome.runtime.getManifest(),
	info = {
		id: chrome.runtime.id,
		state: 1,
		type: "chrome",
		version: manifest.version
	};

function Extensions() {
	var that = this;

	this.olds = {
		diag: {
			enabled: false
		},
		plugin: {
			enabled: false
		}
	};

	function checkOldExtension(ext) {
		var oldDiags = {
				"inlmamahcfioibldbpbaechbpeeaelin": true,
				"pioommjcfaefbcpbdokfoadjhlmahjjm": true,
				"adipnhhjfmoehhkepljbifddkobenooa": true,
				"fmdmnjcgegbabdefddkijefeadkhchcn": true,
				"diag.helper@skbkontur.ru": true
			},
			oldPlugins = {
				"hnhppcgejeffnbnioloohhmndpmclaga": true,
				"nejicfcnfnecdilmajlppdcgbjilgeec": true,
				"akpjpngckapnibajopggmfhnchfpnkkf": true,
				"kontur.toolbox@gmail.com": true
			};

		if (oldDiags[ext.id]) {
			that.olds.diag.enabled = ext.enabled;
		} else if (oldPlugins[ext.id]) {
			that.olds.plugin.enabled = ext.enabled;
		}
	}

	var callbacks = {};

	this.subscribe = function(key, callback) {
		callbacks[key] = callback;
	};

	this.unsubscribe = function(id) {
		delete callbacks[id];
	};

	function handle(action) {
		return function(ext) {
			checkOldExtension(ext);
			for (var key in callbacks) {
				callbacks[key]({ id: ext.id, action: action });
			}
		};
	}

	try {
		chrome.management.onEnabled.addListener(handle("enabled"));
		chrome.management.onDisabled.addListener(handle("disabled"));
		chrome.management.onInstalled.addListener(handle("installed"));
		var handleUninstall = handle("uninstalled");
		chrome.management.onUninstalled.addListener(function(id) {
			var extId = typeof id === "string" ? id : (id || {}).id;
			handleUninstall({ id: extId });
		});
	} catch (e) {
		this.subscribeError = e;
	}

	this.getAll = function(callback, reject) {
		try {
			chrome.management.getAll(callback);
		} catch(e) {
			reject(e);
		}
	};

	this.getAll(function(exts) {
		exts.forEach(checkOldExtension);
	}, function(e) {
		that.searchError = e;
	});

	this.setEnabled = function(id, enable, callback, reject) {
		try {
			chrome.management.setEnabled(id, enable, callback);
		} catch(e) {
			reject(e);
		}
	};
}

var extensions = new Extensions();

function tryDisconnect(port) {
	try {
		port.disconnect();
	} catch (_) { }
}

// -------------------------------- Диагностика --------------------------------

function isDiagDomains(origin) {
	try {
		var url = new URL(origin),
			hostname = url.hostname,
			protocol = url.protocol,
			isHttp = protocol === "http:",
			isHttps = protocol === "https:";
		if (hostname === "localhost.testkontur.ru") {
			return isHttp || isHttps;
		}
		if (!isHttps) {
			return false;
		}
		var goodDomains = [
				"help\\d?",
				"install\\d?",
				"tp",
				"tp-dev",
				"csi-tp-dev",
				"csi-dev-stable"
			].join("|"),
			goodDomainsRegex = new RegExp("^(" + goodDomains + ")\\.(kontur|testkontur)\\.ru$");
		return goodDomainsRegex.test(hostname);
	} catch (_) {
		return false;
	}
}

function filterResponse(obj) {
	var copyObj = {};
	if ("cmd" in obj) {
		copyObj.cmd = obj.cmd;
	}
	if ("sid" in obj) {
		copyObj.sid = obj.sid;
	}
	return copyObj;
}

function ConnectDiag(sessionId, onMessage) {
	var that = this,
		port = null;

	this.close = function() {
		if (port) {
			tryDisconnect(port);
			port = null;
		}
	};

	function responseControl(request, result) {
		var response = filterResponse(request);
		response.type = "Control";
		response.result = result;
		onMessage(response);
	}

	function responseFailed(request, e) {
		var response = filterResponse(request);
		response.type = "Control";
		response.result = "Failed";
		response.errorMessage = e.message;
		response.kdError = 1;
		onMessage(response);
	}

	function handleExtensionRequest(request) {
		var cmd = request.cmd;
		var args = request.args || {};
		if (cmd == -1) { // Info
			if (args.extensionId && args.extensionId !== info.id) {
				setTimeout(function() {
					responseControl(request, info);
				}, 500);
			} else {
				responseControl(request, info);
			}
		} else if (cmd == -2) { // Disconnect
			responseControl(request, true);
			that.close();
		} else if (cmd == -3) { // Management API - getAll
			extensions.getAll(
				function(result) {
					responseControl(request, result);
				},
				function(e) {
					responseFailed(request, e);
				});
		} else if (cmd == -4) { // Management API - subscribe
			if (extensions.subscribeError) {
				responseFailed(request, extensions.subscribeError)
				return;
			}
			extensions.subscribe(sessionId,
				function(result) {
					onMessage({
						type: "ManagementEvent",
						result: result
					});
				});
			responseControl(request, true);
		} else if (cmd == -5) { // Management API - unsubscribe
			extensions.unsubscribe(sessionId);
			responseControl(request, true);
		} else if (cmd == -6) { // Management API - setEnabled
			extensions.setEnabled(args.id, args.enable,
				function() {
					responseControl(request, true);
				},
				function(e) {
					responseFailed(request, e);
				});
		} else if (cmd == -7) { // Management API - uninstallSelf
			if (!args.extensionId || (args.extensionId !== info.id)) {
				request.result = info;
				request.type = "ExtensionUninstallSelfDenied";
				request.kdError = 1;
				onMessage(request);
				return;
			}
			request.result = true;
			onMessage(request);
			that.close();
			chrome.management.uninstallSelf();
		} else {
			request.result = false;
			request.type = "NotImplemented";
			request.kdError = 1;
			onMessage(request);
		}
	}

	function sendRequest(request) {
		if (request.cmd < 0) {
			handleExtensionRequest(request);
			return;
		}
		try {
			if (!port) {
				port = chrome.runtime.connectNative("kd.nc");
				port.onMessage.addListener(onMessage);
				port.onDisconnect.addListener(function() {
					var error = chrome.runtime.lastError;
					onMessage({
						type: "DisconnectNativePort",
						message: error ? error.message : "disconnect from native messaging host"
					});
					port = null;
				});
			}
			port.postMessage(request);
		} catch (e) {
			var response = filterResponse(request),
				lastError = chrome.runtime.lastError;
			response.type = "NativePortConnectError";
			response.errorMessage = e.message + (lastError ? " (" + lastError.message + ")" : "");
			response.kdError = 1;
			onMessage(response);
		}
	}

	function respondNoAccess(request) {
		var response = filterResponse(request);
		response.type = "NativeClientHasNotAccess";
		response.kdError = 5;
		onMessage(response);
	}

	function checkRequest(request) {
		that.send = isDiagDomains(request.origin) ? sendRequest : respondNoAccess;
		that.send(request);
	}

	this.send = checkRequest;
}

// ----------------------------------- Плагин ----------------------------------

function ConnectPlugin(sessionId, onMessage) {
	var that = this,
		port = null,
		buffers = {};

	function clear() {
		port = null;
		buffers = {};
	}

	this.close = function() {
		if (port) {
			tryDisconnect(port);
			clear();
		}
	};

	function handleExtensionRequest(request) {
		if (request.type === "extension.info") {
			onMessage({
				sessionId: sessionId,
				commandId: request.commandId,
				result: info
			});
			return;
		}
		if (request.type === "extension.close") {
			that.close();
			return;
		}
	}

	this.send = function(request) {
		if (request.hostUri === "null") {
			this.send = function() {};
			return;
		}
		if (String(request.type).startsWith("extension.")) {
			handleExtensionRequest(request);
			return;
		}
		try {
			if (!port) {
				port = chrome.runtime.connectNative("kontur.plugin");
				port.onMessage.addListener(function(message) {
					if (message.isChunked) {
						var id = message.id,
							buffer = buffers[id] || "";
						buffer += message.data;
						if (!message.isFinalChunk) {
							buffers[id] = buffer;
							return;
						}
						delete buffers[id];
						message = JSON.parse(buffer);
					}
					onMessage(message);
				});
				port.onDisconnect.addListener(function() {
					clear();
					var error = chrome.runtime.lastError;
					onMessage({
						sessionId: sessionId,
						error: {
							type: "connect",
							message: error ? error.message : "disconnect from native messaging host"
						}
					});
				});
			}
			port.postMessage(request);
		} catch (e) {
			onMessage({
				sessionId: sessionId,
				commandId: request.commandId,
				error: {
					type: "connect",
					message: e ? e.message : "failed to send message to native messaging host"
				}
			});
		}
	};
}

// --------------------------------- Общий код ---------------------------------

function Session(sessionId, onMessage) {
	var that = this,
		connect = null,
		oldExtension = {};

	function sendRequest(request) {
		if (request.isNewType || !(extensions.searchError || oldExtension.enabled)) {
			connect.send(request);
		}
	}

	function routeRequest(request) {
		if ("cmd" in request) {
			connect = new ConnectDiag(sessionId, onMessage);
			oldExtension = extensions.olds.diag;
		} else if ("type" in request) {
			connect = new ConnectPlugin(sessionId, onMessage);
			oldExtension = extensions.olds.plugin;
		} else {
			var message = "invalid command structure";
			request.type = "ExtensionInvalidRequest";
			request.errorMessage = message;
			request.error = {
				type: "connect",
				message: message
			};
			onMessage(request);
			return;
		}
		that.send = sendRequest;
		that.send(request);
	}

	this.send = routeRequest;

	this.close = function() {
		if (connect) {
			connect.close();
			connect = null;
		}
	};
}

chrome.runtime.onConnect.addListener(function(port) {
	var session = new Session(port.name, onResponse);
	port.onMessage.addListener(function(message) {
		session.send(message);
	});
	port.onDisconnect.addListener(onDisconnect);

	function onResponse(message) {
		try {
			port.postMessage(message);
		} catch (_) {
			tryDisconnect(port);
			onDisconnect();
		}
	}

	function onDisconnect() {
		session.close();
		session = null;
	}
});

function reloadContentScripts() {
	var scripts = manifest.content_scripts[0].js;

	chrome.tabs.query(
		{},
		function(tabs) {
			tabs.forEach(function(tab) {
				if ((tab.status == "unloaded") || /^chrome:/.test(tab.url)) {
					return;
				}
				chrome.scripting.executeScript(
					{
						target: {
							tabId: tab.id,
							allFrames: true,
						},
						files: scripts,
					},
					function(_) {
						const lastErr = chrome.runtime.lastError;
						if (lastErr) {
							console.log("tab: " + tab.id + " lastError: " + JSON.stringify(lastErr));
						}
					}
				);
			});
		}
	);
}

function closeWebStorePage() {
	chrome.tabs.query(
		{
			url: [
				"https://chromewebstore.google.com/detail/*" + chrome.runtime.id + "*",
				"https://chrome.google.com/webstore/detail/*" + chrome.runtime.id + "*",
				"https://addons.opera.com/*/extensions/details/kontur.extension",
				"https://microsoftedge.microsoft.com/addons/detail/*" + chrome.runtime.id + "*"
			]
		},
		function(tabs) {
			tabs.forEach(function(tab) {
				chrome.tabs.query(
					{
						windowId: tab.windowId
					},
					function(windowTabs) {
						if ((windowTabs.length === 1) && (windowTabs[0].id === tab.id)) {
							chrome.windows.remove(tab.windowId);
						} else {
							chrome.tabs.remove(tab.id);
						}
					});
			});
		});
}

chrome.runtime.onInstalled.addListener(function(details) {
	reloadContentScripts();
	var isFirefox = ~navigator.userAgent.toLowerCase().indexOf("firefox/"),
		reason = details.reason;
	if (!isFirefox && (reason === "install" || reason === "update")) {
		closeWebStorePage();
	}
});
