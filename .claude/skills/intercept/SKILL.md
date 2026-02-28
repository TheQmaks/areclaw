---
name: intercept
description: Intelligent traffic interception — SSL bypass, HTTP logging, traffic collection
user_invocable: true
argument: "<package_name>"
agent: android-reverser
---

# /intercept — Intelligent Traffic Interception

You are setting up intelligent traffic interception. Not just "run mitmproxy" — choose the right strategy based on the app's protections.

## Input
- `$ARGUMENTS` — package name (must be installed on device)

## Phase 1: Reconnaissance

### 1a. Check network security config
```bash
# Decompile resources
java -jar tools/apktool/apktool.jar d -s -f -o /tmp/intercept_recon $APK
```
Read `res/xml/network_security_config.xml`:
- `<domain-config cleartextTrafficPermitted="false">` → HTTPS only
- `<pin-set>` → Certificate pinning configured
- `<trust-anchors><certificates src="user"/>` → User CA trusted (easy mode!)
- No config file → default (user CA NOT trusted on Android 7+)

### 1b. Detect pinning implementation
```bash
grep -rn 'CertificatePinner\|TrustManager\|X509\|ssl_pinning\|NetworkSecurityConfig' workspace/output/$PKG/
```

Determine pinning type:
- **None** → Simple proxy is enough
- **OkHttp CertificatePinner** → ssl-bypass.js handles it
- **Custom X509TrustManager** → ssl-bypass.js handles it
- **Conscrypt/platform** → ssl-bypass.js handles it
- **Native TLS (BoringSSL in .so)** → Need Interceptor hook on `SSL_CTX_set_verify`
- **Flutter** → Need special Flutter SSL bypass
- **React Native** → Patch network_security_config + ssl-bypass.js

## Phase 2: Strategy Selection

Based on recon, choose approach:

### Strategy A: No Pinning
```bash
# Just log with Frida (simplest, no proxy needed)
frida -U -f $PKG -l workspace/frida-scripts/http-logger.js
```

### Strategy B: Standard Pinning (OkHttp/TrustManager/Conscrypt)
```bash
# SSL bypass + HTTP logging
frida -U -f $PKG \
  -l workspace/frida-scripts/ssl-bypass.js \
  -l workspace/frida-scripts/http-logger.js
```

### Strategy C: Heavy Pinning + Root Detection
```bash
# Full bypass stack
frida -U -f $PKG \
  -l workspace/frida-scripts/root-bypass.js \
  -l workspace/frida-scripts/ssl-bypass.js \
  -l workspace/frida-scripts/http-logger.js
```

### Strategy C2: App Detects Frida (crash/illegal instruction on attach)
Use phantom-frida stealth server. Read `tools/phantom-frida/build-info.json` for name and port:
```bash
# Parse config
cat tools/phantom-frida/build-info.json
# → {"name": "<NAME>", "port": <PORT>, ...}

# Deploy phantom-frida to device (if not already running)
adb push tools/phantom-frida/<NAME>-server /data/local/tmp/<NAME>-server
adb shell chmod 755 /data/local/tmp/<NAME>-server
adb shell /data/local/tmp/<NAME>-server -D &
adb forward tcp:<PORT> tcp:<PORT>

# Use -H instead of -U (custom port)
frida -H 127.0.0.1:<PORT> -f $PKG \
  -l workspace/frida-scripts/ssl-bypass.js \
  -l workspace/frida-scripts/http-logger.js
```
Signs that app detects Frida: crashes immediately on `frida -U`, "illegal instruction" error,
app shows "security check failed", or app force-closes when Frida attaches.

### Strategy D: Native/Custom Pinning
Write a custom Frida script to hook the specific pinning implementation found in recon.
May need to hook native functions in specific .so files.

### Strategy E: mitmproxy (for full request/response bodies)
```bash
# Start mitmproxy with HAR dump
mitmdump -w workspace/traffic/$PKG.har --set stream_large_bodies=10m

# Configure device proxy
adb shell settings put global http_proxy <computer_ip>:8080

# Then bypass pinning
frida -U -f $PKG -l workspace/frida-scripts/ssl-bypass.js
```

## Phase 3: Traffic Collection

### 3a. Start interception
Launch chosen strategy from Phase 2.

### 3b. Navigate the app
```bash
# Automated navigation
python pytools/ui_explorer.py snapshot  # See current state

# Walk key flows:
# - App startup (splash → main screen)
# - Login/registration
# - Main features
# - Settings
# - Profile
```

Spend adequate time on each screen. Some API calls happen on timers or scroll events.

### 3c. Save traffic
If using http-logger.js, output goes to console. Capture it:
```bash
frida -U -f $PKG -l workspace/frida-scripts/ssl-bypass.js -l workspace/frida-scripts/http-logger.js 2>&1 | tee workspace/traffic/$PKG-raw.log

# Extract HTTP-LOG lines
grep '^\[HTTP-LOG\]' workspace/traffic/$PKG-raw.log | sed 's/^\[HTTP-LOG\] //' > workspace/traffic/$PKG-traffic.json
```

## Phase 4: Results

### 4a. Generate Postman collection
```bash
python pytools/traffic_to_collection.py frida workspace/traffic/$PKG-traffic.json \
  --name "$PKG API" \
  --output workspace/collections/$PKG.json
```

### 4b. Generate OpenAPI spec (if mitmproxy was used)
```bash
# If traffic was captured via mitmproxy (not Frida http-logger)
mitmproxy2swagger -i workspace/traffic/$PKG.flow -o workspace/collections/$PKG-api.yaml \
  -p https://api.example.com --examples
```

### 4c. Summary
Report to user:
- Number of unique endpoints discovered
- Base URLs found
- Auth mechanism detected
- Notable findings (interesting headers, tokens, unexpected calls)
- Path to traffic file and Postman collection

## Phase 5: Cleanup
```bash
# Remove proxy if set
adb shell settings put global http_proxy :0
```
