/**
 * Root Detection Bypass — Universal
 * Hooks: su binary checks, Build.TAGS, RootBeer, SafetyNet, file existence, shell commands
 * Usage: frida -U -f <pkg> -l root-bypass.js
 */

'use strict';

Java.perform(function () {
    var TAG = '[Root-Bypass]';

    // --- 1. File.exists() — block root indicator paths ---
    var rootPaths = [
        '/system/app/Superuser.apk', '/system/xbin/su', '/system/bin/su',
        '/sbin/su', '/data/local/xbin/su', '/data/local/bin/su', '/data/local/su',
        '/system/sd/xbin/su', '/system/bin/failsafe/su', '/su/bin/su',
        '/system/app/SuperSU.apk', '/system/app/SuperSU',
        '/system/app/Superuser', '/system/etc/init.d/99telesu',
        '/data/data/com.noshufou.android.su', '/data/data/eu.chainfire.supersu',
        '/data/data/com.koushikdutta.superuser', '/data/data/com.thirdparty.superuser',
        '/data/data/com.topjohnwu.magisk', '/system/xbin/daemonsu',
        '/system/etc/.installed_su_daemon', '/dev/.superuser.img'
    ];

    try {
        var File = Java.use('java.io.File');
        File.exists.implementation = function () {
            var path = this.getAbsolutePath();
            for (var i = 0; i < rootPaths.length; i++) {
                if (path === rootPaths[i]) {
                    console.log(TAG + ' File.exists(' + path + ') → false');
                    return false;
                }
            }
            return this.exists();
        };
        console.log(TAG + ' File.exists hooked');
    } catch (e) {
        console.log(TAG + ' File.exists skip: ' + e.message);
    }

    // --- 2. Build.TAGS ---
    try {
        var Build = Java.use('android.os.Build');
        var tagsField = Build.class.getDeclaredField('TAGS');
        tagsField.setAccessible(true);
        tagsField.set(null, Java.use('java.lang.String').$new('release-keys'));
        console.log(TAG + ' Build.TAGS set to release-keys');
    } catch (e) {
        console.log(TAG + ' Build.TAGS skip: ' + e.message);
    }

    // --- 3. Runtime.exec — block su/which commands ---
    var suPatterns = ['/su', 'su ', 'su\n', 'which su', 'type su'];
    function hasSuCommand(cmd) {
        return suPatterns.some(function (p) { return cmd.indexOf(p) !== -1; });
    }
    try {
        var Runtime = Java.use('java.lang.Runtime');
        Runtime.exec.overload('[Ljava.lang.String;').implementation = function (cmdArray) {
            var cmd = cmdArray.join ? Array.prototype.join.call(cmdArray, ' ') : String(cmdArray[0]);
            if (hasSuCommand(cmd) || cmd.indexOf('which') !== -1 || cmd.indexOf('busybox') !== -1) {
                console.log(TAG + ' Runtime.exec(' + cmd + ') → blocked');
                throw Java.use('java.io.IOException').$new('Permission denied');
            }
            return this.exec(cmdArray);
        };
        Runtime.exec.overload('java.lang.String').implementation = function (cmd) {
            if (hasSuCommand(cmd) || cmd.indexOf('which') !== -1 || cmd.indexOf('busybox') !== -1) {
                console.log(TAG + ' Runtime.exec(' + cmd + ') → blocked');
                throw Java.use('java.io.IOException').$new('Permission denied');
            }
            return this.exec(cmd);
        };
        console.log(TAG + ' Runtime.exec hooked');
    } catch (e) {
        console.log(TAG + ' Runtime.exec skip: ' + e.message);
    }

    // --- 4. PackageManager — hide root apps ---
    var rootPackages = [
        'com.topjohnwu.magisk', 'eu.chainfire.supersu',
        'com.noshufou.android.su', 'com.thirdparty.superuser',
        'com.koushikdutta.superuser', 'com.zachspong.temprootremovejb',
        'com.ramdroid.appquarantine', 'com.devadvance.rootcloak',
        'de.robv.android.xposed.installer', 'org.lsposed.manager',
        'com.saurik.substrate', 'com.amphoras.hidemyroot'
    ];

    try {
        var PackageManager = Java.use('android.app.ApplicationPackageManager');
        PackageManager.getPackageInfo.overload('java.lang.String', 'int').implementation = function (pkg, flags) {
            for (var i = 0; i < rootPackages.length; i++) {
                if (pkg === rootPackages[i]) {
                    console.log(TAG + ' getPackageInfo(' + pkg + ') → NameNotFoundException');
                    throw Java.use('android.content.pm.PackageManager$NameNotFoundException').$new(pkg);
                }
            }
            return this.getPackageInfo(pkg, flags);
        };
        console.log(TAG + ' PackageManager hooked');
    } catch (e) {
        console.log(TAG + ' PackageManager skip: ' + e.message);
    }

    // --- 5. System.getProperty ro.debuggable / ro.secure ---
    try {
        var SystemProperties = Java.use('android.os.SystemProperties');
        SystemProperties.get.overload('java.lang.String').implementation = function (key) {
            if (key === 'ro.debuggable' || key === 'ro.build.selinux') {
                console.log(TAG + ' SystemProperties.get(' + key + ') → 0');
                return '0';
            }
            if (key === 'ro.secure') {
                console.log(TAG + ' SystemProperties.get(' + key + ') → 1');
                return '1';
            }
            return this.get(key);
        };
        console.log(TAG + ' SystemProperties hooked');
    } catch (e) {
        console.log(TAG + ' SystemProperties skip: ' + e.message);
    }

    // --- 6. RootBeer library ---
    try {
        var RootBeer = Java.use('com.scottyab.rootbeer.RootBeer');
        RootBeer.isRooted.implementation = function () {
            console.log(TAG + ' RootBeer.isRooted() → false');
            return false;
        };
        RootBeer.isRootedWithoutBusyBoxCheck.implementation = function () {
            return false;
        };
        console.log(TAG + ' RootBeer hooked');
    } catch (e) { }

    // --- 7. SafetyNet / Play Integrity ---
    try {
        var SafetyNet = Java.use('com.google.android.gms.safetynet.SafetyNetClient');
        SafetyNet.attest.implementation = function (nonce, apiKey) {
            console.log(TAG + ' SafetyNet.attest() → intercepted (check may still fail server-side)');
            return this.attest(nonce, apiKey);
        };
        console.log(TAG + ' SafetyNet intercepted (logging only)');
    } catch (e) { }

    // --- 8. Native fopen — block /proc/mounts, /proc/self/maps su check ---
    try {
        var libc = Process.findModuleByName('libc.so');
        var fopen = libc ? libc.findExportByName('fopen') : null;
        if (fopen) {
            Interceptor.attach(fopen, {
                onEnter: function (args) {
                    this.path = args[0].readUtf8String();
                },
                onLeave: function (retval) {
                    if (this.path && (this.path.indexOf('/su') !== -1 || this.path === '/system/xbin/su')) {
                        console.log(TAG + ' Native fopen(' + this.path + ') → NULL');
                        retval.replace(ptr(0));
                    }
                }
            });
            console.log(TAG + ' Native fopen hooked');
        }
    } catch (e) {
        console.log(TAG + ' Native fopen skip: ' + e.message);
    }

    console.log(TAG + ' === Root detection bypass loaded ===');
});
