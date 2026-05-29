chrome.runtime.onConnect.addListener(function (port) {
    chrome.tabs.query(
        {currentWindow: true, active: true},
        function (tabArray) {
            chrome.pageAction.show(tabArray[0].id);
        }
    );

    var NativePort = chrome.runtime.connectNative('ru.rtlabs.ifcplugin');
    if (NativePort) {

        port.onDisconnect.addListener(function () {
            if (NativePort)
                NativePort.disconnect();
            port = false;
        });


        NativePort.onMessage.addListener(function (msg) {
            if (port)
                port.postMessage(msg);
            else
                NativePort.disconnect();
        });

        NativePort.onDisconnect.addListener(function () {
            if (port)
                port.disconnect();
            NativePort = false;
        });

        port.onMessage.addListener(function (msg) {
            if (NativePort)
                NativePort.postMessage(msg);
            else
                port.disconnect();
        });
    } else {
        port.disconnect();
    }
});