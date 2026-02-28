---
name: analyze-apk
description: Full security analysis of an Android application — from APK to report
user_invocable: true
argument: "<package_name_or_apk_path>"
agent: android-reverser
---

# /analyze-apk — Full Application Analysis

You are performing a comprehensive security analysis. **Think, don't checklist.**

## Input
- `$ARGUMENTS` — either a package name (com.example.app) or path to APK file

## Phase 1: Acquisition

If given a package name (not a file path):
```bash
# Option A: Pull from device (if connected)
adb shell pm path $ARGUMENTS
adb pull <path> workspace/samples/

# Option B: Download from store (no device needed)
justapk download $ARGUMENTS -o workspace/samples/
```

If given a file path, use directly.

Set `$APK` = path to the APK file, `$PKG` = package name.

## Phase 2: Reconnaissance — DETERMINE WHAT YOU'RE DEALING WITH

This phase determines your entire strategy. Do not skip.

```bash
# 1. Protection detection
apkid $APK

# 2. Check native libraries
unzip -l $APK | grep '\.so' | head -20

# 3. Check assets for framework indicators
unzip -l $APK | grep -E 'flutter|react|index\.android\.bundle|il2cpp|global-metadata'

# 4. Quick manifest check
java -jar tools/apktool/apktool.jar d -s -f -o /tmp/apk_quick $APK
# Read AndroidManifest.xml
```

**DECIDE** based on findings:
- **Flutter** → Focus on network interception, limited static analysis of Dart
- **React Native** → Extract and analyze JS bundle, check for Hermes bytecode
- **Unity/IL2CPP** → `tools/il2cppdumper/Il2CppDumper.exe libil2cpp.so global-metadata.dat output/` + Ghidra with recovered symbols
- **Packed** → Use `clsdumper` to dump DEX first, then proceed
- **Native Java/Kotlin** → Full static + dynamic analysis
- **Heavy obfuscation** → Identify obfuscator, try `simplify` first (`java -jar tools/simplify/simplify.jar -i app.apk -o clean.apk`), then java-deobfuscator/threadtear

## Phase 3: Static Analysis

### 3a. Decompilation
```bash
# Primary: jadx
jadx -d workspace/output/$PKG --deobf --show-bad-code $APK

# Resources + smali: apktool
java -jar tools/apktool/apktool.jar d -o workspace/output/$PKG-smali $APK
```

If packed and clsdumper was used, decompile the dumped DEX instead.

### 3b. Manifest Analysis
Read `AndroidManifest.xml` and analyze:
- **Permissions**: List all, flag dangerous ones, check for custom permissions
- **Exported components**: Activities, Services, Receivers, Providers with `exported="true"` or intent-filters (implicit export)
- **Flags**: `debuggable`, `allowBackup`, `usesCleartextTraffic`, `networkSecurityConfig`
- **Deep links**: `<intent-filter>` with `android.intent.action.VIEW` + `<data>` elements
- **Target/Min SDK**: Security implications of SDK versions

### 3c. Secret Scanning
```bash
# Step 1: apkleaks — fast APK-level scan
apkleaks -f $APK --json -o workspace/reports/$PKG-secrets.json

# Step 2: trufflehog — deep scan on decompiled source (800+ secret types, validates if live!)
tools/trufflehog/trufflehog.exe filesystem workspace/output/$PKG/ --json
```
Then search decompiled source using expert patterns from the agent reference.
Focus on: API keys, hardcoded credentials, Firebase configs, cloud service keys.

**For every secret found**: determine scope and impact. trufflehog validates automatically — check its output for verified credentials.

### 3d. API Mapping
Find all network endpoints:
- Retrofit interfaces (annotations)
- OkHttp interceptors (base URL)
- URL constants in strings/resources
- WebSocket endpoints

Build endpoint table: Method | Path | Auth Required | Request Model | Response Model

### 3e. Security Audit
Walk through patterns:
- Cryptography: weak algorithms, hardcoded keys, predictable IVs
- WebView: JavaScript enabled + interface exposure
- Data storage: SharedPrefs, SQLite, files — what's sensitive?
- IPC: Exported components without permissions
- Logging: Sensitive data in Log calls

## Phase 4: Dynamic Analysis (if device connected)

Only if device is available (`adb devices` shows device):

```bash
# If app detects Frida (crashes on attach), use phantom-frida:
# Read tools/phantom-frida/build-info.json for <NAME> and <PORT>
# adb push tools/phantom-frida/<NAME>-server /data/local/tmp/<NAME>-server
# adb shell chmod 755 /data/local/tmp/<NAME>-server && adb shell /data/local/tmp/<NAME>-server -D &
# adb forward tcp:<PORT> tcp:<PORT>
# Then use: frida -H 127.0.0.1:<PORT> instead of frida -U

# Check root detection
frida -U -f $PKG -l workspace/frida-scripts/root-bypass.js

# Monitor crypto (reveals actual keys/algorithms in use)
frida -U -f $PKG -l workspace/frida-scripts/crypto-tracer.js

# Monitor SharedPrefs (reveals actual stored data)
frida -U -f $PKG -l workspace/frida-scripts/shared-prefs-monitor.js

# Check actual stored data on device
adb shell run-as $PKG ls shared_prefs/
adb shell run-as $PKG ls databases/
```

## Phase 5: Report

Generate report at `workspace/reports/$PKG-$(date +%Y-%m-%d).md` following the report format in the agent reference.

**Critical**: The report must show chain of reasoning, not just findings. Each finding should explain WHY it matters and WHAT an attacker could do with it.
