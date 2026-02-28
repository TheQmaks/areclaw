/**
 * HTTP Logger — Universal
 * Hooks: OkHttp3 Interceptor, HttpURLConnection, Volley
 * Outputs JSON lines to console: { method, url, headers, requestBody, status, responseBody }
 * Usage: frida -U -f <pkg> -l http-logger.js
 *
 * Collect output: frida ... 2>&1 | grep '^\[HTTP-LOG\]' | sed 's/^\[HTTP-LOG\] //' > traffic.json
 */

'use strict';

Java.perform(function () {
    var TAG = '[HTTP-Logger]';

    function safeStr(obj) {
        try {
            if (obj === null || obj === undefined) return null;
            return String(obj);
        } catch (e) {
            return '<error: ' + e.message + '>';
        }
    }

    function headersToObj(headers) {
        var result = {};
        try {
            var size = headers.size();
            for (var i = 0; i < size; i++) {
                var name = headers.name(i);
                result[safeStr(name)] = safeStr(headers.value(i));
            }
        } catch (e) { }
        return result;
    }

    function bodyToString(body) {
        try {
            if (body === null || body === undefined) return null;
            var buffer = Java.use('okio.Buffer').$new();
            body.writeTo(buffer);
            return buffer.readUtf8();
        } catch (e) {
            return '<unreadable>';
        }
    }

    var MAX_BODY_SIZE = 100 * 1024; // 100KB

    function responseBodyString(response) {
        try {
            var source = response.body().source();
            source.request(Java.use('java.lang.Long').MAX_VALUE.value);
            var buffer = source.getBuffer ? source.getBuffer() : source.buffer();
            var clone = buffer.clone();
            var bodyStr = clone.readUtf8();
            if (bodyStr.length > MAX_BODY_SIZE) {
                return bodyStr.substring(0, MAX_BODY_SIZE) + ' [truncated]';
            }
            return bodyStr;
        } catch (e) {
            return '<unreadable>';
        }
    }

    // --- 1. OkHttp3 Interceptor Chain ---
    function hookRealInterceptorChain(className) {
        var RealInterceptorChain = Java.use(className);
        RealInterceptorChain.proceed.overload('okhttp3.Request').implementation = function (request) {
            var entry = {
                timestamp: new Date().toISOString(),
                method: safeStr(request.method()),
                url: safeStr(request.url()),
                requestHeaders: headersToObj(request.headers()),
                requestBody: bodyToString(request.body())
            };

            var response = this.proceed(request);

            entry.status = response.code();
            entry.responseHeaders = headersToObj(response.headers());
            entry.responseBody = responseBodyString(response);

            console.log('[HTTP-LOG] ' + JSON.stringify(entry));
            return response;
        };
        console.log(TAG + ' OkHttp3 ' + className + ' hooked');
    }

    try {
        // OkHttp 3.x path
        hookRealInterceptorChain('okhttp3.internal.http.RealInterceptorChain');
    } catch (e) {
        try {
            // OkHttp 4.x moved to okhttp3.internal.connection
            hookRealInterceptorChain('okhttp3.internal.connection.RealInterceptorChain');
        } catch (e2) {
            console.log(TAG + ' OkHttp3 skip: ' + e.message + ' / ' + e2.message);
        }
    }

    // --- 2. HttpURLConnection ---
    try {
        var HttpURLConnection = Java.use('java.net.HttpURLConnection');
        HttpURLConnection.getResponseCode.implementation = function () {
            var code = this.getResponseCode();
            var entry = {
                timestamp: new Date().toISOString(),
                method: safeStr(this.getRequestMethod()),
                url: safeStr(this.getURL()),
                status: code,
                source: 'HttpURLConnection'
            };
            console.log('[HTTP-LOG] ' + JSON.stringify(entry));
            return code;
        };
        console.log(TAG + ' HttpURLConnection hooked');
    } catch (e) {
        console.log(TAG + ' HttpURLConnection skip: ' + e.message);
    }

    // --- 3. Volley ---
    try {
        var RequestQueue = Java.use('com.android.volley.RequestQueue');
        RequestQueue.add.overload('com.android.volley.Request').implementation = function (request) {
            var methods = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'PATCH'];
            var entry = {
                timestamp: new Date().toISOString(),
                method: methods[request.getMethod()] || 'UNKNOWN',
                url: safeStr(request.getUrl()),
                source: 'Volley'
            };
            console.log('[HTTP-LOG] ' + JSON.stringify(entry));
            return this.add(request);
        };
        console.log(TAG + ' Volley RequestQueue hooked');
    } catch (e) {
        console.log(TAG + ' Volley skip: ' + e.message);
    }

    // --- 4. Retrofit (URL logging) ---
    try {
        var HttpUrl = Java.use('okhttp3.HttpUrl');
        HttpUrl.parse.overload('java.lang.String').implementation = function (url) {
            if (url && url.indexOf('http') === 0) {
                console.log(TAG + ' URL parsed: ' + url);
            }
            return this.parse(url);
        };
    } catch (e) { }

    console.log(TAG + ' === HTTP Logger loaded ===');
});
