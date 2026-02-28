/**
 * Enumerate Loaded Classes — with filtering
 * Lists all loaded Java classes, filtering out framework noise
 * Usage: frida -U -f <pkg> -l enum-classes.js
 *
 * Control via RPC:
 *   rpc.exports.enumerate(filter)  — filter by package prefix
 *   rpc.exports.search(keyword)    — search by keyword
 *   rpc.exports.methods(className) — list methods of a class
 */

'use strict';

var TAG = '[Enum-Classes]';

// Framework prefixes to exclude by default
var frameworkPrefixes = [
    'java.', 'javax.', 'sun.', 'com.sun.', 'jdk.',
    'android.', 'androidx.', 'dalvik.', 'libcore.',
    'com.android.internal.', 'com.google.android.gms.',
    'kotlin.', 'kotlinx.', 'org.jetbrains.',
    'okhttp3.', 'okio.', 'retrofit2.', 'com.squareup.',
    'com.google.gson.', 'com.google.protobuf.',
    'org.json.', 'org.apache.', 'org.xml.',
    'com.bumptech.glide.', 'io.reactivex.'
];

function isFrameworkClass(name) {
    for (var i = 0; i < frameworkPrefixes.length; i++) {
        if (name.indexOf(frameworkPrefixes[i]) === 0) return true;
    }
    return false;
}

Java.perform(function () {
    // Auto-enumerate on load after delay
    setTimeout(function () {
        var appClasses = [];
        var allClasses = [];

        Java.enumerateLoadedClasses({
            onMatch: function (className) {
                allClasses.push(className);
                if (!isFrameworkClass(className)) {
                    appClasses.push(className);
                }
            },
            onComplete: function () {
                appClasses.sort();
                console.log(TAG + ' Total loaded: ' + allClasses.length);
                console.log(TAG + ' App classes (non-framework): ' + appClasses.length);
                console.log(TAG + ' ---');
                for (var i = 0; i < appClasses.length; i++) {
                    console.log('[CLASS] ' + appClasses[i]);
                }
                console.log(TAG + ' --- End of class list ---');
            }
        });
    }, 3000);
});

// RPC exports for interactive use
rpc.exports = {
    enumerate: function (filter) {
        var result = [];
        Java.performNow(function () {
            Java.enumerateLoadedClasses({
                onMatch: function (className) {
                    if (!filter || className.indexOf(filter) !== -1) {
                        result.push(className);
                    }
                },
                onComplete: function () { }
            });
        });
        return result.sort();
    },

    search: function (keyword) {
        var result = [];
        Java.performNow(function () {
            Java.enumerateLoadedClasses({
                onMatch: function (className) {
                    if (className.toLowerCase().indexOf(keyword.toLowerCase()) !== -1) {
                        result.push(className);
                    }
                },
                onComplete: function () { }
            });
        });
        return result.sort();
    },

    methods: function (className) {
        var result = [];
        Java.performNow(function () {
            try {
                var clazz = Java.use(className).class;
                var methods = clazz.getDeclaredMethods();
                for (var i = 0; i < methods.length; i++) {
                    result.push(methods[i].toString());
                }
            } catch (e) {
                result.push('Error: ' + e.message);
            }
        });
        return result;
    }
};
