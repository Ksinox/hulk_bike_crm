var isInstalledExtNode = document.createElement('div');
isInstalledExtNode.id = 'ifcplugin-extension-is-installed';
document.body.appendChild(isInstalledExtNode);

var port = chrome.runtime.connect();
var WND = window;

if (port) {

    var isInstalledPluginNode = document.createElement('div');
    isInstalledPluginNode.id = 'ifc-plugin-is-installed';
    document.body.appendChild(isInstalledPluginNode);

    port.onDisconnect.addListener(function () {
        WND.postMessage(JSON.stringify({type: "IFC_EXT_DISCONNECT"}), "*");
        port = false;
        var element = document.getElementById(isInstalledPluginNode.id);
        if (element)
            element.parentNode.removeChild(element);
    });

    port.onMessage.addListener(function (msg) {
        WND.postMessage(JSON.stringify({type: "FROM_IFC_EXT", msg_data: msg}), "*");
    });

    WND.addEventListener("message", function (event) {

        // We only accept messages from ourselves
        if (event.source !== WND)
            return;

        try {
            var event_data = JSON.parse(event.data);
            if (event_data.type && (event_data.type === "TO_IFC_EXT")) {
                if (port)
                    port.postMessage(event_data.msg_data);
            }
        } catch (e) {
        }
    }, false);
}