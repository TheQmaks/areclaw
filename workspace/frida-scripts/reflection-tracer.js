/**
 * Reflection Tracer — Defeats reflection-based obfuscation
 * Hooks: Method.invoke, Class.forName, getDeclaredMethod, getDeclaredField,
 *        Constructor.newInstance, Field.get/set
 *
 * Many obfuscators hide real API calls behind reflection:
 *   Class.forName("com.target.Secret").getDeclaredMethod("getKey").invoke(...)
 * This script reveals all such calls with their arguments and return values.
 *
 * Usage: frida -U -f <pkg> -l reflection-tracer.js
 */

'use strict';

var TAG = '[Reflection]';

// Filter: only log reflective calls from app classes (not framework)
var FILTER_APP_ONLY = true;
var APP_PREFIXES = []; // Auto-detected from package

function isAppClass(className) {
    if (!FILTER_APP_ONLY || APP_PREFIXES.length === 0) return true;
    for (var i = 0; i < APP_PREFIXES.length; i++) {
        if (className.indexOf(APP_PREFIXES[i]) !== -1) return true;
    }
    return false;
}

function shortStack(depth) {
    try {
        var stack = Java.use('java.lang.Exception').$new().getStackTrace();
        var lines = [];
        for (var i = 0; i < Math.min(stack.length, depth || 5); i++) {
            var frame = stack[i].toString();
            if (frame.indexOf('java.lang.reflect') !== -1) continue;
            lines.push('    at ' + frame);
        }
        return lines.join('\n');
    } catch (e) { return ''; }
}

function safeStr(obj) {
    try {
        if (obj === null || obj === undefined) return 'null';
        return String(obj);
    } catch (e) { return '<error>'; }
}

Java.perform(function () {

    // Auto-detect app package prefix from Application class
    try {
        var ActivityThread = Java.use('android.app.ActivityThread');
        var app = ActivityThread.currentApplication();
        if (app) {
            var pkgName = app.getPackageName();
            // Use first 2-3 segments as prefix
            var parts = pkgName.split('.');
            if (parts.length >= 2) {
                APP_PREFIXES.push(parts.slice(0, 2).join('.'));
                if (parts.length >= 3) APP_PREFIXES.push(parts.slice(0, 3).join('.'));
            }
            APP_PREFIXES.push(pkgName);
            console.log(TAG + ' App prefixes: ' + JSON.stringify(APP_PREFIXES));
        }
    } catch (e) { }

    // --- 1. Class.forName ---
    try {
        var Class = Java.use('java.lang.Class');
        Class.forName.overload('java.lang.String').implementation = function (name) {
            var result = this.forName(name);
            // Only log app classes or suspicious dynamic loading
            if (name && (isAppClass(name) || name.indexOf('.') > 10)) {
                console.log('[REFLECT] Class.forName("' + name + '")');
                console.log(shortStack(4));
            }
            return result;
        };
        Class.forName.overload('java.lang.String', 'boolean', 'java.lang.ClassLoader').implementation = function (name, init, loader) {
            var result = this.forName(name, init, loader);
            if (name && (isAppClass(name) || name.indexOf('.') > 10)) {
                console.log('[REFLECT] Class.forName("' + name + '", init=' + init + ')');
                console.log(shortStack(4));
            }
            return result;
        };
        console.log(TAG + ' Class.forName hooked');
    } catch (e) { }

    // --- 2. getDeclaredMethod ---
    try {
        var Class = Java.use('java.lang.Class');
        Class.getDeclaredMethod.implementation = function (name, paramTypes) {
            var className = this.getName();
            if (isAppClass(className)) {
                var params = [];
                if (paramTypes) {
                    for (var i = 0; i < paramTypes.length; i++) {
                        params.push(paramTypes[i].getName());
                    }
                }
                console.log('[REFLECT] ' + className + '.getDeclaredMethod("' + name + '", [' + params.join(', ') + '])');
            }
            return this.getDeclaredMethod(name, paramTypes);
        };
    } catch (e) { }

    // --- 3. Method.invoke (the big one) ---
    try {
        var Method = Java.use('java.lang.reflect.Method');
        Method.invoke.implementation = function (obj, args) {
            var methodName = this.getName();
            var declaringClass = this.getDeclaringClass().getName();

            if (isAppClass(declaringClass)) {
                var argStrs = [];
                if (args) {
                    for (var i = 0; i < args.length; i++) {
                        argStrs.push(safeStr(args[i]));
                    }
                }

                console.log('[REFLECT] Method.invoke: ' + declaringClass + '.' + methodName + '(' + argStrs.join(', ') + ')');

                var result = this.invoke(obj, args);
                console.log('[REFLECT]   → return: ' + safeStr(result));
                console.log(shortStack(4));
                return result;
            }

            return this.invoke(obj, args);
        };
        console.log(TAG + ' Method.invoke hooked');
    } catch (e) {
        console.log(TAG + ' Method.invoke skip: ' + e.message);
    }

    // --- 4. getDeclaredField + Field.get/set ---
    try {
        var Class = Java.use('java.lang.Class');
        Class.getDeclaredField.implementation = function (name) {
            var className = this.getName();
            if (isAppClass(className)) {
                console.log('[REFLECT] ' + className + '.getDeclaredField("' + name + '")');
            }
            return this.getDeclaredField(name);
        };
    } catch (e) { }

    try {
        var Field = Java.use('java.lang.reflect.Field');
        Field.get.implementation = function (obj) {
            var result = this.get(obj);
            var fieldName = this.getName();
            var declClass = this.getDeclaringClass().getName();
            if (isAppClass(declClass)) {
                console.log('[REFLECT] Field.get: ' + declClass + '.' + fieldName + ' = ' + safeStr(result));
            }
            return result;
        };

        Field.set.implementation = function (obj, value) {
            var fieldName = this.getName();
            var declClass = this.getDeclaringClass().getName();
            if (isAppClass(declClass)) {
                console.log('[REFLECT] Field.set: ' + declClass + '.' + fieldName + ' = ' + safeStr(value));
            }
            this.set(obj, value);
        };
    } catch (e) { }

    // --- 5. Constructor.newInstance ---
    try {
        var Constructor = Java.use('java.lang.reflect.Constructor');
        Constructor.newInstance.overload('[Ljava.lang.Object;').implementation = function (args) {
            var declClass = this.getDeclaringClass().getName();
            if (isAppClass(declClass)) {
                var argStrs = [];
                if (args) {
                    for (var i = 0; i < args.length; i++) {
                        argStrs.push(safeStr(args[i]));
                    }
                }
                console.log('[REFLECT] Constructor: new ' + declClass + '(' + argStrs.join(', ') + ')');
                console.log(shortStack(4));
            }
            return this.newInstance(args);
        };
    } catch (e) { }

    // --- 6. Proxy (dynamic proxies — often used to hide interface implementations) ---
    try {
        var Proxy = Java.use('java.lang.reflect.Proxy');
        Proxy.newProxyInstance.implementation = function (loader, interfaces, handler) {
            var ifaceNames = [];
            for (var i = 0; i < interfaces.length; i++) {
                ifaceNames.push(interfaces[i].getName());
            }
            console.log('[REFLECT] Proxy.newProxyInstance interfaces: [' + ifaceNames.join(', ') + ']');
            console.log('[REFLECT]   handler: ' + handler.$className);
            return this.newProxyInstance(loader, interfaces, handler);
        };
    } catch (e) { }

    console.log(TAG + ' === Reflection Tracer loaded ===');
});
