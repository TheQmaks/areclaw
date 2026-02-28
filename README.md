# areclaw

Android Reverse Engineering Command-Line Automation Workspace.

Self-contained environment for Android application security analysis: decompilation, traffic interception, dynamic instrumentation, secret scanning, and API discovery. Powered by [Claude Code](https://claude.ai/claude-code) as the AI-driven orchestrator.

## Quick Start

```bash
# 1. Install all tools (~1.5 GB, requires Java 17+, Python 3.10+)
python scripts/install.py

# 2. Set up environment (each shell session)
source scripts/setup-env.sh

# 3. Analyze an app
#    via Claude Code agent:
claude /analyze-apk com.example.app
#    or manually:
jadx -d workspace/output/com.example.app --deobf workspace/samples/app.apk
```

## Platform

Developed and tested on **Windows 10/11** with Git Bash. Linux and WSL are supported but less tested. The automated installer (`install.py`) downloads Windows binaries — Linux users will need to adjust tool downloads manually.

## Requirements

- **OS**: Windows 10/11 with [Git Bash](https://git-scm.com/downloads) (ships with Git for Windows)
- **Java**: 17+ (for jadx, apktool, Ghidra, deobfuscators)
- **Python**: 3.10+ with pip
- **Android SDK**: adb, aapt2 (see setup below)
- **Device or emulator**: rooted for Frida, traffic interception, runtime analysis
- **Git**: for narumii-deobfuscator build from source
- **Disk**: ~2 GB for tools + workspace

### Android SDK Setup

Install [Android Studio](https://developer.android.com/studio) and use SDK Manager to install:
- **SDK Platform-Tools** (provides `adb`)
- **SDK Build-Tools** (provides `aapt2`)

Set the environment variable so tools can find the SDK:
```bash
# Windows (Git Bash) — typically:
export ANDROID_HOME="$HOME/AppData/Local/Android/Sdk"
# Linux:
export ANDROID_HOME="$HOME/Android/Sdk"
```

`setup-env.sh` auto-detects the SDK location from `ANDROID_HOME` or standard paths.

### Using an Emulator

Android Studio includes an emulator (AVD Manager). For security research, use a **Google APIs** system image (not Google Play — those are locked down):

```bash
# Create AVD via Android Studio: Tools → Device Manager → Create Device
# Choose a device, select "Google APIs" system image (API 34+)

# Or via command line:
sdkmanager "system-images;android-34;google_apis;x86_64"
avdmanager create avd -n test_device -k "system-images;android-34;google_apis;x86_64"
emulator -avd test_device -writable-system
```

For Frida on emulator — root access is available by default on Google APIs images:
```bash
adb root
adb push frida-server /data/local/tmp/
adb shell chmod 755 /data/local/tmp/frida-server
adb shell /data/local/tmp/frida-server -D &
```

> **Note**: Some apps detect emulators. For these, a physical rooted device is recommended.

## Architecture

```
areclaw/
├── scripts/
│   ├── install.py           # Automated installer & updater (14 tools + 21 pip packages)
│   └── setup-env.sh         # PATH configuration (auto-detects Git Bash / WSL / Linux)
├── pytools/
│   ├── ui_explorer.py       # UIAutomator-based device interaction
│   ├── traffic_to_collection.py  # Frida logs / HAR -> Postman collection
│   └── check_updates.py     # Version checker for all tools
├── workspace/
│   ├── frida-scripts/       # 15 Frida instrumentation scripts
│   ├── samples/             # APK files
│   ├── output/              # Decompiled source (per-package)
│   ├── reports/             # Analysis reports (markdown)
│   ├── traffic/             # Intercepted HTTP traffic
│   ├── collections/         # Postman / OpenAPI collections
│   ├── credentials/         # Test account data
│   └── patches/             # Modified / repackaged APKs
├── tools/                   # Binaries (downloaded by install.py)
├── .claude/
│   ├── agents/android-reverser.md   # AI agent prompt (1000+ lines)
│   └── skills/              # 5 automation skills
├── CLAUDE.md                # Project instructions for Claude Code
└── .tool_versions.json      # Installed version tracking
```

## Tools

### Standalone (downloaded by `install.py`)

| Tool | Purpose |
|------|---------|
| [jadx](https://github.com/skylot/jadx) | DEX/APK -> Java decompiler |
| [apktool](https://github.com/iBotPeaches/Apktool) | APK disassembly / rebuild (smali, resources, manifest) |
| [dex2jar](https://github.com/pxb1988/dex2jar) | DEX -> JAR converter |
| [Ghidra](https://github.com/NationalSecurityAgency/ghidra) | Native binary (ARM/ARM64 .so) reverse engineering |
| [radare2](https://github.com/radareorg/radare2) | Binary analysis, disassembly, scripting |
| [uber-apk-signer](https://github.com/patrickfav/uber-apk-signer) | APK signing (debug & release) |
| [apk.sh](https://github.com/ax/apk.sh) | Pull APKs, inject Frida gadget, patch |
| [Il2CppDumper](https://github.com/Perfare/Il2CppDumper) | Unity IL2CPP metadata extraction |
| [trufflehog](https://github.com/trufflesecurity/trufflehog) | Secret scanner (800+ detectors, live validation) |
| [java-deobfuscator](https://github.com/java-deobfuscator/deobfuscator) | Java bytecode deobfuscation |
| [threadtear](https://github.com/GraxCode/threadtear) | Java deobfuscation (ZKM, Stringer, Allatori, etc.) |
| [simplify](https://github.com/CalebFenton/simplify) | Android deobfuscation via virtual execution |
| [narumii](https://github.com/narumii/Deobfuscator) | Modern Java deobfuscator (built from source) |
| [phantom-frida](https://github.com/TheQmaks/phantom-frida) | Stealth Frida server (anti-detection bypass) |

### Pip packages (21)

frida-tools, objection, mitmproxy, androguard, apkid, lxml, requests, sosaver, clsdumper, jnitrace, fridump3, r2pipe, capstone, unicorn, mitmproxy2swagger, apkleaks, lief, triton-library, androidemu, justapk, [tema](https://github.com/TheQmaks/tema)

### Python libraries

```python
import lief       # Parse/modify ELF, DEX, OAT, VDEX
import capstone   # ARM/AArch64 disassembly
import unicorn    # CPU emulation (ARM64)
import r2pipe     # radare2 scripting
from triton import *           # Symbolic execution (ARM deobfuscation)
from androidemu.emulator import Emulator  # Android .so emulation (ARM32 JNI)
```

## Frida Scripts

15 ready-to-use scripts for dynamic instrumentation on rooted devices:

| Script | Purpose |
|--------|---------|
| `ssl-bypass.js` | Universal SSL pinning bypass (OkHttp, Conscrypt, TrustManager, network_security_config) |
| `root-bypass.js` | Root detection bypass (RootBeer, file checks, shell, props, native) |
| `anti-frida-bypass.js` | Multi-layer anti-Frida evasion (maps, ports, strings, threads, ptrace) |
| `http-logger.js` | HTTP request/response logging (OkHttp, HttpURLConnection, WebView) |
| `api-tracer.js` | Retrofit interface discovery (endpoints, methods, annotations) |
| `crypto-tracer.js` | Cipher, MessageDigest, Mac, SecretKey operation tracing |
| `enum-classes.js` | List all loaded classes with framework filtering |
| `shared-prefs-monitor.js` | SharedPreferences read/write monitor |
| `intent-monitor.js` | Activity, Broadcast, Service intent monitor |
| `dex-loader-monitor.js` | Runtime DEX/SO loading detection + auto-dump |
| `reflection-tracer.js` | Reflection call tracing (Class.forName, Method.invoke, Proxy) |
| `webview-interceptor.js` | JS bridge monitoring, URL interception, security audit |
| `stalker-tracer.js` | Native instruction tracing via Frida Stalker (ARM64) |
| `stacktrace-helper.js` | Cross-thread stack trace linking (Thread, Executor, Coroutines) |
| `hook-template.js` | Customizable method hook template |

Usage:
```bash
frida -U -f com.example.app -l workspace/frida-scripts/ssl-bypass.js

# Combine multiple scripts:
frida -U -f com.example.app \
  -l workspace/frida-scripts/ssl-bypass.js \
  -l workspace/frida-scripts/http-logger.js
```

## Claude Code Integration

### Agent

The `android-reverser` agent provides an intelligent analysis session with decision frameworks, search patterns, and OWASP guidance:

```
claude /agent android-reverser
```

### Skills

| Command | Description |
|---------|-------------|
| `/analyze-apk <pkg>` | Full 5-phase security analysis (static + dynamic) -> markdown report |
| `/find-api <pkg>` | API endpoint discovery -> documentation + Postman collection |
| `/intercept <pkg>` | Smart traffic interception (auto-adapts to pinning type) |
| `/register <pkg>` | Automated account registration with temporary email |
| `/compare-versions <old> <new>` | Diff permissions, APIs, security, code changes between APK versions |

## Common Workflows

### Download & decompile
```bash
justapk download com.example.app -o workspace/samples/
jadx -d workspace/output/com.example.app --deobf workspace/samples/com.example.app.apk
```

### Secret scanning
```bash
# Static (decompiled source)
trufflehog filesystem workspace/output/com.example.app/ --json
apkleaks -f workspace/samples/app.apk --json -o workspace/reports/secrets.json

# Dynamic (runtime crypto)
frida -U -f com.example.app -l workspace/frida-scripts/crypto-tracer.js
```

### Traffic interception
```bash
frida -U -f com.example.app \
  -l workspace/frida-scripts/ssl-bypass.js \
  -l workspace/frida-scripts/http-logger.js

# Convert logs to Postman collection
python pytools/traffic_to_collection.py frida workspace/traffic/app-traffic.json
```

### Stealth Frida (anti-detection apps)
```bash
# Read server name and port from build-info.json
cat tools/phantom-frida/build-info.json

# Deploy and connect
adb push tools/phantom-frida/<name>-server /data/local/tmp/<name>-server
adb shell chmod 755 /data/local/tmp/<name>-server
adb shell /data/local/tmp/<name>-server -D &
adb forward tcp:<port> tcp:<port>
frida -H 127.0.0.1:<port> -f com.example.app -l workspace/frida-scripts/ssl-bypass.js
```

### Modify & resign APK
```bash
java -jar tools/apktool/apktool.jar d app.apk -o workspace/patches/app-smali
# ... edit smali/resources ...
java -jar tools/apktool/apktool.jar b workspace/patches/app-smali -o workspace/patches/modified.apk
java -jar tools/uber-apk-signer/uber-apk-signer.jar -a workspace/patches/modified.apk
```

### Unity IL2CPP game analysis
```bash
unzip game.apk lib/arm64-v8a/libil2cpp.so assets/bin/Data/Managed/Metadata/global-metadata.dat -d workspace/output/
tools/il2cppdumper/Il2CppDumper.exe \
  workspace/output/lib/arm64-v8a/libil2cpp.so \
  workspace/output/assets/bin/Data/Managed/Metadata/global-metadata.dat \
  workspace/output/il2cpp/
```

## Installer

```bash
python scripts/install.py              # Install missing tools
python scripts/install.py --update     # Update all to latest versions
python scripts/install.py --verify     # Verify all installations
python scripts/install.py --dry-run    # Preview without changes
python scripts/install.py --tools-only # Only standalone tools (no pip)
python scripts/install.py --pip-only   # Only pip packages
```

Features:
- Downloads from GitHub Releases with auto-detection of correct assets per platform
- Staging directory pattern for safe updates (no data loss on failed download)
- narumii-deobfuscator built from source via Maven (auto-downloaded)
- phantom-frida fetched from private releases with build-info.json
- GitHub token support (`GITHUB_TOKEN` env var) for rate limit avoidance
- Version tracking in `.tool_versions.json`

## Output Conventions

| Artifact | Path |
|----------|------|
| Analysis reports | `workspace/reports/<pkg>-<YYYY-MM-DD>.md` |
| Test credentials | `workspace/credentials/<pkg>.json` |
| Traffic logs | `workspace/traffic/<pkg>-traffic.json` |
| Postman collections | `workspace/collections/<pkg>.json` |

## License

MIT. See [LICENSE](LICENSE).

This project integrates multiple open-source tools, each under their own license. See individual tool repositories for details.
