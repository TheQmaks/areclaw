# MASTG Test Case Mapping

Cross-reference between OWASP Mobile Top 10 (2024), MASVS categories, and MASTG test cases. Each entry shows which areclaw tools and Frida scripts provide coverage.

## How to Use

During Phase 6 (Security Assessment), reference this mapping to ensure comprehensive test coverage. Each MASTG test case ID links to the specific testing methodology at [mas.owasp.org](https://mas.owasp.org/MASTG/).

---

## M1: Improper Credential Usage → MASVS-STORAGE, MASVS-CRYPTO

| MASTG Test | Title | areclaw Coverage |
|---|---|---|
| MASTG-TEST-0001 | Testing Local Storage for Sensitive Data | `shared-prefs-monitor.js`, adb data inspection, grep patterns |
| MASTG-TEST-0207 | Runtime Storage of Unencrypted Data in App Sandbox | `shared-prefs-monitor.js`, adb run-as file inspection |
| MASTG-TEST-0287 | Sensitive Data Stored Unencrypted via SharedPreferences API | `shared-prefs-monitor.js`, grep for getSharedPreferences |
| MASTG-TEST-0304 | Sensitive Data Stored Unencrypted via SQLite | adb sqlite3 inspection, grep for SQLiteDatabase |
| MASTG-TEST-0305 | Sensitive Data Stored Unencrypted via DataStore | grep for DataStore APIs |
| MASTG-TEST-0306 | Sensitive Data Stored Unencrypted via Android Room DB | grep for @Entity/@Dao annotations |
| MASTG-TEST-0212 | Use of Hardcoded Cryptographic Keys in Code | `crypto-tracer.js`, trufflehog, apkleaks, grep patterns (28+ key types) |

**Key Tools:** apkleaks, trufflehog, `workspace/frida-scripts/crypto-tracer.js`, `workspace/frida-scripts/shared-prefs-monitor.js`

---

## M2: Inadequate Supply Chain Security → MASVS-CODE

| MASTG Test | Title | areclaw Coverage |
|---|---|---|
| MASTG-TEST-0042 | Checking for Weaknesses in Third Party Libraries | grep for library versions, CVE cross-reference |
| MASTG-TEST-0272 | Identify Dependencies with Known Vulnerabilities | Dependency version extraction + NVD/Snyk lookup |
| MASTG-TEST-0274 | Dependencies with Known Vulnerabilities in App's SBOM | build.gradle/pom.xml analysis |

**Key Tools:** grep patterns, manual CVE cross-reference

---

## M3: Insecure Authentication/Authorization → MASVS-AUTH, MASVS-NETWORK

| MASTG Test | Title | areclaw Coverage |
|---|---|---|
| MASTG-TEST-0017 | Testing Confirm Credentials | grep for BiometricPrompt/KeyguardManager, `api-tracer.js` |
| MASTG-TEST-0018 | Testing Biometric Authentication | grep for BiometricPrompt/FingerprintManager |
| MASTG-TEST-0326 | References to APIs Allowing Fallback to Non-Biometric | grep for setAllowedAuthenticators |
| MASTG-TEST-0327 | References to APIs for Event-Bound Biometric Auth | grep for setUserAuthenticationRequired |
| MASTG-TEST-0328 | References to APIs Detecting Biometric Enrollment Changes | grep for setInvalidatedByBiometricEnrollment |
| MASTG-TEST-0329 | References to APIs Enforcing Auth without User Action | grep for setNegativeButtonText absence |
| MASTG-TEST-0330 | References to APIs for Keys with Extended Validity | grep for setUserAuthenticationValidityDurationSeconds |
| MASTG-TEST-0022 | Testing Custom Certificate Stores and Certificate Pinning | `ssl-bypass.js`, network_security_config.xml analysis |

**Key Tools:** `workspace/frida-scripts/ssl-bypass.js`, `workspace/frida-scripts/http-logger.js`, `workspace/frida-scripts/api-tracer.js`, grep patterns

---

## M4: Insufficient Input/Output Validation → MASVS-CODE, MASVS-PLATFORM

| MASTG Test | Title | areclaw Coverage |
|---|---|---|
| MASTG-TEST-0025 | Testing for Injection Flaws | SQL injection payloads, `content query` testing |
| MASTG-TEST-0027 | Testing for URL Loading in WebViews | `webview-interceptor.js`, grep for loadUrl/evaluateJavascript |
| MASTG-TEST-0029 | Testing for Sensitive Functionality Exposure Through IPC | `intent-monitor.js`, adb component testing |
| MASTG-TEST-0031 | Testing JavaScript Execution in WebViews | grep for setJavaScriptEnabled, `webview-interceptor.js` |
| MASTG-TEST-0033 | Testing for Java Objects Exposed Through WebViews | grep for addJavascriptInterface, `webview-interceptor.js` |

**Key Tools:** `workspace/frida-scripts/webview-interceptor.js`, `workspace/frida-scripts/intent-monitor.js`, adb content provider testing

---

## M5: Insecure Communication → MASVS-NETWORK

| MASTG Test | Title | areclaw Coverage |
|---|---|---|
| MASTG-TEST-0019 | Testing Data Encryption on the Network | `http-logger.js`, mitmproxy, traffic analysis |
| MASTG-TEST-0020 | Testing the TLS Settings | mitmproxy TLS inspection |
| MASTG-TEST-0021 | Testing Endpoint Identity Verification | grep for HostnameVerifier, X509TrustManager |
| MASTG-TEST-0022 | Testing Certificate Pinning | `ssl-bypass.js`, network_security_config.xml |
| MASTG-TEST-0023 | Testing the Security Provider | grep for ProviderInstaller |
| MASTG-TEST-0217 | Insecure TLS Protocols Explicitly Allowed | grep for SSLv3/TLSv1.0/TLSv1.1 |
| MASTG-TEST-0218 | Insecure TLS Protocols in Network Traffic | mitmproxy traffic inspection |
| MASTG-TEST-0233 | Hardcoded HTTP URLs | grep for `http://` URLs |
| MASTG-TEST-0234 | Missing Hostname Verification with SSLSockets | grep for ALLOW_ALL_HOSTNAME_VERIFIER |
| MASTG-TEST-0235 | Android Configurations Allowing Cleartext Traffic | network_security_config.xml, manifest cleartextTrafficPermitted |
| MASTG-TEST-0236 | Cleartext Traffic Observed on Network | mitmproxy, `http-logger.js` |
| MASTG-TEST-0237 | Cross-Platform Framework Cleartext Config | Flutter/RN config analysis |
| MASTG-TEST-0238 | Runtime Use of APIs Transmitting Cleartext | `http-logger.js` runtime monitoring |
| MASTG-TEST-0242 | Missing Certificate Pinning in Network Security Config | network_security_config.xml analysis |
| MASTG-TEST-0243 | Expired Certificate Pins | Pin expiration date check |
| MASTG-TEST-0244 | Missing Certificate Pinning in Network Traffic | `ssl-bypass.js` + mitmproxy validation |
| MASTG-TEST-0282 | Unsafe Custom Trust Evaluation | grep for custom TrustManager implementations |
| MASTG-TEST-0283 | Incorrect Hostname Verification | grep for verify() returning true |
| MASTG-TEST-0284 | Incorrect SSL Error Handling in WebViews | grep for onReceivedSslError proceed() |
| MASTG-TEST-0285 | Outdated Android Version Allowing User CAs | minSdkVersion check |
| MASTG-TEST-0286 | Network Security Config Allowing User CAs | trust-anchors analysis |
| MASTG-TEST-0295 | GMS Security Provider Not Updated | grep for ProviderInstaller |

**Key Tools:** `workspace/frida-scripts/ssl-bypass.js`, `workspace/frida-scripts/http-logger.js`, mitmproxy, network_security_config.xml analysis

---

## M6: Inadequate Privacy Controls → MASVS-PRIVACY

| MASTG Test | Title | areclaw Coverage |
|---|---|---|
| MASTG-TEST-0003 | Testing Logs for Sensitive Data | grep for Log.d/Log.v/Log.i, logcat monitoring |
| MASTG-TEST-0004 | Sensitive Data Shared with Third Parties via Embedded Services | grep for analytics SDKs (Firebase, Adjust, AppsFlyer) |
| MASTG-TEST-0005 | Sensitive Data Shared via Notifications | grep for NotificationCompat, notification content |
| MASTG-TEST-0206 | Undeclared PII in Network Traffic | `http-logger.js`, mitmproxy traffic inspection |
| MASTG-TEST-0254 | Dangerous App Permissions | Manifest permission analysis |
| MASTG-TEST-0255 | Permission Requests Not Minimized | Permission-to-feature mapping analysis |
| MASTG-TEST-0256 | Missing Permission Rationale | grep for shouldShowRequestPermissionRationale |
| MASTG-TEST-0257 | Not Resetting Unused Permissions | grep for auto-revoke opt-out |
| MASTG-TEST-0318 | References to SDK APIs Handling Sensitive Data | grep for known tracker SDKs |
| MASTG-TEST-0319 | Runtime Use of SDK APIs Handling Sensitive Data | `http-logger.js` traffic to tracker domains |

**Key Tools:** `workspace/frida-scripts/http-logger.js`, mitmproxy, manifest analysis, grep patterns

---

## M7: Insufficient Binary Protections → MASVS-RESILIENCE

| MASTG Test | Title | areclaw Coverage |
|---|---|---|
| MASTG-TEST-0038 | App Properly Signed | apksigner verify, signature scheme check |
| MASTG-TEST-0039 | App is Debuggable | Manifest debuggable flag check |
| MASTG-TEST-0040 | Testing for Debugging Symbols | Native .so symbol analysis (Ghidra/r2) |
| MASTG-TEST-0041 | Debugging Code and Verbose Error Logging | grep for Log.d/BuildConfig.DEBUG |
| MASTG-TEST-0045 | Testing Root Detection | `root-bypass.js`, RootBeer/SafetyNet check |
| MASTG-TEST-0046 | Testing Anti-Debugging Detection | `anti-frida-bypass.js`, ptrace detection |
| MASTG-TEST-0047 | Testing File Integrity Checks | Repackaging test (apktool + sign + install) |
| MASTG-TEST-0048 | Testing RE Tools Detection | `anti-frida-bypass.js`, Frida/Xposed detection |
| MASTG-TEST-0049 | Testing Emulator Detection | grep for emulator detection patterns |
| MASTG-TEST-0050 | Testing Runtime Integrity Checks | Runtime instrumentation response testing |
| MASTG-TEST-0051 | Testing Obfuscation | apkid, jadx class name analysis |
| MASTG-TEST-0222 | Position Independent Code Not Enabled | readelf PIE check on native libs |
| MASTG-TEST-0223 | Stack Canaries Not Enabled | readelf stack canary check |
| MASTG-TEST-0224 | Usage of Insecure Signature Version | apksigner verify --print-certs |
| MASTG-TEST-0225 | Insecure Signature Key Size | Certificate key size check |
| MASTG-TEST-0226 | Debuggable Flag in AndroidManifest | Manifest analysis |
| MASTG-TEST-0227 | Debugging Enabled for WebViews | grep for setWebContentsDebuggingEnabled |
| MASTG-TEST-0288 | Debugging Symbols in Native Binaries | file/readelf on .so files |
| MASTG-TEST-0324 | References to Root Detection Mechanisms | grep for root detection patterns |
| MASTG-TEST-0325 | Runtime Use of Root Detection | `root-bypass.js` testing |

**Key Tools:** apkid, `workspace/frida-scripts/root-bypass.js`, `workspace/frida-scripts/anti-frida-bypass.js`, apktool (repackaging test), Ghidra/r2

---

## M8: Security Misconfiguration → MASVS-PLATFORM

| MASTG Test | Title | areclaw Coverage |
|---|---|---|
| MASTG-TEST-0007 | Sensitive Data Exposed via IPC | `intent-monitor.js`, adb component testing |
| MASTG-TEST-0008 | Sensitive Data Disclosure Through UI | grep for password visibility, `ui_explorer.py` |
| MASTG-TEST-0010 | Sensitive Info in Auto-Generated Screenshots | grep for FLAG_SECURE |
| MASTG-TEST-0024 | Testing for App Permissions | Manifest permission analysis |
| MASTG-TEST-0028 | Testing Deep Links | Manifest intent-filter analysis, adb am start |
| MASTG-TEST-0029 | Sensitive Functionality Exposure Through IPC | `intent-monitor.js`, exported component testing |
| MASTG-TEST-0030 | Vulnerable PendingIntent Implementation | grep for PendingIntent with FLAG_IMMUTABLE |
| MASTG-TEST-0031 | JavaScript Execution in WebViews | `webview-interceptor.js`, grep for setJavaScriptEnabled |
| MASTG-TEST-0032 | WebView Protocol Handlers | grep for setAllowFileAccess/setAllowContentAccess |
| MASTG-TEST-0033 | Java Objects Exposed Through WebViews | grep for addJavascriptInterface |
| MASTG-TEST-0035 | Testing for Overlay Attacks | grep for SYSTEM_ALERT_WINDOW, filterTouchesWhenObscured |
| MASTG-TEST-0037 | WebViews Cleanup | grep for clearCache/clearHistory/clearFormData |
| MASTG-TEST-0250 | Content Provider Access in WebViews | grep for setAllowContentAccess in WebView |
| MASTG-TEST-0251 | Runtime Use of Content Provider Access in WebViews | `webview-interceptor.js` |
| MASTG-TEST-0252 | Local File Access in WebViews | grep for setAllowFileAccess |
| MASTG-TEST-0253 | Runtime Local File Access in WebViews | `webview-interceptor.js` |
| MASTG-TEST-0258 | Keyboard Caching Attributes | grep for inputType/textNoSuggestions |
| MASTG-TEST-0289 | Sensitive Content in Screenshots During Backgrounding | FLAG_SECURE analysis |
| MASTG-TEST-0290 | Runtime Verification of Screenshot Prevention | Runtime FLAG_SECURE enforcement testing |
| MASTG-TEST-0291 | Screen Capturing Prevention APIs | grep for FLAG_SECURE/setSecure |
| MASTG-TEST-0292 | setRecentsScreenshotEnabled Not Used | grep for setRecentsScreenshotEnabled |
| MASTG-TEST-0293 | setSecure Not Used for SurfaceViews | grep for SurfaceView setSecure |
| MASTG-TEST-0294 | SecureOn Not Used for Compose Dialogs | grep for SecureOn in Compose dialogs |
| MASTG-TEST-0315 | Sensitive Data Exposed via Notifications | grep for setVisibility(PRIVATE) on notifications |
| MASTG-TEST-0316 | Auth Data in Text Input Fields | grep for inputType password flags |
| MASTG-TEST-0320 | WebViews Not Cleaning Up | grep for WebView cleanup methods |

**Key Tools:** `workspace/frida-scripts/webview-interceptor.js`, `workspace/frida-scripts/intent-monitor.js`, manifest analysis, adb component testing

---

## M9: Insecure Data Storage → MASVS-STORAGE

| MASTG Test | Title | areclaw Coverage |
|---|---|---|
| MASTG-TEST-0001 | Testing Local Storage for Sensitive Data | `shared-prefs-monitor.js`, adb run-as, grep |
| MASTG-TEST-0006 | Keyboard Cache Disabled for Text Input Fields | grep for inputType/textNoSuggestions |
| MASTG-TEST-0009 | Testing Backups for Sensitive Data | Manifest allowBackup/fullBackupContent check |
| MASTG-TEST-0011 | Testing Memory for Sensitive Data | Frida heap search (Java.choose) |
| MASTG-TEST-0200 | Files Written to External Storage | grep for getExternalFilesDir/Environment.getExternalStorageDirectory |
| MASTG-TEST-0201 | Runtime Use of External Storage APIs | `shared-prefs-monitor.js`, Frida API hooks |
| MASTG-TEST-0202 | References to External Storage APIs | grep for WRITE_EXTERNAL_STORAGE |
| MASTG-TEST-0203 | Runtime Use of Logging APIs | logcat monitoring |
| MASTG-TEST-0207 | Runtime Storage of Unencrypted Data in Sandbox | adb run-as file inspection |
| MASTG-TEST-0216 | Sensitive Data Not Excluded From Backup | Manifest backup config analysis |
| MASTG-TEST-0231 | References to Logging APIs | grep for android.util.Log |
| MASTG-TEST-0262 | Backup Config Not Excluding Sensitive Data | fullBackupContent/dataExtractionRules analysis |
| MASTG-TEST-0287 | Unencrypted SharedPreferences | `shared-prefs-monitor.js`, adb cat prefs |
| MASTG-TEST-0304 | Unencrypted SQLite | adb sqlite3 inspection |
| MASTG-TEST-0305 | Unencrypted DataStore | grep for DataStore APIs |
| MASTG-TEST-0306 | Unencrypted Room DB | grep for @Database/@Entity |
| MASTG-TEST-0012 | Device-Access-Security Policy | Device lock/encryption policy check |

**Key Tools:** `workspace/frida-scripts/shared-prefs-monitor.js`, adb data inspection, grep patterns

---

## M10: Insufficient Cryptography → MASVS-CRYPTO

| MASTG Test | Title | areclaw Coverage |
|---|---|---|
| MASTG-TEST-0013 | Testing Symmetric Cryptography | `crypto-tracer.js`, grep for Cipher.getInstance |
| MASTG-TEST-0014 | Configuration of Cryptographic Standard Algorithms | grep for algorithm strings (DES/ECB/MD5) |
| MASTG-TEST-0015 | Testing Purposes of Keys | grep for KeyStore key usage |
| MASTG-TEST-0016 | Testing Random Number Generation | grep for java.util.Random vs SecureRandom |
| MASTG-TEST-0204 | Insecure Random API Usage | grep for `new Random()` |
| MASTG-TEST-0205 | Non-random Sources Usage | grep for System.currentTimeMillis as seed |
| MASTG-TEST-0208 | Insufficient Key Sizes | `crypto-tracer.js`, grep for key size constants |
| MASTG-TEST-0212 | Hardcoded Cryptographic Keys | trufflehog, apkleaks, grep for key patterns |
| MASTG-TEST-0221 | Broken Symmetric Encryption Algorithms | grep for DES/RC4/Blowfish |
| MASTG-TEST-0232 | Broken Symmetric Encryption Modes | grep for ECB mode |
| MASTG-TEST-0307 | Asymmetric Key Pairs Used for Multiple Purposes | grep for KeyProperties.PURPOSE_ |
| MASTG-TEST-0308 | Runtime Asymmetric Key Usage | `crypto-tracer.js` |
| MASTG-TEST-0309 | Reused Initialization Vectors | grep for static IV patterns |
| MASTG-TEST-0310 | Runtime Reused IVs | `crypto-tracer.js` runtime monitoring |
| MASTG-TEST-0312 | Explicit Security Provider in Crypto APIs | grep for Security.insertProviderAt |

**Key Tools:** `workspace/frida-scripts/crypto-tracer.js`, trufflehog, apkleaks, grep patterns

---

## Coverage Summary

| OWASP M# | MASVS Category | MASTG Tests | areclaw Coverage |
|---|---|---|---|
| M1 | STORAGE + CRYPTO | 7 tests | Full -- apkleaks + trufflehog + Frida |
| M2 | CODE | 3 tests | Partial -- manual CVE cross-reference |
| M3 | AUTH + NETWORK | 8 tests | Full -- Frida + grep + traffic |
| M4 | CODE + PLATFORM | 5 tests | Full -- Frida + adb + grep |
| M5 | NETWORK | 22 tests | Full -- ssl-bypass + mitmproxy + config analysis |
| M6 | PRIVACY | 10 tests | Full -- traffic analysis + grep |
| M7 | RESILIENCE | 20 tests | Full -- apkid + Frida bypass scripts + repackaging |
| M8 | PLATFORM | 26 tests | Full -- Frida + manifest + adb |
| M9 | STORAGE | 17 tests | Full -- shared-prefs-monitor + adb + grep |
| M10 | CRYPTO | 15 tests | Full -- crypto-tracer + grep patterns |

**Total: 133 test-section mappings (~110 unique MASTG tests, some map to multiple categories), ~94% automated coverage**
