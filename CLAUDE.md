# Android Reversing Environment

## Setup
```bash
source scripts/setup-env.sh
```

## Tool Paths
| Tool | Path / Command |
|------|---------------|
| jadx | `tools/jadx/bin/jadx` |
| jadx-gui | `tools/jadx/bin/jadx-gui` |
| apktool | `java -jar tools/apktool/apktool.jar` |
| dex2jar | `d2j-dex2jar.sh` (in PATH after setup-env.sh) |
| Ghidra | `tools/ghidra/ghidra_*_PUBLIC/support/analyzeHeadless` (version auto-detected by setup-env.sh) |
| uber-apk-signer | `java -jar tools/uber-apk-signer/uber-apk-signer.jar` |
| java-deobfuscator | `java -jar tools/java-deobfuscator/deobfuscator.jar` |
| threadtear | `java -jar tools/threadtear/threadtear.jar` |
| narumii deobf | `java -jar tools/narumii-deobfuscator/Deobfuscator.jar` |
| simplify | `java -jar tools/simplify/simplify.jar -i obfuscated.apk -o deobfuscated.apk` |
| Il2CppDumper | `tools/il2cppdumper/Il2CppDumper.exe libil2cpp.so global-metadata.dat output/` |
| radare2 | `r2` (in PATH after setup-env.sh) |
| apk.sh | `bash tools/apk.sh/apk.sh pull <pkg>` / `patch app.apk --arch arm64` |
| justapk | `justapk download <pkg>` — multi-source APK downloader with auto-fallback (APK20, F-Droid, APKPure, APKMirror, Uptodown, APKCombo) |
| trufflehog | `tools/trufflehog/trufflehog.exe filesystem workspace/output/<pkg>/` — find 800+ secret types + validate if live |
| phantom-frida | `tools/phantom-frida/` — stealth Frida server (see `build-info.json` for name/port) |
| adb | `$ANDROID_SDK_ROOT/platform-tools/adb` |
| aapt2 | `aapt2` (in PATH after setup-env.sh) |
| apkid | `apkid <apk>` |
| frida | `frida -U -f <pkg> -l <script>` |
| objection | `objection -g <pkg> explore` |
| sosaver | `sosaver -p <pkg> -o output/` |
| clsdumper | `clsdumper -p <pkg> -o output/` |

## Workspace Layout
```
workspace/
├── samples/        ← APK files
├── output/         ← Decompiled code (per-package dirs)
├── frida-scripts/  ← Frida JS scripts (15 scripts)
├── reports/        ← Analysis reports (markdown)
├── patches/        ← Modified/repackaged APKs
├── credentials/    ← Test account credentials
├── traffic/        ← Intercepted HTTP traffic
└── collections/    ← Postman collections
```

## Python Tools
```bash
python pytools/ui_explorer.py <command>        # UIAutomator interaction
tema <command>                                  # Temporary email (7 providers, auto-fallback)
python pytools/traffic_to_collection.py <fmt>   # Traffic → Postman
python pytools/check_updates.py                 # Check tool updates
jnitrace -l <lib.so> <pkg>                      # Trace JNI API calls
fridump3 -U -s <pkg> -o dump/                   # Dump process memory
apkleaks -f <apk>                               # Scan APK for secrets/URLs/API keys
mitmproxy2swagger -i flow -o api.yaml -p <url>  # Traffic → OpenAPI spec
```

## Python Libraries (import in scripts)
```python
import lief       # Parse/modify ELF, DEX, OAT, VDEX binaries
import capstone   # ARM/AArch64 disassembly
import unicorn    # CPU emulation (ARM64 off-device)
import r2pipe     # Script radare2 from Python
from triton import *  # Symbolic execution + taint for ARM (deobfuscation)
from androidemu.emulator import Emulator  # Emulate Android .so with JNI (ARM32)
```

## Frida Scripts (workspace/frida-scripts/) — 15 scripts
| Script | Usage |
|--------|-------|
| ssl-bypass.js | `frida -U -f <pkg> -l ssl-bypass.js` |
| root-bypass.js | `frida -U -f <pkg> -l root-bypass.js` |
| http-logger.js | `frida -U -f <pkg> -l http-logger.js` — logs JSON to stdout |
| api-tracer.js | Retrofit interface discovery |
| enum-classes.js | List all app classes |
| crypto-tracer.js | Cipher/digest/key logging |
| shared-prefs-monitor.js | SharedPreferences read/write monitor |
| intent-monitor.js | Activity/broadcast/service intent monitor |
| hook-template.js | Edit TARGET_CLASS/TARGET_METHOD, then run |
| anti-frida-bypass.js | Multi-layer: maps, ports, strings, threads, ptrace, CT bypass |
| stalker-tracer.js | Native instruction tracing via Frida Stalker (ARM64 SVC, calls) |
| stacktrace-helper.js | Cross-thread stack trace linking (Thread, Executor, Handler, Coroutines) |
| dex-loader-monitor.js | Runtime DEX/SO loading detection + auto-dump |
| reflection-tracer.js | Reflection-based obfuscation defeat (Class.forName, Method.invoke) |
| webview-interceptor.js | Hybrid app JS bridge monitoring + URL/settings audit |

## Common Workflows

### Pull APK from device
```bash
adb shell pm path com.example.app
adb pull /data/app/.../base.apk workspace/samples/
```

### Download APK from store (no device needed)
```bash
justapk download com.example.app -o workspace/samples/
```

### Decompile and analyze APK
```bash
jadx -d workspace/output/com.example.app --deobf workspace/samples/base.apk
```

### Deep secret scan on decompiled source
```bash
tools/trufflehog/trufflehog.exe filesystem workspace/output/com.example.app/ --json
```

### Intercept traffic
```bash
frida -U -f com.example.app \
  -l workspace/frida-scripts/ssl-bypass.js \
  -l workspace/frida-scripts/http-logger.js
```

### Dump packed DEX
```bash
clsdumper -p com.example.app -o workspace/output/
```

### Sign modified APK
```bash
java -jar tools/uber-apk-signer/uber-apk-signer.jar -a workspace/patches/modified.apk
```

### Inject Frida gadget (automated)
```bash
bash tools/apk.sh/apk.sh patch app.apk --arch arm64
```

### Scan APK for secrets
```bash
apkleaks -f workspace/samples/base.apk --json -o workspace/reports/secrets.json
```

### Unity IL2CPP analysis
```bash
unzip app.apk lib/arm64-v8a/libil2cpp.so assets/bin/Data/Managed/Metadata/global-metadata.dat -d workspace/output/
tools/il2cppdumper/Il2CppDumper.exe workspace/output/lib/arm64-v8a/libil2cpp.so workspace/output/assets/bin/Data/Managed/Metadata/global-metadata.dat workspace/output/il2cpp/
```

### Generate API docs from traffic
```bash
mitmproxy2swagger -i workspace/traffic/capture.flow -o workspace/collections/api.yaml -p https://api.example.com --examples
```

## Security Framework References
| Document | Path |
|----------|------|
| OWASP M1–M10 Checklist | `docs/references/owasp-checklist.md` |
| MASTG Test Case Mapping | `docs/references/mastg-mapping.md` |
| MITRE ATT&CK Coverage | `docs/references/mitre-attack-mapping.md` |

## Rules
- Reports go to `workspace/reports/<pkg>-<YYYY-MM-DD>.md`
- Credentials go to `workspace/credentials/<pkg>.json`
- Traffic logs to `workspace/traffic/<pkg>-traffic.json`
- Postman collections to `workspace/collections/<pkg>.json`
- Always run `source scripts/setup-env.sh` before working
- Run `python pytools/check_updates.py` periodically to verify tool versions

## Phantom-Frida (Stealth Frida Server)

Pre-built stealth server is auto-downloaded to `tools/phantom-frida/` by `install.py`.
Read `tools/phantom-frida/build-info.json` for current name, port, and version.

```bash
# Deploy to device (read name from build-info.json)
adb push tools/phantom-frida/<name>-server /data/local/tmp/<name>-server
adb shell chmod 755 /data/local/tmp/<name>-server
adb shell /data/local/tmp/<name>-server -D &
adb forward tcp:<port> tcp:<port>
frida -H 127.0.0.1:<port> -f com.example.app

# Update to latest weekly build
python scripts/install.py --update --tools-only
```

## Agent
Use `/agent android-reverser` for intelligent analysis sessions.

## Skills
| Skill | Description |
|-------|-------------|
| `/analyze-apk <pkg>` | Full security analysis -> report |
| `/find-api <pkg>` | API endpoint discovery -> documentation + Postman |
| `/intercept <pkg>` | Smart traffic interception (adapts to pinning type) |
| `/register <pkg>` | Automated account registration with temp email |
| `/compare-versions <old> <new>` | Diff two APK versions |
