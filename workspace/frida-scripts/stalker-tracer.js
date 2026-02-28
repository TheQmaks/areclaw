/**
 * Stalker Tracer — Deep native function tracing
 * Uses Frida Stalker (dynamic recompilation) for instruction-level tracing
 * Traces calls, basic blocks, and SVC (syscalls) within a target module
 *
 * Usage: frida -U -f <pkg> -l stalker-tracer.js
 *
 * Configuration:
 *   TARGET_MODULE  — .so to trace (e.g., "libnative-lib.so")
 *   TARGET_EXPORT  — specific export to trace (optional, traces all if empty)
 *   TRACE_CALLS    — log function calls
 *   TRACE_SYSCALLS — log SVC instructions (ARM64 syscalls)
 *   MAX_EVENTS     — limit output volume
 */

'use strict';

// ═══════════════════════════════════════════════
// ██  CONFIGURE THESE  ██
var TARGET_MODULE  = 'libnative-lib.so';
var TARGET_EXPORT  = '';           // Empty = trace from module load
var TRACE_CALLS    = true;
var TRACE_SYSCALLS = true;
var MAX_EVENTS     = 5000;
// ═══════════════════════════════════════════════

var TAG = '[Stalker]';
var eventCount = 0;

function waitForModule(name, callback) {
    var mod = Process.findModuleByName(name);
    if (mod) {
        callback(mod);
        return;
    }
    console.log(TAG + ' Waiting for ' + name + ' to load...');
    var interval = setInterval(function () {
        mod = Process.findModuleByName(name);
        if (mod) {
            clearInterval(interval);
            callback(mod);
        }
    }, 500);
}

function traceModule(targetModule) {
    console.log(TAG + ' Module found: ' + targetModule.name + ' at ' + targetModule.base);
    console.log(TAG + ' Size: ' + targetModule.size + ' bytes');

    var moduleBase = targetModule.base;
    var moduleEnd = moduleBase.add(targetModule.size);

    if (TARGET_EXPORT) {
        // Trace specific exported function
        var exportAddr = targetModule.findExportByName(TARGET_EXPORT);
        if (!exportAddr) {
            console.log(TAG + ' Export not found: ' + TARGET_EXPORT);
            console.log(TAG + ' Available exports:');
            targetModule.enumerateExports().slice(0, 20).forEach(function (exp) {
                console.log(TAG + '   ' + exp.name + ' @ ' + exp.address);
            });
            return;
        }

        console.log(TAG + ' Hooking export: ' + TARGET_EXPORT + ' @ ' + exportAddr);
        Interceptor.attach(exportAddr, {
            onEnter: function (args) {
                console.log(TAG + ' === Tracing ' + TARGET_EXPORT + ' ===');
                eventCount = 0;
                startStalker(Process.getCurrentThreadId(), moduleBase, moduleEnd);
            },
            onLeave: function (retval) {
                Stalker.unfollow(Process.getCurrentThreadId());
                console.log(TAG + ' === End trace (' + eventCount + ' events) ===');
            }
        });
    } else {
        // Auto-trace: hook all exports
        console.log(TAG + ' Tracing all calls within module bounds');
        var exports = targetModule.enumerateExports();
        console.log(TAG + ' Found ' + exports.length + ' exports');

        exports.forEach(function (exp) {
            if (exp.type === 'function') {
                try {
                    Interceptor.attach(exp.address, {
                        onEnter: function () {
                            if (eventCount < MAX_EVENTS) {
                                var offset = exp.address.sub(moduleBase);
                                console.log(TAG + ' CALL ' + exp.name + ' @ +0x' + offset.toString(16));
                            }
                        }
                    });
                } catch (e) { }
            }
        });
    }
}

function startStalker(threadId, moduleBase, moduleEnd) {
    Stalker.follow(threadId, {
        transform: function (iterator) {
            var instruction;
            while ((instruction = iterator.next()) !== null) {
                var addr = instruction.address;

                // Only trace within our target module
                if (addr.compare(moduleBase) >= 0 && addr.compare(moduleEnd) < 0) {
                    var offset = addr.sub(moduleBase);

                    if (TRACE_CALLS && (instruction.mnemonic === 'bl' || instruction.mnemonic === 'blr')) {
                        iterator.putCallout(function (context) {
                            if (eventCount >= MAX_EVENTS) return;
                            eventCount++;
                            var pc = ptr(context.pc);
                            var off = pc.sub(moduleBase);
                            var target = ptr(context.x0); // ARM64: first arg
                            console.log(TAG + ' +0x' + off.toString(16) + ' CALL → target in x30: ' + ptr(context.lr));
                        });
                    }

                    if (TRACE_SYSCALLS && instruction.mnemonic === 'svc') {
                        iterator.putCallout(function (context) {
                            if (eventCount >= MAX_EVENTS) return;
                            eventCount++;
                            var pc = ptr(context.pc);
                            var off = pc.sub(moduleBase);
                            var syscallNum = context.x8.toInt32();
                            var arg0 = context.x0;
                            var arg1 = context.x1;
                            console.log(TAG + ' +0x' + off.toString(16) +
                                ' SVC #' + syscallNum +
                                ' x0=' + arg0 + ' x1=' + arg1);

                            // Decode common syscalls
                            var names = {
                                56: 'openat', 57: 'close', 63: 'read', 64: 'write',
                                172: 'getpid', 174: 'getuid', 220: 'clone',
                                221: 'execve', 260: 'wait4', 117: 'ptrace',
                                233: 'mprotect'
                            };
                            if (names[syscallNum]) {
                                console.log(TAG + '         → ' + names[syscallNum]);
                            }
                        });
                    }
                }

                iterator.keep();
            }
        }
    });
}

// Entry point
waitForModule(TARGET_MODULE, function (mod) {
    traceModule(mod);
    console.log(TAG + ' === Stalker Tracer ready ===');
});
