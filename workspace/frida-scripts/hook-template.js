/**
 * Hook Template — Universal method interceptor
 * Configure TARGET_CLASS and TARGET_METHOD below, then run.
 * Logs all arguments and return value with optional stack trace.
 *
 * Usage: frida -U -f <pkg> -l hook-template.js
 *
 * Configuration:
 *   TARGET_CLASS  — fully qualified class name
 *   TARGET_METHOD — method name (or "$init" for constructor)
 *   LOG_STACK     — print stack trace on each call
 *   LOG_ARGS      — print arguments
 *   LOG_RETVAL    — print return value
 *   MODIFY_RETVAL — set to non-null to replace return value
 */

'use strict';

// ═══════════════════════════════════════════════
// ██  CONFIGURE THESE  ██
var TARGET_CLASS  = 'com.example.app.TargetClass';
var TARGET_METHOD = 'targetMethod';
var LOG_STACK     = true;
var LOG_ARGS      = true;
var LOG_RETVAL    = true;
var MODIFY_RETVAL = null;  // Set to a value to replace return
// ═══════════════════════════════════════════════

var TAG = '[Hook]';

function argToString(arg) {
    if (arg === null || arg === undefined) return 'null';
    try {
        // Try to detect byte arrays
        if (arg.$className === '[B') {
            var bytes = Java.array('byte', arg);
            var hex = '';
            for (var i = 0; i < Math.min(bytes.length, 32); i++) {
                var b = (bytes[i] & 0xff).toString(16);
                hex += (b.length === 1 ? '0' : '') + b;
            }
            return 'byte[' + bytes.length + ']=' + hex + (bytes.length > 32 ? '...' : '');
        }
    } catch (e) { }
    try {
        return String(arg);
    } catch (e) {
        return '<' + typeof arg + '>';
    }
}

function stackTrace() {
    try {
        var Exception = Java.use('java.lang.Exception');
        var stack = Exception.$new().getStackTrace();
        var lines = [];
        for (var i = 0; i < Math.min(stack.length, 10); i++) {
            lines.push('  at ' + stack[i].toString());
        }
        return lines.join('\n');
    } catch (e) {
        return '';
    }
}

Java.perform(function () {
    try {
        var clazz = Java.use(TARGET_CLASS);

        // Find all overloads
        var overloads = clazz[TARGET_METHOD].overloads;
        console.log(TAG + ' Found ' + overloads.length + ' overload(s) of ' + TARGET_CLASS + '.' + TARGET_METHOD);

        for (var i = 0; i < overloads.length; i++) {
            (function (overload) {
                overload.implementation = function () {
                    var callId = Date.now().toString(36);
                    console.log(TAG + ' [' + callId + '] ' + TARGET_CLASS + '.' + TARGET_METHOD + ' called');

                    // Log arguments
                    if (LOG_ARGS) {
                        for (var j = 0; j < arguments.length; j++) {
                            console.log(TAG + ' [' + callId + ']   arg[' + j + '] = ' + argToString(arguments[j]));
                        }
                    }

                    // Stack trace
                    if (LOG_STACK) {
                        console.log(TAG + ' [' + callId + '] Stack:\n' + stackTrace());
                    }

                    // Call original
                    var retval = overload.apply(this, arguments);

                    // Log return value
                    if (LOG_RETVAL) {
                        console.log(TAG + ' [' + callId + ']   return = ' + argToString(retval));
                    }

                    // Modify return value if configured
                    if (MODIFY_RETVAL !== null) {
                        console.log(TAG + ' [' + callId + ']   → modified return to: ' + MODIFY_RETVAL);
                        return MODIFY_RETVAL;
                    }

                    return retval;
                };
            })(overloads[i]);
        }

        console.log(TAG + ' === Hook active: ' + TARGET_CLASS + '.' + TARGET_METHOD + ' ===');

    } catch (e) {
        console.log(TAG + ' ERROR: ' + e.message);
        console.log(TAG + ' Make sure TARGET_CLASS and TARGET_METHOD are correct.');
        console.log(TAG + ' Target: ' + TARGET_CLASS + '.' + TARGET_METHOD);
    }
});
