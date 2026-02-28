/**
 * SSL Pinning Bypass — Universal
 * Hooks: TrustManager, OkHttp CertificatePinner, X509TrustManager, Conscrypt, custom pins
 * Usage: frida -U -f <pkg> -l ssl-bypass.js
 */

'use strict';

Java.perform(function () {
    var TAG = '[SSL-Bypass]';

    // --- 1. TrustManagerFactory → empty TrustManager ---
    try {
        var TrustManagerFactory = Java.use('javax.net.ssl.TrustManagerFactory');
        var emptyTrustManager = Java.registerClass({
            name: 'com.frida.BypassTrustManager',
            implements: [Java.use('javax.net.ssl.X509TrustManager')],
            methods: {
                checkClientTrusted: function (chain, authType) { },
                checkServerTrusted: function (chain, authType) { },
                getAcceptedIssuers: function () {
                    return [];
                }
            }
        });
        TrustManagerFactory.getTrustManagers.implementation = function () {
            console.log(TAG + ' TrustManagerFactory.getTrustManagers() → bypassed');
            return [emptyTrustManager.$new()];
        };
        console.log(TAG + ' TrustManagerFactory hooked');
    } catch (e) {
        console.log(TAG + ' TrustManagerFactory skip: ' + e.message);
    }

    // --- 2. SSLContext.init → null TrustManagers ---
    try {
        var SSLContext = Java.use('javax.net.ssl.SSLContext');
        SSLContext.init.overload('[Ljavax.net.ssl.KeyManager;', '[Ljavax.net.ssl.TrustManager;', 'java.security.SecureRandom').implementation = function (km, tm, sr) {
            console.log(TAG + ' SSLContext.init() → injecting permissive TrustManager');
            var BypassTM = Java.use('com.frida.BypassTrustManager');
            this.init(km, [BypassTM.$new()], sr);
        };
        console.log(TAG + ' SSLContext.init hooked');
    } catch (e) {
        console.log(TAG + ' SSLContext.init skip: ' + e.message);
    }

    // --- 3. OkHttp3 CertificatePinner ---
    try {
        var CertificatePinner = Java.use('okhttp3.CertificatePinner');
        CertificatePinner.check.overload('java.lang.String', 'java.util.List').implementation = function (hostname, peerCertificates) {
            console.log(TAG + ' OkHttp3 CertificatePinner.check(' + hostname + ') → bypassed');
        };
        console.log(TAG + ' OkHttp3 CertificatePinner hooked');
    } catch (e) {
        console.log(TAG + ' OkHttp3 CertificatePinner skip: ' + e.message);
    }

    // --- 3b. OkHttp3 CertificatePinner (string overload) ---
    try {
        var CertificatePinner = Java.use('okhttp3.CertificatePinner');
        CertificatePinner.check.overload('java.lang.String', '[Ljava.security.cert.Certificate;').implementation = function (hostname, certs) {
            console.log(TAG + ' OkHttp3 CertificatePinner.check(certs) → bypassed');
        };
    } catch (e) { }

    // --- 4. Conscrypt / Android platform TrustManager ---
    try {
        var PlatformTM = Java.use('com.android.org.conscrypt.TrustManagerImpl');
        PlatformTM.verifyChain.implementation = function (untrustedChain, trustAnchorChain, host, clientAuth, ocspData, tlsSctData) {
            console.log(TAG + ' Conscrypt TrustManagerImpl.verifyChain(' + host + ') → bypassed');
            return untrustedChain;
        };
        console.log(TAG + ' Conscrypt TrustManagerImpl hooked');
    } catch (e) {
        console.log(TAG + ' Conscrypt skip: ' + e.message);
    }

    // --- 5. WebViewClient SSL errors ---
    try {
        var WebViewClient = Java.use('android.webkit.WebViewClient');
        WebViewClient.onReceivedSslError.implementation = function (view, handler, error) {
            console.log(TAG + ' WebViewClient.onReceivedSslError → proceeding');
            handler.proceed();
        };
        console.log(TAG + ' WebViewClient SSL hooked');
    } catch (e) {
        console.log(TAG + ' WebViewClient skip: ' + e.message);
    }

    // --- 6. HttpsURLConnection default hostname verifier ---
    try {
        var HttpsURLConnection = Java.use('javax.net.ssl.HttpsURLConnection');
        var AllowAllHostnameVerifier = Java.registerClass({
            name: 'com.frida.AllowAllHostnameVerifier',
            implements: [Java.use('javax.net.ssl.HostnameVerifier')],
            methods: {
                verify: function (hostname, session) {
                    return true;
                }
            }
        });
        HttpsURLConnection.setDefaultHostnameVerifier(AllowAllHostnameVerifier.$new());
        console.log(TAG + ' Default HostnameVerifier set to allow-all');
    } catch (e) {
        console.log(TAG + ' HostnameVerifier skip: ' + e.message);
    }

    // --- 7. Network Security Config (Android 7+) ---
    try {
        var NetworkSecurityConfig = Java.use('android.security.net.config.NetworkSecurityConfig');
        NetworkSecurityConfig.isCleartextTrafficPermitted.implementation = function () {
            console.log(TAG + ' NetworkSecurityConfig.isCleartextTrafficPermitted → true');
            return true;
        };
        console.log(TAG + ' NetworkSecurityConfig hooked');
    } catch (e) {
        console.log(TAG + ' NetworkSecurityConfig skip: ' + e.message);
    }

    // --- 8. TrustKit (popular pinning library) ---
    try {
        var TrustKit = Java.use('com.datatheorem.android.trustkit.pinning.OkHostnameVerifier');
        TrustKit.verify.overload('java.lang.String', 'javax.net.ssl.SSLSession').implementation = function (hostname, session) {
            console.log(TAG + ' TrustKit verify(' + hostname + ') → true');
            return true;
        };
        console.log(TAG + ' TrustKit hooked');
    } catch (e) { }

    console.log(TAG + ' === SSL Pinning bypass loaded ===');
});
