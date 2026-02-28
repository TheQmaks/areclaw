/**
 * WebView Interceptor — Monitors hybrid app JS bridges and URL loading
 * Hooks: WebView.loadUrl, evaluateJavascript, addJavascriptInterface,
 *        WebViewClient callbacks, WebChromeClient
 * Also hooks all SUBCLASSES of WebView, WebViewClient, and WebChromeClient
 * to catch overridden methods that bypass base-class hooks.
 *
 * Critical for hybrid apps that hide logic in JavaScript bridges
 *
 * Usage: frida -U -f <pkg> -l webview-interceptor.js
 */

'use strict';

var TAG = '[WebView]';

function shortStack(depth) {
    try {
        var stack = Java.use('java.lang.Exception').$new().getStackTrace();
        var lines = [];
        for (var i = 0; i < Math.min(stack.length, depth || 5); i++) {
            lines.push('  at ' + stack[i].toString());
        }
        return lines.join('\n');
    } catch (e) { return ''; }
}

Java.perform(function () {
    var WebView = Java.use('android.webkit.WebView');

    // --- 1. loadUrl ---
    try {
        WebView.loadUrl.overload('java.lang.String').implementation = function (url) {
            console.log('[WEBVIEW-URL] loadUrl: ' + url);
            if (url && url.indexOf('javascript:') === 0) {
                console.log('[WEBVIEW-JS] Injected JS: ' + url.substring(0, 200));
            }
            console.log(shortStack(5));
            this.loadUrl(url);
        };

        WebView.loadUrl.overload('java.lang.String', 'java.util.Map').implementation = function (url, headers) {
            console.log('[WEBVIEW-URL] loadUrl: ' + url);
            if (headers) {
                var iter = headers.entrySet().iterator();
                while (iter.hasNext()) {
                    var entry = iter.next();
                    console.log('[WEBVIEW-URL]   Header: ' + entry.getKey() + ': ' + entry.getValue());
                }
            }
            this.loadUrl(url, headers);
        };
        console.log(TAG + ' loadUrl hooked');
    } catch (e) { }

    // --- 2. loadData / loadDataWithBaseURL ---
    try {
        WebView.loadData.implementation = function (data, mimeType, encoding) {
            console.log('[WEBVIEW-DATA] loadData: mime=' + mimeType + ' enc=' + encoding);
            console.log('[WEBVIEW-DATA] Content: ' + (data ? data.substring(0, 500) : 'null'));
            this.loadData(data, mimeType, encoding);
        };

        WebView.loadDataWithBaseURL.implementation = function (baseUrl, data, mimeType, encoding, historyUrl) {
            console.log('[WEBVIEW-DATA] loadDataWithBaseURL: base=' + baseUrl);
            console.log('[WEBVIEW-DATA] Content: ' + (data ? data.substring(0, 500) : 'null'));
            this.loadDataWithBaseURL(baseUrl, data, mimeType, encoding, historyUrl);
        };
    } catch (e) { }

    // --- 3. evaluateJavascript ---
    try {
        WebView.evaluateJavascript.implementation = function (script, callback) {
            console.log('[WEBVIEW-JS] evaluateJavascript:');
            console.log('[WEBVIEW-JS]   Script: ' + (script ? script.substring(0, 500) : 'null'));
            console.log(shortStack(4));

            // Wrap callback to capture result
            if (callback) {
                var ValueCallback = Java.use('android.webkit.ValueCallback');
                var origCallback = callback;
                var wrappedCallback = Java.registerClass({
                    name: 'com.frida.JSCallback' + Date.now(),
                    implements: [ValueCallback],
                    methods: {
                        onReceiveValue: function (value) {
                            console.log('[WEBVIEW-JS]   Result: ' + value);
                            origCallback.onReceiveValue(value);
                        }
                    }
                });
                this.evaluateJavascript(script, wrappedCallback.$new());
            } else {
                this.evaluateJavascript(script, callback);
            }
        };
        console.log(TAG + ' evaluateJavascript hooked');
    } catch (e) {
        console.log(TAG + ' evaluateJavascript skip: ' + e.message);
    }

    // --- 4. addJavascriptInterface — CRITICAL SECURITY SURFACE ---
    try {
        WebView.addJavascriptInterface.implementation = function (object, name) {
            console.log('[WEBVIEW-BRIDGE] ████ addJavascriptInterface ████');
            console.log('[WEBVIEW-BRIDGE] Interface name: "' + name + '"');
            console.log('[WEBVIEW-BRIDGE] Object class: ' + object.$className);

            // List all methods exposed to JavaScript (@JavascriptInterface annotated)
            // Use getMethods() instead of getDeclaredMethods() to include inherited @JavascriptInterface methods
            try {
                var clazz = object.getClass();
                var methods = clazz.getMethods();
                for (var i = 0; i < methods.length; i++) {
                    var method = methods[i];
                    var annotations = method.getAnnotations();
                    for (var j = 0; j < annotations.length; j++) {
                        if (annotations[j].annotationType().getName().indexOf('JavascriptInterface') !== -1) {
                            console.log('[WEBVIEW-BRIDGE]   @JavascriptInterface: ' + method.getName() + '()');
                        }
                    }
                }
            } catch (e) { }

            console.log(shortStack(6));
            this.addJavascriptInterface(object, name);
        };
        console.log(TAG + ' addJavascriptInterface hooked');
    } catch (e) { }

    // --- 5. WebView settings (security flags) ---
    try {
        var WebSettings = Java.use('android.webkit.WebSettings');

        WebSettings.setJavaScriptEnabled.implementation = function (flag) {
            console.log('[WEBVIEW-SETTINGS] setJavaScriptEnabled: ' + flag);
            this.setJavaScriptEnabled(flag);
        };

        WebSettings.setAllowFileAccess.implementation = function (flag) {
            if (flag) console.log('[WEBVIEW-SETTINGS] ⚠ setAllowFileAccess: true');
            this.setAllowFileAccess(flag);
        };

        WebSettings.setAllowUniversalAccessFromFileURLs.implementation = function (flag) {
            if (flag) console.log('[WEBVIEW-SETTINGS] ⚠ CRITICAL: setAllowUniversalAccessFromFileURLs: true');
            this.setAllowUniversalAccessFromFileURLs(flag);
        };

        WebSettings.setAllowFileAccessFromFileURLs.implementation = function (flag) {
            if (flag) console.log('[WEBVIEW-SETTINGS] ⚠ setAllowFileAccessFromFileURLs: true');
            this.setAllowFileAccessFromFileURLs(flag);
        };

        WebSettings.setMixedContentMode.implementation = function (mode) {
            var modes = {0: 'MIXED_CONTENT_ALWAYS_ALLOW', 1: 'MIXED_CONTENT_NEVER_ALLOW', 2: 'MIXED_CONTENT_COMPATIBILITY_MODE'};
            console.log('[WEBVIEW-SETTINGS] setMixedContentMode: ' + (modes[mode] || mode));
            this.setMixedContentMode(mode);
        };
    } catch (e) { }

    // --- 6. WebViewClient — page navigation and errors ---
    try {
        var WebViewClient = Java.use('android.webkit.WebViewClient');

        // Deprecated overload: shouldOverrideUrlLoading(WebView, String)
        try {
            WebViewClient.shouldOverrideUrlLoading.overload('android.webkit.WebView', 'java.lang.String').implementation = function (view, url) {
                console.log('[WEBVIEW-NAV] shouldOverrideUrlLoading: ' + url);
                return this.shouldOverrideUrlLoading(view, url);
            };
        } catch (e) { }

        // Modern overload: shouldOverrideUrlLoading(WebView, WebResourceRequest)
        try {
            WebViewClient.shouldOverrideUrlLoading.overload('android.webkit.WebView', 'android.webkit.WebResourceRequest').implementation = function (view, request) {
                console.log('[WEBVIEW-NAV] shouldOverrideUrlLoading(request): ' + request.getUrl().toString());
                console.log('[WEBVIEW-NAV]   method=' + request.getMethod() + ' isRedirect=' + request.isRedirect() + ' hasGesture=' + request.hasGesture());
                return this.shouldOverrideUrlLoading(view, request);
            };
        } catch (e) { }

        try {
            WebViewClient.onPageStarted.implementation = function (view, url, favicon) {
                console.log('[WEBVIEW-NAV] onPageStarted: ' + url);
                this.onPageStarted(view, url, favicon);
            };
        } catch (e) { }

        WebViewClient.onPageFinished.implementation = function (view, url) {
            console.log('[WEBVIEW-NAV] onPageFinished: ' + url);
            this.onPageFinished(view, url);
        };

        WebViewClient.onReceivedError.overload('android.webkit.WebView', 'int', 'java.lang.String', 'java.lang.String').implementation = function (view, errorCode, description, failingUrl) {
            console.log('[WEBVIEW-ERR] Error ' + errorCode + ': ' + description + ' @ ' + failingUrl);
            this.onReceivedError(view, errorCode, description, failingUrl);
        };
    } catch (e) { }

    // --- 7. WebChromeClient — JS alerts/console ---
    try {
        var WebChromeClient = Java.use('android.webkit.WebChromeClient');
        WebChromeClient.onConsoleMessage.overload('android.webkit.ConsoleMessage').implementation = function (msg) {
            console.log('[WEBVIEW-CONSOLE] ' + msg.messageLevel() + ': ' + msg.message() + ' (' + msg.sourceId() + ':' + msg.lineNumber() + ')');
            return this.onConsoleMessage(msg);
        };
    } catch (e) { }

    // --- 8. Hook WebView constructor to catch dynamically-created instances ---
    try {
        WebView.$init.overload('android.content.Context').implementation = function (context) {
            var creatorClass = this.$className;
            console.log('[WEBVIEW-CTOR] WebView created by: ' + creatorClass);
            try {
                var cl = this.getClass().getClassLoader();
                if (cl !== null) {
                    var clName = cl.$className || cl.getClass().getName();
                    if (clName.indexOf('dalvik.system.PathClassLoader') === -1 &&
                        clName.indexOf('dalvik.system.InMemoryDexClassLoader') !== -1) {
                        console.log('[WEBVIEW-CTOR] ⚠ Custom ClassLoader: ' + clName);
                    }
                }
            } catch (e) { }
            console.log(shortStack(5));
            this.$init(context);
        };

        WebView.$init.overload('android.content.Context', 'android.util.AttributeSet').implementation = function (context, attrs) {
            var creatorClass = this.$className;
            console.log('[WEBVIEW-CTOR] WebView(Context, AttributeSet) created by: ' + creatorClass);
            try {
                var cl = this.getClass().getClassLoader();
                if (cl !== null) {
                    var clName = cl.$className || cl.getClass().getName();
                    if (clName.indexOf('dalvik.system.PathClassLoader') === -1 &&
                        clName.indexOf('dalvik.system.InMemoryDexClassLoader') !== -1) {
                        console.log('[WEBVIEW-CTOR] ⚠ Custom ClassLoader: ' + clName);
                    }
                }
            } catch (e) { }
            this.$init(context, attrs);
        };

        WebView.$init.overload('android.content.Context', 'android.util.AttributeSet', 'int').implementation = function (context, attrs, defStyle) {
            var creatorClass = this.$className;
            console.log('[WEBVIEW-CTOR] WebView(Context, AttributeSet, int) created by: ' + creatorClass);
            this.$init(context, attrs, defStyle);
        };

        console.log(TAG + ' WebView constructor hooked');
    } catch (e) { }

    // --- 9. Hook WebView subclasses ---
    // Real apps use custom WebView subclasses whose overridden methods bypass base-class hooks
    try {
        var webviewSubclassCount = 0;
        var allClasses = Java.enumerateLoadedClassesSync();

        for (var ci = 0; ci < allClasses.length; ci++) {
            try {
                var cls = Java.use(allClasses[ci]);
                var superClass = cls.class.getSuperclass();
                var isWebViewSubclass = false;

                // Walk the superclass chain to check if it extends WebView
                while (superClass !== null) {
                    if (superClass.getName() === 'android.webkit.WebView') {
                        isWebViewSubclass = true;
                        break;
                    }
                    superClass = superClass.getSuperclass();
                }

                if (!isWebViewSubclass) continue;

                var subName = allClasses[ci];
                console.log('[WEBVIEW-SUBCLASS] Found WebView subclass: ' + subName);
                webviewSubclassCount++;

                // Hook loadUrl(String)
                try {
                    cls.loadUrl.overload('java.lang.String').implementation = function (url) {
                        console.log('[WEBVIEW-URL] [' + this.$className + '] loadUrl: ' + url);
                        if (url && url.indexOf('javascript:') === 0) {
                            console.log('[WEBVIEW-JS] [' + this.$className + '] Injected JS: ' + url.substring(0, 200));
                        }
                        console.log(shortStack(5));
                        this.loadUrl(url);
                    };
                } catch (e) { }

                // Hook loadUrl(String, Map)
                try {
                    cls.loadUrl.overload('java.lang.String', 'java.util.Map').implementation = function (url, headers) {
                        console.log('[WEBVIEW-URL] [' + this.$className + '] loadUrl: ' + url);
                        if (headers) {
                            var iter = headers.entrySet().iterator();
                            while (iter.hasNext()) {
                                var entry = iter.next();
                                console.log('[WEBVIEW-URL]   Header: ' + entry.getKey() + ': ' + entry.getValue());
                            }
                        }
                        this.loadUrl(url, headers);
                    };
                } catch (e) { }

                // Hook loadData
                try {
                    cls.loadData.implementation = function (data, mimeType, encoding) {
                        console.log('[WEBVIEW-DATA] [' + this.$className + '] loadData: mime=' + mimeType + ' enc=' + encoding);
                        console.log('[WEBVIEW-DATA] Content: ' + (data ? data.substring(0, 500) : 'null'));
                        this.loadData(data, mimeType, encoding);
                    };
                } catch (e) { }

                // Hook loadDataWithBaseURL
                try {
                    cls.loadDataWithBaseURL.implementation = function (baseUrl, data, mimeType, encoding, historyUrl) {
                        console.log('[WEBVIEW-DATA] [' + this.$className + '] loadDataWithBaseURL: base=' + baseUrl);
                        console.log('[WEBVIEW-DATA] Content: ' + (data ? data.substring(0, 500) : 'null'));
                        this.loadDataWithBaseURL(baseUrl, data, mimeType, encoding, historyUrl);
                    };
                } catch (e) { }

                // Hook evaluateJavascript
                try {
                    cls.evaluateJavascript.implementation = function (script, callback) {
                        console.log('[WEBVIEW-JS] [' + this.$className + '] evaluateJavascript:');
                        console.log('[WEBVIEW-JS]   Script: ' + (script ? script.substring(0, 500) : 'null'));
                        console.log(shortStack(4));
                        this.evaluateJavascript(script, callback);
                    };
                } catch (e) { }

                // Hook addJavascriptInterface
                try {
                    cls.addJavascriptInterface.implementation = function (object, name) {
                        console.log('[WEBVIEW-BRIDGE] ████ [' + this.$className + '] addJavascriptInterface ████');
                        console.log('[WEBVIEW-BRIDGE] Interface name: "' + name + '"');
                        console.log('[WEBVIEW-BRIDGE] Object class: ' + object.$className);
                        try {
                            var clazz = object.getClass();
                            var methods = clazz.getMethods();
                            for (var i = 0; i < methods.length; i++) {
                                var method = methods[i];
                                var annotations = method.getAnnotations();
                                for (var j = 0; j < annotations.length; j++) {
                                    if (annotations[j].annotationType().getName().indexOf('JavascriptInterface') !== -1) {
                                        console.log('[WEBVIEW-BRIDGE]   @JavascriptInterface: ' + method.getName() + '()');
                                    }
                                }
                            }
                        } catch (e) { }
                        console.log(shortStack(6));
                        this.addJavascriptInterface(object, name);
                    };
                } catch (e) { }

            } catch (e) { /* skip classes that can't be loaded */ }
        }
        console.log(TAG + ' Hooked ' + webviewSubclassCount + ' WebView subclass(es)');
    } catch (e) {
        console.log(TAG + ' WebView subclass enumeration error: ' + e.message);
    }

    // --- 10. Hook WebViewClient and WebChromeClient subclasses ---
    try {
        var clientSubclassCount = 0;
        var chromeSubclassCount = 0;
        // Reuse allClasses from above or re-enumerate
        var allClasses2 = allClasses || Java.enumerateLoadedClassesSync();

        for (var ci2 = 0; ci2 < allClasses2.length; ci2++) {
            try {
                var cls2 = Java.use(allClasses2[ci2]);
                var superClass2 = cls2.class.getSuperclass();
                var isWebViewClient = false;
                var isWebChromeClient = false;

                // Walk the superclass chain
                var sc = superClass2;
                while (sc !== null) {
                    var scName = sc.getName();
                    if (scName === 'android.webkit.WebViewClient') {
                        isWebViewClient = true;
                        break;
                    }
                    if (scName === 'android.webkit.WebChromeClient') {
                        isWebChromeClient = true;
                        break;
                    }
                    sc = sc.getSuperclass();
                }

                if (!isWebViewClient && !isWebChromeClient) continue;

                var subName2 = allClasses2[ci2];

                // --- WebViewClient subclass hooks ---
                if (isWebViewClient) {
                    console.log('[WEBVIEW-SUBCLASS] Found WebViewClient subclass: ' + subName2);
                    clientSubclassCount++;

                    // shouldOverrideUrlLoading(WebView, String) — deprecated overload
                    try {
                        cls2.shouldOverrideUrlLoading.overload('android.webkit.WebView', 'java.lang.String').implementation = function (view, url) {
                            console.log('[WEBVIEW-NAV] [' + this.$className + '] shouldOverrideUrlLoading: ' + url);
                            return this.shouldOverrideUrlLoading(view, url);
                        };
                    } catch (e) { }

                    // shouldOverrideUrlLoading(WebView, WebResourceRequest) — modern overload
                    try {
                        cls2.shouldOverrideUrlLoading.overload('android.webkit.WebView', 'android.webkit.WebResourceRequest').implementation = function (view, request) {
                            console.log('[WEBVIEW-NAV] [' + this.$className + '] shouldOverrideUrlLoading(request): ' + request.getUrl().toString());
                            console.log('[WEBVIEW-NAV]   method=' + request.getMethod() + ' isRedirect=' + request.isRedirect() + ' hasGesture=' + request.hasGesture());
                            return this.shouldOverrideUrlLoading(view, request);
                        };
                    } catch (e) { }

                    // onPageStarted
                    try {
                        cls2.onPageStarted.implementation = function (view, url, favicon) {
                            console.log('[WEBVIEW-NAV] [' + this.$className + '] onPageStarted: ' + url);
                            this.onPageStarted(view, url, favicon);
                        };
                    } catch (e) { }

                    // onPageFinished
                    try {
                        cls2.onPageFinished.implementation = function (view, url) {
                            console.log('[WEBVIEW-NAV] [' + this.$className + '] onPageFinished: ' + url);
                            this.onPageFinished(view, url);
                        };
                    } catch (e) { }
                }

                // --- WebChromeClient subclass hooks ---
                if (isWebChromeClient) {
                    console.log('[WEBVIEW-SUBCLASS] Found WebChromeClient subclass: ' + subName2);
                    chromeSubclassCount++;

                    // onJsAlert
                    try {
                        cls2.onJsAlert.implementation = function (view, url, message, result) {
                            console.log('[WEBVIEW-JS] [' + this.$className + '] onJsAlert: url=' + url + ' msg=' + message);
                            return this.onJsAlert(view, url, message, result);
                        };
                    } catch (e) { }

                    // onJsConfirm
                    try {
                        cls2.onJsConfirm.implementation = function (view, url, message, result) {
                            console.log('[WEBVIEW-JS] [' + this.$className + '] onJsConfirm: url=' + url + ' msg=' + message);
                            return this.onJsConfirm(view, url, message, result);
                        };
                    } catch (e) { }

                    // onJsPrompt
                    try {
                        cls2.onJsPrompt.implementation = function (view, url, message, defaultValue, result) {
                            console.log('[WEBVIEW-JS] [' + this.$className + '] onJsPrompt: url=' + url + ' msg=' + message + ' default=' + defaultValue);
                            return this.onJsPrompt(view, url, message, defaultValue, result);
                        };
                    } catch (e) { }

                    // onConsoleMessage
                    try {
                        cls2.onConsoleMessage.overload('android.webkit.ConsoleMessage').implementation = function (msg) {
                            console.log('[WEBVIEW-CONSOLE] [' + this.$className + '] ' + msg.messageLevel() + ': ' + msg.message() + ' (' + msg.sourceId() + ':' + msg.lineNumber() + ')');
                            return this.onConsoleMessage(msg);
                        };
                    } catch (e) { }
                }

            } catch (e) { /* skip classes that can't be loaded */ }
        }
        console.log(TAG + ' Hooked ' + clientSubclassCount + ' WebViewClient subclass(es)');
        console.log(TAG + ' Hooked ' + chromeSubclassCount + ' WebChromeClient subclass(es)');
    } catch (e) {
        console.log(TAG + ' Client subclass enumeration error: ' + e.message);
    }

    console.log(TAG + ' === WebView Interceptor loaded ===');
});
