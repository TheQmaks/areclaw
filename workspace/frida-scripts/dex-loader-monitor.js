/**
 * DEX Loader Monitor — Catches runtime code loading
 * Hooks: DexClassLoader, InMemoryDexClassLoader, DexFile, PathClassLoader
 * Critical for packed apps, plugin frameworks, and dynamic feature delivery
 *
 * Usage: frida -U -f <pkg> -l dex-loader-monitor.js
 *
 * When DEX loading is detected, dumps the DEX to /data/local/tmp/ for analysis
 */

'use strict';

var TAG = '[DEX-Loader]';

function dumpDexFromPath(path) {
    try {
        if (path && (path.indexOf('.dex') !== -1 || path.indexOf('.jar') !== -1 || path.indexOf('.apk') !== -1)) {
            var filename = path.split('/').pop();
            var outPath = '/data/local/tmp/dumped_' + Date.now() + '_' + filename;
            var File = Java.use('java.io.File');
            var src = File.$new(path);
            if (src.exists()) {
                // Copy file using streams
                var FileInputStream = Java.use('java.io.FileInputStream');
                var FileOutputStream = Java.use('java.io.FileOutputStream');
                var fis = FileInputStream.$new(src);
                var fos = FileOutputStream.$new(outPath);
                var buf = Java.array('byte', new Array(4096).fill(0));
                var len;
                while ((len = fis.read(buf)) > 0) {
                    fos.write(buf, 0, len);
                }
                fis.close();
                fos.close();
                console.log(TAG + ' DUMPED: ' + path + ' → ' + outPath);
                return outPath;
            }
        }
    } catch (e) {
        console.log(TAG + ' Dump failed: ' + e.message);
    }
    return null;
}

function stackTrace(depth) {
    try {
        var stack = Java.use('java.lang.Exception').$new().getStackTrace();
        var lines = [];
        for (var i = 0; i < Math.min(stack.length, depth || 8); i++) {
            lines.push('  at ' + stack[i].toString());
        }
        return lines.join('\n');
    } catch (e) { return ''; }
}

Java.perform(function () {

    // --- 1. DexClassLoader ---
    try {
        var DexClassLoader = Java.use('dalvik.system.DexClassLoader');
        DexClassLoader.$init.implementation = function (dexPath, optimizedDir, librarySearchPath, parent) {
            console.log(TAG + ' ████ DexClassLoader ████');
            console.log(TAG + ' DEX path: ' + dexPath);
            console.log(TAG + ' Optimized dir: ' + optimizedDir);
            console.log(TAG + ' Library path: ' + librarySearchPath);
            console.log(TAG + ' Stack:\n' + stackTrace(12));
            dumpDexFromPath(dexPath);
            return this.$init(dexPath, optimizedDir, librarySearchPath, parent);
        };
        console.log(TAG + ' DexClassLoader hooked');
    } catch (e) {
        console.log(TAG + ' DexClassLoader skip: ' + e.message);
    }

    // --- 2. InMemoryDexClassLoader (Android 8+) ---
    try {
        var InMemoryDexClassLoader = Java.use('dalvik.system.InMemoryDexClassLoader');
        InMemoryDexClassLoader.$init.overload('java.nio.ByteBuffer', 'java.lang.ClassLoader').implementation = function (buffer, parent) {
            console.log(TAG + ' ████ InMemoryDexClassLoader (ByteBuffer) ████');
            console.log(TAG + ' Buffer size: ' + buffer.remaining() + ' bytes');
            console.log(TAG + ' Stack:\n' + stackTrace(12));

            // Dump the buffer contents
            try {
                var remaining = buffer.remaining();
                var bytes = Java.array('byte', new Array(remaining).fill(0));
                var pos = buffer.position();
                buffer.get(bytes);
                buffer.position(pos); // restore position

                var outPath = '/data/local/tmp/inmemory_dex_' + Date.now() + '.dex';
                var FileOutputStream = Java.use('java.io.FileOutputStream');
                var fos = FileOutputStream.$new(outPath);
                fos.write(bytes);
                fos.close();
                console.log(TAG + ' DUMPED in-memory DEX: ' + outPath);
            } catch (e) {
                console.log(TAG + ' In-memory dump failed: ' + e.message);
            }

            return this.$init(buffer, parent);
        };
        console.log(TAG + ' InMemoryDexClassLoader hooked');
    } catch (e) {
        console.log(TAG + ' InMemoryDexClassLoader skip: ' + e.message);
    }

    // --- 3. DexFile.loadDex (legacy) ---
    try {
        var DexFile = Java.use('dalvik.system.DexFile');
        DexFile.loadDex.implementation = function (sourcePathName, outputPathName, flags) {
            console.log(TAG + ' ████ DexFile.loadDex ████');
            console.log(TAG + ' Source: ' + sourcePathName);
            console.log(TAG + ' Output: ' + outputPathName);
            console.log(TAG + ' Flags: ' + flags);
            console.log(TAG + ' Stack:\n' + stackTrace(12));
            dumpDexFromPath(sourcePathName);
            return this.loadDex(sourcePathName, outputPathName, flags);
        };
        console.log(TAG + ' DexFile.loadDex hooked');
    } catch (e) { }

    // --- 4. PathClassLoader ---
    try {
        var PathClassLoader = Java.use('dalvik.system.PathClassLoader');
        PathClassLoader.$init.overload('java.lang.String', 'java.lang.ClassLoader').implementation = function (dexPath, parent) {
            console.log(TAG + ' PathClassLoader: ' + dexPath);
            return this.$init(dexPath, parent);
        };
        console.log(TAG + ' PathClassLoader hooked');
    } catch (e) { }

    // --- 5. System.loadLibrary / System.load (native lib loading) ---
    try {
        var System = Java.use('java.lang.System');
        System.loadLibrary.implementation = function (libName) {
            console.log(TAG + ' System.loadLibrary("' + libName + '")');
            console.log(TAG + ' Stack:\n' + stackTrace(8));
            this.loadLibrary(libName);
        };
        System.load.implementation = function (path) {
            console.log(TAG + ' System.load("' + path + '")');
            console.log(TAG + ' Stack:\n' + stackTrace(8));
            this.load(path);
        };
        console.log(TAG + ' System.loadLibrary/load hooked');
    } catch (e) { }

    // --- 6. Runtime.loadLibrary0 (internal) ---
    try {
        var Runtime = Java.use('java.lang.Runtime');
        Runtime.loadLibrary0.implementation = function (loader, libname) {
            console.log(TAG + ' Runtime.loadLibrary0: ' + libname);
            return this.loadLibrary0(loader, libname);
        };
    } catch (e) { }

    console.log(TAG + ' === DEX Loader Monitor loaded ===');
});
