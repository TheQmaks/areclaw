/**
 * Crypto Tracer — Cipher, MessageDigest, MAC, KeySpec
 * Hooks: Cipher.init/doFinal, MessageDigest.digest, SecretKeySpec, KeyGenerator, Mac, IvParameterSpec
 * Logs algorithm, key (hex), IV (hex), input/output data
 * Usage: frida -U -f <pkg> -l crypto-tracer.js
 */

'use strict';

Java.perform(function () {
    var TAG = '[Crypto-Tracer]';

    function toHex(byteArray) {
        if (!byteArray) return null;
        try {
            var bytes = Java.array('byte', byteArray);
            var hex = '';
            for (var i = 0; i < bytes.length; i++) {
                var b = (bytes[i] & 0xff).toString(16);
                hex += (b.length === 1 ? '0' : '') + b;
            }
            return hex;
        } catch (e) {
            return '<error>';
        }
    }

    function toUtf8(byteArray) {
        try {
            return Java.use('java.lang.String').$new(byteArray, 'UTF-8');
        } catch (e) {
            return null;
        }
    }

    function stackTrace() {
        try {
            var Exception = Java.use('java.lang.Exception');
            var stack = Exception.$new().getStackTrace();
            var lines = [];
            for (var i = 0; i < Math.min(stack.length, 8); i++) {
                lines.push('  at ' + stack[i].toString());
            }
            return lines.join('\n');
        } catch (e) {
            return '';
        }
    }

    // --- 1. SecretKeySpec — key material ---
    try {
        var SecretKeySpec = Java.use('javax.crypto.spec.SecretKeySpec');
        SecretKeySpec.$init.overload('[B', 'java.lang.String').implementation = function (key, algo) {
            console.log('[CRYPTO] SecretKeySpec: algorithm=' + algo + ' key=' + toHex(key));
            console.log(stackTrace());
            return this.$init(key, algo);
        };
        console.log(TAG + ' SecretKeySpec hooked');
    } catch (e) {
        console.log(TAG + ' SecretKeySpec skip: ' + e.message);
    }

    // --- 2. IvParameterSpec — IV material ---
    try {
        var IvParameterSpec = Java.use('javax.crypto.spec.IvParameterSpec');
        IvParameterSpec.$init.overload('[B').implementation = function (iv) {
            console.log('[CRYPTO] IvParameterSpec: iv=' + toHex(iv));
            return this.$init(iv);
        };
        console.log(TAG + ' IvParameterSpec hooked');
    } catch (e) {
        console.log(TAG + ' IvParameterSpec skip: ' + e.message);
    }

    // --- 3. Cipher.init ---
    try {
        var Cipher = Java.use('javax.crypto.Cipher');
        Cipher.init.overload('int', 'java.security.Key').implementation = function (mode, key) {
            var modeStr = mode === 1 ? 'ENCRYPT' : mode === 2 ? 'DECRYPT' : 'mode=' + mode;
            console.log('[CRYPTO] Cipher.init: ' + modeStr + ' algorithm=' + this.getAlgorithm() + ' key=' + toHex(key.getEncoded()));
            return this.init(mode, key);
        };

        Cipher.init.overload('int', 'java.security.Key', 'java.security.spec.AlgorithmParameterSpec').implementation = function (mode, key, params) {
            var modeStr = mode === 1 ? 'ENCRYPT' : mode === 2 ? 'DECRYPT' : 'mode=' + mode;
            var iv = null;
            try { iv = toHex(Java.cast(params, Java.use('javax.crypto.spec.IvParameterSpec')).getIV()); } catch (e) { }
            console.log('[CRYPTO] Cipher.init: ' + modeStr + ' algorithm=' + this.getAlgorithm() + ' key=' + toHex(key.getEncoded()) + ' iv=' + iv);
            return this.init(mode, key, params);
        };
        console.log(TAG + ' Cipher.init hooked');
    } catch (e) {
        console.log(TAG + ' Cipher.init skip: ' + e.message);
    }

    // --- 4. Cipher.doFinal ---
    try {
        var Cipher = Java.use('javax.crypto.Cipher');
        Cipher.doFinal.overload('[B').implementation = function (data) {
            var result = this.doFinal(data);
            console.log('[CRYPTO] Cipher.doFinal: algorithm=' + this.getAlgorithm() +
                ' input(' + data.length + ')=' + toHex(data).substring(0, 64) + (data.length > 32 ? '...' : '') +
                ' output(' + result.length + ')=' + toHex(result).substring(0, 64) + (result.length > 32 ? '...' : ''));
            var plaintext = toUtf8(data);
            if (plaintext && plaintext.length > 0 && plaintext.length < 500) {
                console.log('[CRYPTO]   plaintext: ' + plaintext);
            }
            console.log(stackTrace());
            return result;
        };
        console.log(TAG + ' Cipher.doFinal hooked');
    } catch (e) {
        console.log(TAG + ' Cipher.doFinal skip: ' + e.message);
    }

    // --- 5. MessageDigest ---
    try {
        var MessageDigest = Java.use('java.security.MessageDigest');
        MessageDigest.digest.overload('[B').implementation = function (data) {
            var result = this.digest(data);
            console.log('[CRYPTO] MessageDigest: algorithm=' + this.getAlgorithm() +
                ' input=' + toHex(data).substring(0, 64) + (data.length > 32 ? '...' : '') +
                ' hash=' + toHex(result));
            var plaintext = toUtf8(data);
            if (plaintext && plaintext.length > 0 && plaintext.length < 500) {
                console.log('[CRYPTO]   input_text: ' + plaintext);
            }
            return result;
        };

        MessageDigest.digest.overload().implementation = function () {
            var result = this.digest();
            console.log('[CRYPTO] MessageDigest.digest(): algorithm=' + this.getAlgorithm() + ' hash=' + toHex(result));
            return result;
        };
        console.log(TAG + ' MessageDigest hooked');
    } catch (e) {
        console.log(TAG + ' MessageDigest skip: ' + e.message);
    }

    // --- 6. Mac (HMAC) ---
    try {
        var Mac = Java.use('javax.crypto.Mac');
        Mac.doFinal.overload('[B').implementation = function (data) {
            var result = this.doFinal(data);
            console.log('[CRYPTO] Mac.doFinal: algorithm=' + this.getAlgorithm() +
                ' input=' + toHex(data).substring(0, 64) +
                ' mac=' + toHex(result));
            return result;
        };
        console.log(TAG + ' Mac hooked');
    } catch (e) {
        console.log(TAG + ' Mac skip: ' + e.message);
    }

    // --- 7. KeyGenerator ---
    try {
        var KeyGenerator = Java.use('javax.crypto.KeyGenerator');
        KeyGenerator.generateKey.implementation = function () {
            var key = this.generateKey();
            console.log('[CRYPTO] KeyGenerator: algorithm=' + this.getAlgorithm() + ' key=' + toHex(key.getEncoded()));
            console.log(stackTrace());
            return key;
        };
        console.log(TAG + ' KeyGenerator hooked');
    } catch (e) {
        console.log(TAG + ' KeyGenerator skip: ' + e.message);
    }

    console.log(TAG + ' === Crypto Tracer loaded ===');
});
