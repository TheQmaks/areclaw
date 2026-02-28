/**
 * SharedPreferences Monitor
 * Hooks: SharedPreferences.Editor put*, commit, apply + getAll, getString, etc.
 * Logs all reads and writes with key-value pairs and preference file names
 * Usage: frida -U -f <pkg> -l shared-prefs-monitor.js
 */

'use strict';

Java.perform(function () {
    var TAG = '[SharedPrefs]';

    // --- 1. Hook Editor methods (writes) ---
    try {
        var Editor = Java.use('android.app.SharedPreferencesImpl$EditorImpl');

        Editor.putString.implementation = function (key, value) {
            console.log('[PREFS-WRITE] putString: key="' + key + '" value="' + value + '"');
            return this.putString(key, value);
        };

        Editor.putInt.implementation = function (key, value) {
            console.log('[PREFS-WRITE] putInt: key="' + key + '" value=' + value);
            return this.putInt(key, value);
        };

        Editor.putLong.implementation = function (key, value) {
            console.log('[PREFS-WRITE] putLong: key="' + key + '" value=' + value);
            return this.putLong(key, value);
        };

        Editor.putFloat.implementation = function (key, value) {
            console.log('[PREFS-WRITE] putFloat: key="' + key + '" value=' + value);
            return this.putFloat(key, value);
        };

        Editor.putBoolean.implementation = function (key, value) {
            console.log('[PREFS-WRITE] putBoolean: key="' + key + '" value=' + value);
            return this.putBoolean(key, value);
        };

        Editor.remove.implementation = function (key) {
            console.log('[PREFS-WRITE] remove: key="' + key + '"');
            return this.remove(key);
        };

        Editor.clear.implementation = function () {
            console.log('[PREFS-WRITE] clear()');
            return this.clear();
        };

        Editor.commit.implementation = function () {
            console.log('[PREFS-WRITE] commit()');
            return this.commit();
        };

        Editor.apply.implementation = function () {
            console.log('[PREFS-WRITE] apply()');
            this.apply();
        };

        console.log(TAG + ' Editor write methods hooked');
    } catch (e) {
        console.log(TAG + ' Editor skip: ' + e.message);
    }

    // --- 2. Hook read methods ---
    try {
        var SharedPrefsImpl = Java.use('android.app.SharedPreferencesImpl');

        SharedPrefsImpl.getString.implementation = function (key, defValue) {
            var result = this.getString(key, defValue);
            console.log('[PREFS-READ] getString: key="' + key + '" value="' + result + '"');
            return result;
        };

        SharedPrefsImpl.getInt.implementation = function (key, defValue) {
            var result = this.getInt(key, defValue);
            console.log('[PREFS-READ] getInt: key="' + key + '" value=' + result);
            return result;
        };

        SharedPrefsImpl.getLong.implementation = function (key, defValue) {
            var result = this.getLong(key, defValue);
            console.log('[PREFS-READ] getLong: key="' + key + '" value=' + result);
            return result;
        };

        SharedPrefsImpl.getBoolean.implementation = function (key, defValue) {
            var result = this.getBoolean(key, defValue);
            console.log('[PREFS-READ] getBoolean: key="' + key + '" value=' + result);
            return result;
        };

        SharedPrefsImpl.getFloat.implementation = function (key, defValue) {
            var result = this.getFloat(key, defValue);
            console.log('[PREFS-READ] getFloat: key="' + key + '" value=' + result);
            return result;
        };

        SharedPrefsImpl.getAll.implementation = function () {
            var result = this.getAll();
            console.log('[PREFS-READ] getAll: ' + result.toString());
            return result;
        };

        SharedPrefsImpl.contains.implementation = function (key) {
            var result = this.contains(key);
            console.log('[PREFS-READ] contains: key="' + key + '" → ' + result);
            return result;
        };

        console.log(TAG + ' Read methods hooked');
    } catch (e) {
        console.log(TAG + ' Read skip: ' + e.message);
    }

    // --- 3. Hook getSharedPreferences to log preference file names ---
    try {
        var ContextImpl = Java.use('android.app.ContextImpl');
        ContextImpl.getSharedPreferences.overload('java.lang.String', 'int').implementation = function (name, mode) {
            console.log('[PREFS-FILE] getSharedPreferences: name="' + name + '" mode=' + mode);
            return this.getSharedPreferences(name, mode);
        };
        console.log(TAG + ' getSharedPreferences hooked');
    } catch (e) {
        console.log(TAG + ' getSharedPreferences skip: ' + e.message);
    }

    console.log(TAG + ' === SharedPreferences Monitor loaded ===');
});
