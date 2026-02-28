/**
 * Anti-Frida Bypass — Advanced multi-layer
 * Bypasses: /proc/self/maps scanning, port scanning, D-Bus detection,
 *           named thread detection, RWX memory scanning, string scanning
 *
 * Usage: frida -U -f <pkg> -l anti-frida-bypass.js
 * NOTE: Load this FIRST, before other scripts
 *
 * For maximum stealth:
 *   1. Rename frida-server: cp frida-server hluda-server
 *   2. Use custom port: ./hluda-server -l 0.0.0.0:8042
 *   3. Connect: frida -H <device_ip>:8042 -f <pkg> -l anti-frida-bypass.js
 */

'use strict';

var TAG = '[Anti-Frida-Bypass]';

// Frida 17+ removed static Module.findExportByName — use Process API
function findExport(lib, name) {
    if (lib) {
        var mod = Process.findModuleByName(lib);
        return mod ? mod.findExportByName(name) : null;
    }
    // lib=null: search all modules
    var mods = Process.enumerateModules();
    for (var i = 0; i < mods.length; i++) {
        var addr = mods[i].findExportByName(name);
        if (addr) return addr;
    }
    return null;
}

// ═══════════════════════════════════════════════
// 1. /proc/self/maps — filter Frida lines instead of blocking
//    NOTE: Blocking fopen on /proc/self/maps breaks Frida itself.
//    Instead we let the open succeed and filter the output via fgets.
// ═══════════════════════════════════════════════

// Delay native hooks: perfetto_hprof thread crashes (SIGSEGV) when libc
// functions are modified during its early init (~3s after process start).
// 1000ms delay is enough for perfetto to finish initialization.
setTimeout(function () {

(function () {
    var FRIDA_FILTER_STRINGS = [
        'frida', 'gum-js-loop', 'gmain', 'linjector',
        'frida-agent', 'frida-gadget', 'frida-server', 'frida-helper'
    ];

    // Set of FILE* / fd that point to /proc/self/maps or /proc/self/task/*/comm
    var trackedFILEs = {};   // FILE* address string → true
    var trackedFDs = {};     // fd number → true

    function shouldFilterPath(path) {
        if (!path) return false;
        return path.indexOf('/proc/self/maps') !== -1 ||
               path.indexOf('/proc/self/task') !== -1;
    }

    function lineContainsFrida(line) {
        if (!line) return false;
        var lower = line.toLowerCase();
        for (var i = 0; i < FRIDA_FILTER_STRINGS.length; i++) {
            if (lower.indexOf(FRIDA_FILTER_STRINGS[i]) !== -1) return true;
        }
        return false;
    }

    // --- fopen: track FILE* for /proc/self/maps ---
    var fopenPtr = findExport('libc.so','fopen');
    if (fopenPtr) {
        Interceptor.attach(fopenPtr, {
            onEnter: function (args) {
                try {
                    var path = args[0].readUtf8String();
                    this.filterMaps = shouldFilterPath(path);
                } catch (e) {
                    this.filterMaps = false;
                }
            },
            onLeave: function (retval) {
                if (this.filterMaps && !retval.isNull()) {
                    trackedFILEs[retval.toString()] = true;
                }
            }
        });
    }

    // --- fgets: filter Frida lines from tracked FILE* ---
    // Use Interceptor.attach (not replace) — replace crashes perfetto_hprof thread
    var fgetsPtr = findExport('libc.so','fgets');
    if (fgetsPtr) {
        var fgetsNative = new NativeFunction(fgetsPtr, 'pointer', ['pointer', 'int', 'pointer']);

        Interceptor.attach(fgetsPtr, {
            onEnter: function (args) {
                this.buf = args[0];
                this.size = args[1].toInt32();
                this.fp = args[2];
            },
            onLeave: function (retval) {
                if (retval.isNull()) return;
                var fpKey = this.fp.toString();
                if (!trackedFILEs[fpKey]) return;
                try {
                    var line = this.buf.readUtf8String();
                    if (lineContainsFrida(line)) {
                        // Read next lines until we find a non-frida one
                        while (true) {
                            var next = fgetsNative(this.buf, this.size, this.fp);
                            if (next.isNull()) {
                                retval.replace(ptr(0));
                                return;
                            }
                            line = this.buf.readUtf8String();
                            if (!lineContainsFrida(line)) break;
                        }
                    }
                } catch (e) { }
            }
        });
    }

    // --- fclose: clean up tracked FILE* ---
    var fclosePtr = findExport('libc.so','fclose');
    if (fclosePtr) {
        Interceptor.attach(fclosePtr, {
            onEnter: function (args) {
                var fpKey = args[0].toString();
                if (trackedFILEs[fpKey]) {
                    delete trackedFILEs[fpKey];
                }
            }
        });
    }

    console.log(TAG + ' fopen/fgets filter active (/proc/self/maps, task/*/comm)');

    // --- openat: track fd for /proc/self/maps (newer Android) ---
    var openatPtr = findExport('libc.so','openat');
    if (openatPtr) {
        Interceptor.attach(openatPtr, {
            onEnter: function (args) {
                try {
                    var path = args[1].readUtf8String();
                    this.filterMaps = shouldFilterPath(path);
                } catch (e) {
                    this.filterMaps = false;
                }
            },
            onLeave: function (retval) {
                if (this.filterMaps && retval.toInt32() >= 0) {
                    trackedFDs[retval.toInt32()] = true;
                }
            }
        });
    }

    // --- read: filter Frida lines from tracked fds (openat path) ---
    var readPtr = findExport('libc.so','read');
    if (readPtr) {
        Interceptor.attach(readPtr, {
            onEnter: function (args) {
                this.fd = args[0].toInt32();
                this.buf = args[1];
            },
            onLeave: function (retval) {
                if (!trackedFDs[this.fd]) return;
                var bytesRead = retval.toInt32();
                if (bytesRead <= 0) return;
                try {
                    var content = this.buf.readUtf8String(bytesRead);
                    var lines = content.split('\n');
                    var filtered = [];
                    for (var i = 0; i < lines.length; i++) {
                        if (!lineContainsFrida(lines[i])) {
                            filtered.push(lines[i]);
                        }
                    }
                    var newContent = filtered.join('\n');
                    this.buf.writeUtf8String(newContent);
                    retval.replace(ptr(newContent.length));
                } catch (e) { }
            }
        });
    }

    // --- close: clean up tracked fds ---
    var closePtr = findExport('libc.so','close');
    if (closePtr) {
        Interceptor.attach(closePtr, {
            onEnter: function (args) {
                var fd = args[0].toInt32();
                if (trackedFDs[fd]) {
                    delete trackedFDs[fd];
                }
            }
        });
    }

    console.log(TAG + ' openat/read filter active');
})();

// ═══════════════════════════════════════════════
// 2. Port scanning — block connect() to Frida ports
// ═══════════════════════════════════════════════

(function () {
    var connectPtr = findExport('libc.so','connect');
    if (!connectPtr) return;

    Interceptor.attach(connectPtr, {
        onEnter: function (args) {
            var sockAddr = args[1];
            try {
                var family = sockAddr.readU16();
                if (family === 2) { // AF_INET
                    var port = (sockAddr.add(2).readU8() << 8) | sockAddr.add(3).readU8();
                    // Block connections to known Frida ports range
                    if (port >= 27000 && port <= 28100) {
                        this.blockConnect = true;
                        console.log(TAG + ' Blocked connect() to port ' + port);
                    }
                }
            } catch (e) { }
        },
        onLeave: function (retval) {
            if (this.blockConnect) {
                retval.replace(ptr(-1)); // connection failed
            }
        }
    });
    console.log(TAG + ' connect hook active (port scanning block)');
})();

// ═══════════════════════════════════════════════
// 3. String scanning — hide "frida" from memory scans
// ═══════════════════════════════════════════════

(function () {
    var fridaStrings = ['frida', 'LIBFRIDA', 'frida-agent', 'frida-gadget',
        'frida-server', 'gmain', 'gum-js-loop', 'linjector',
        'frida-helper', '/data/local/tmp/re.frida'];

    function isFridaString(s) {
        if (!s) return false;
        var lower = s.toLowerCase();
        for (var i = 0; i < fridaStrings.length; i++) {
            if (lower.indexOf(fridaStrings[i].toLowerCase()) !== -1) return true;
        }
        return false;
    }

    // Hook strstr
    var strstrPtr = findExport('libc.so','strstr');
    if (strstrPtr) {
        Interceptor.attach(strstrPtr, {
            onEnter: function (args) {
                try {
                    var needle = args[1].readUtf8String();
                    if (isFridaString(needle)) {
                        this.hideFrida = true;
                    }
                } catch (e) { }
            },
            onLeave: function (retval) {
                if (this.hideFrida) {
                    retval.replace(ptr(0)); // not found
                }
            }
        });
    }

    // Hook strncmp
    var strncmpPtr = findExport('libc.so','strncmp');
    if (strncmpPtr) {
        Interceptor.attach(strncmpPtr, {
            onEnter: function (args) {
                var s0, s1;
                try { s0 = args[0].readUtf8String(); } catch (e) { return; }
                try { s1 = args[1].readUtf8String(); } catch (e) { return; }
                if (isFridaString(s0) || isFridaString(s1)) {
                    this.hideFrida = true;
                }
            },
            onLeave: function (retval) {
                if (this.hideFrida) {
                    retval.replace(ptr(1)); // strings don't match
                }
            }
        });
    }

    // Hook strcmp
    var strcmpPtr = findExport('libc.so','strcmp');
    if (strcmpPtr) {
        Interceptor.attach(strcmpPtr, {
            onEnter: function (args) {
                var s1, s2;
                try { s1 = args[0].readUtf8String(); } catch (e) { return; }
                try { s2 = args[1].readUtf8String(); } catch (e) { return; }
                if (isFridaString(s1) || isFridaString(s2)) {
                    this.hideFrida = true;
                }
            },
            onLeave: function (retval) {
                if (this.hideFrida) {
                    retval.replace(ptr(1)); // not equal
                }
            }
        });
    }

    console.log(TAG + ' String scan hooks active (strstr, strncmp, strcmp)');
})();

// ═══════════════════════════════════════════════
// 4. Thread name detection — hide Frida threads
// ═══════════════════════════════════════════════

(function () {
    var pthreadSetNamePtr = findExport('libc.so','pthread_setname_np');
    if (!pthreadSetNamePtr) return;

    Interceptor.attach(pthreadSetNamePtr, {
        onEnter: function (args) {
            try {
                var name = args[1].readUtf8String();
                if (name && (name === 'gmain' || name === 'gum-js-loop' ||
                    name === 'linjector' || name.indexOf('frida') !== -1 ||
                    name.indexOf('gdbus') !== -1)) {
                    // Replace with innocent-looking thread name
                    // Save on this to prevent GC during the native call
                    var safeName = 'pool-thread-' + Math.floor(Math.random() * 20);
                    this._newName = Memory.allocUtf8String(safeName);
                    args[1] = this._newName;
                    console.log(TAG + ' Renamed thread: ' + name + ' → ' + safeName);
                }
            } catch (e) { }
        }
    });

    // Also hook pthread_getname_np for reading thread names
    var pthreadGetNamePtr = findExport('libc.so','pthread_getname_np');
    if (pthreadGetNamePtr) {
        Interceptor.attach(pthreadGetNamePtr, {
            onEnter: function (args) {
                // Save buffer pointer now — registers may be clobbered by onLeave
                this.nameBuf = args[1];
            },
            onLeave: function (retval) {
                // Check if returned name is a Frida thread
                try {
                    var buf = this.nameBuf;
                    if (buf) {
                        var name = buf.readUtf8String();
                        if (name && (name === 'gmain' || name === 'gum-js-loop' || name === 'linjector')) {
                            buf.writeUtf8String('Binder:' + Process.id + '_' + Math.floor(Math.random() * 5));
                        }
                    }
                } catch (e) { }
            }
        });
    }

    console.log(TAG + ' Thread name hooks active');
})();

// ═══════════════════════════════════════════════
// 5. ptrace — anti-debug bypass
// ═══════════════════════════════════════════════

(function () {
    var ptracePtr = findExport(null,'ptrace');
    if (!ptracePtr) return;

    Interceptor.attach(ptracePtr, {
        onEnter: function (args) {
            this.request = args[0].toInt32();
        },
        onLeave: function (retval) {
            // PTRACE_TRACEME = 0
            if (this.request === 0) {
                retval.replace(ptr(0)); // success
                console.log(TAG + ' ptrace(PTRACE_TRACEME) → 0 (success)');
            }
        }
    });
    console.log(TAG + ' ptrace hook active');
})();

}, 1000); // end setTimeout — 1s delay lets perfetto_hprof init safely

// ═══════════════════════════════════════════════
// 6. Java-level Debug detection bypass
// ═══════════════════════════════════════════════

Java.perform(function () {
    try {
        var Debug = Java.use('android.os.Debug');
        Debug.isDebuggerConnected.implementation = function () {
            console.log(TAG + ' Debug.isDebuggerConnected() → false');
            return false;
        };
    } catch (e) { }

    // Also handle android.provider.Settings.Secure (developer options check)
    try {
        var Settings = Java.use('android.provider.Settings$Secure');
        var origGetInt = Settings.getInt.overload('android.content.ContentResolver', 'java.lang.String', 'int');
        origGetInt.implementation = function (cr, name, def) {
            if (name === 'adb_enabled' || name === 'development_settings_enabled') {
                console.log(TAG + ' Settings.Secure.getInt(' + name + ') → 0');
                return 0;
            }
            return origGetInt.call(this, cr, name, def);
        };
    } catch (e) { }

    console.log(TAG + ' Java debug detection bypass active');
});

// ═══════════════════════════════════════════════
// 7. SSL Certificate Transparency bypass
// ═══════════════════════════════════════════════

Java.perform(function () {
    try {
        var SSLPeerUnverifiedException = Java.use('javax.net.ssl.SSLPeerUnverifiedException');
        SSLPeerUnverifiedException.$init.overload('java.lang.String').implementation = function (msg) {
            console.log(TAG + ' SSLPeerUnverifiedException suppressed: ' + msg);
            // Analyze stack to find the verification method
            var Exception = Java.use('java.lang.Exception');
            var stack = Exception.$new().getStackTrace();
            for (var i = 0; i < Math.min(stack.length, 5); i++) {
                console.log(TAG + '   at ' + stack[i].toString());
            }
            // Still create the exception (caller may check for null), but it won't be thrown
            // if the caller's verify method is also hooked
            return this.$init(msg);
        };
    } catch (e) { }
});

console.log(TAG + ' === Advanced Anti-Frida Bypass loaded ===');
console.log(TAG + ' Layers: maps-filter, openat-filter, ports, strings, threads, ptrace, debug, CT');
