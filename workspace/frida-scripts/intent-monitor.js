/**
 * Intent Monitor — Activity, Broadcast, Service
 * Hooks: startActivity, sendBroadcast, startService, bindService
 * Logs action, extras, component, flags, data URI
 * Usage: frida -U -f <pkg> -l intent-monitor.js
 */

'use strict';

Java.perform(function () {
    var TAG = '[Intent-Monitor]';

    function intentToObj(intent) {
        var obj = {};
        try {
            obj.action = intent.getAction() ? String(intent.getAction()) : null;
            obj.component = intent.getComponent() ? String(intent.getComponent().flattenToString()) : null;
            obj.data = intent.getDataString() ? String(intent.getDataString()) : null;
            obj.type = intent.getType() ? String(intent.getType()) : null;
            obj.flags = '0x' + (intent.getFlags() >>> 0).toString(16);

            // Categories
            var categories = intent.getCategories();
            if (categories) {
                obj.categories = [];
                var iter = categories.iterator();
                while (iter.hasNext()) {
                    obj.categories.push(String(iter.next()));
                }
            }

            // Extras
            var extras = intent.getExtras();
            if (extras) {
                obj.extras = {};
                var keys = extras.keySet();
                var iter = keys.iterator();
                while (iter.hasNext()) {
                    var key = String(iter.next());
                    try {
                        var val = extras.get(key);
                        obj.extras[key] = val !== null ? String(val) : null;
                    } catch (e) {
                        obj.extras[key] = '<unreadable>';
                    }
                }
            }
        } catch (e) {
            obj.error = e.message;
        }
        return obj;
    }

    // --- 1. startActivity ---
    try {
        var Activity = Java.use('android.app.Activity');
        Activity.startActivity.overload('android.content.Intent').implementation = function (intent) {
            var entry = { type: 'startActivity', intent: intentToObj(intent), timestamp: new Date().toISOString() };
            console.log('[INTENT] ' + JSON.stringify(entry));
            this.startActivity(intent);
        };
        Activity.startActivityForResult.overload('android.content.Intent', 'int').implementation = function (intent, requestCode) {
            var entry = { type: 'startActivityForResult', requestCode: requestCode, intent: intentToObj(intent), timestamp: new Date().toISOString() };
            console.log('[INTENT] ' + JSON.stringify(entry));
            this.startActivityForResult(intent, requestCode);
        };
        console.log(TAG + ' Activity.startActivity hooked');
    } catch (e) {
        console.log(TAG + ' Activity skip: ' + e.message);
    }

    // --- 2. Context.startActivity (covers non-Activity contexts) ---
    try {
        var ContextImpl = Java.use('android.app.ContextImpl');
        ContextImpl.startActivity.overload('android.content.Intent').implementation = function (intent) {
            var entry = { type: 'Context.startActivity', intent: intentToObj(intent), timestamp: new Date().toISOString() };
            console.log('[INTENT] ' + JSON.stringify(entry));
            this.startActivity(intent);
        };
        console.log(TAG + ' ContextImpl.startActivity hooked');
    } catch (e) { }

    // --- 3. sendBroadcast ---
    try {
        var ContextWrapper = Java.use('android.content.ContextWrapper');
        ContextWrapper.sendBroadcast.overload('android.content.Intent').implementation = function (intent) {
            var entry = { type: 'sendBroadcast', intent: intentToObj(intent), timestamp: new Date().toISOString() };
            console.log('[INTENT] ' + JSON.stringify(entry));
            this.sendBroadcast(intent);
        };
        ContextWrapper.sendOrderedBroadcast.overload('android.content.Intent', 'java.lang.String').implementation = function (intent, permission) {
            var entry = { type: 'sendOrderedBroadcast', permission: permission ? String(permission) : null, intent: intentToObj(intent), timestamp: new Date().toISOString() };
            console.log('[INTENT] ' + JSON.stringify(entry));
            this.sendOrderedBroadcast(intent, permission);
        };
        console.log(TAG + ' sendBroadcast hooked');
    } catch (e) {
        console.log(TAG + ' sendBroadcast skip: ' + e.message);
    }

    // --- 4. startService / bindService ---
    try {
        var ContextWrapper = Java.use('android.content.ContextWrapper');
        ContextWrapper.startService.implementation = function (intent) {
            var entry = { type: 'startService', intent: intentToObj(intent), timestamp: new Date().toISOString() };
            console.log('[INTENT] ' + JSON.stringify(entry));
            return this.startService(intent);
        };
        ContextWrapper.bindService.overload('android.content.Intent', 'android.content.ServiceConnection', 'int').implementation = function (intent, conn, flags) {
            var entry = { type: 'bindService', flags: flags, intent: intentToObj(intent), timestamp: new Date().toISOString() };
            console.log('[INTENT] ' + JSON.stringify(entry));
            return this.bindService(intent, conn, flags);
        };
        console.log(TAG + ' startService/bindService hooked');
    } catch (e) {
        console.log(TAG + ' startService skip: ' + e.message);
    }

    // --- 5. startForegroundService (Android 8+) ---
    try {
        var ContextWrapper = Java.use('android.content.ContextWrapper');
        ContextWrapper.startForegroundService.implementation = function (intent) {
            var entry = { type: 'startForegroundService', intent: intentToObj(intent), timestamp: new Date().toISOString() };
            console.log('[INTENT] ' + JSON.stringify(entry));
            return this.startForegroundService(intent);
        };
        console.log(TAG + ' startForegroundService hooked');
    } catch (e) { }

    // --- 6. PendingIntent creation ---
    try {
        var PendingIntent = Java.use('android.app.PendingIntent');
        PendingIntent.getActivity.overload('android.content.Context', 'int', 'android.content.Intent', 'int').implementation = function (ctx, reqCode, intent, flags) {
            console.log('[INTENT] PendingIntent.getActivity: ' + JSON.stringify(intentToObj(intent)));
            return this.getActivity(ctx, reqCode, intent, flags);
        };
    } catch (e) { }

    console.log(TAG + ' === Intent Monitor loaded ===');
});
