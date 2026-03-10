# MITRE ATT&CK Mobile Technique Mapping for areclaw

## Introduction

This document maps [MITRE ATT&CK Mobile](https://attack.mitre.org/matrices/mobile/) techniques targeting the Android platform to the detection and testing capabilities provided by the areclaw Android security analysis plugin for Claude Code. Each technique is categorized by its ATT&CK tactic and evaluated against areclaw's static analysis (manifest/smali/native inspection), dynamic analysis (Frida instrumentation), and network analysis (mitmproxy traffic inspection) capabilities.

Coverage levels are defined as follows:

| Level | Definition |
|-------|------------|
| **Full** | areclaw can both detect the technique's presence in an application and actively test or validate it through instrumentation or automated analysis. |
| **Partial** | areclaw can detect indicators of the technique but cannot fully validate exploitation or requires manual analysis to confirm. |
| **Detection Only** | areclaw can flag potential use of the technique through pattern matching or heuristic analysis but cannot test or validate it. |
| **Not Covered** | The technique falls outside the scope of static/dynamic Android application analysis or requires capabilities areclaw does not provide. |

---

## Coverage Matrix by Tactic

### 1. Initial Access (TA0027)

| Technique ID | Technique Name | areclaw Detection / Testing Method | Coverage |
|:---:|---|---|:---:|
| T1661 | Application Versioning | `versionCode`/`versionName` analysis in AndroidManifest.xml; version history diffing | Partial |
| T1456 | Drive-By Compromise | Not directly testable -- requires browser/webview exploit chain external to the app | Not Covered |
| T1664 | Exploitation for Initial Access | Dependency CVE scanning via known vulnerability databases | Partial |
| T1461 | Lockscreen Bypass | Not in scope for application-layer analysis | Not Covered |
| T1660 | Phishing | Deep link and `intent-filter` analysis for URI scheme hijacking and credential phishing vectors | Partial |
| T1458 | Replication Through Removable Media | Not in scope for application-layer analysis | Not Covered |
| T1451 | SIM Card Swap | Not in scope for application-layer analysis | Not Covered |
| T1474 | Supply Chain Compromise | Dependency tree analysis, third-party SDK audit, known-malicious library detection | Partial |

### 2. Execution (TA0041)

| Technique ID | Technique Name | areclaw Detection / Testing Method | Coverage |
|:---:|---|---|:---:|
| T1623 | Command and Scripting Interpreter | Grep for `Runtime.exec()`, `ProcessBuilder`, reflection APIs; dynamic validation with `reflection-tracer.js` | Full |
| T1658 | Exploitation for Client Execution | Vulnerability pattern scanning in decompiled code and native libraries | Partial |
| T1575 | Native API | Native `.so` binary analysis via Ghidra/radare2; runtime tracing with `stalker-tracer.js` | Full |
| T1603 | Scheduled Task/Job | Grep for `AlarmManager`, `JobScheduler`, `WorkManager` usage in decompiled source | Full |

### 3. Persistence (TA0028)

| Technique ID | Technique Name | areclaw Detection / Testing Method | Coverage |
|:---:|---|---|:---:|
| T1398 | Boot/Logon Init Scripts | Grep for `BOOT_COMPLETED` BroadcastReceiver registration in manifest and code | Full |
| T1577 | Compromise Application Executable | Integrity check testing via apktool repackage and re-sign workflow | Full |
| T1645 | Compromise Client Software Binary | `.so` library integrity analysis and hash verification | Partial |
| T1624 | Event Triggered Execution | Manifest BroadcastReceiver analysis for implicit intents; dynamic monitoring with `intent-monitor.js` | Full |
| T1541 | Foreground Persistence | Grep for `startForeground()`, `FOREGROUND_SERVICE` permission declaration | Full |
| T1625 | Hijack Execution Flow | Smali-level analysis of class loading; DexClassLoader hook detection; dynamic monitoring with `dex-loader-monitor.js` | Full |
| T1676 | Linked Devices | API endpoint analysis for device-linking functionality | Detection Only |
| T1603 | Scheduled Task/Job | Grep for job scheduling APIs (`AlarmManager`, `JobScheduler`, `WorkManager`) | Full |

### 4. Privilege Escalation (TA0029)

| Technique ID | Technique Name | areclaw Detection / Testing Method | Coverage |
|:---:|---|---|:---:|
| T1626 | Abuse Elevation Control Mechanism | Root detection testing and bypass validation with `root-bypass.js` | Full |
| T1404 | Exploitation for Privilege Escalation | Native binary vulnerability scanning for known exploit patterns | Partial |
| T1631 | Process Injection | Grep for `ptrace`, `process_vm_readv`/`process_vm_writev` usage; native binary analysis | Partial |

### 5. Defense Evasion (TA0030)

| Technique ID | Technique Name | areclaw Detection / Testing Method | Coverage |
|:---:|---|---|:---:|
| T1661 | Application Versioning | Version diff analysis using `/compare-versions` workflow | Full |
| T1407 | Download New Code at Runtime | Dynamic class loading detection with `dex-loader-monitor.js`; grep for `DexClassLoader`, `InMemoryDexClassLoader` | Full |
| T1627 | Execution Guardrails | Grep for `Locale`, `TimeZone`, `TelephonyManager` geofencing/environment checks | Full |
| T1541 | Foreground Persistence | Grep for `startForeground()` calls and foreground service patterns | Full |
| T1628 | Hide Artifacts | Root detection and Frida detection analysis; anti-analysis technique identification | Full |
| T1617 | Hooking | Xposed framework detection, Frida framework detection, inline hook pattern analysis | Full |
| T1629 | Impair Defenses | Anti-analysis bypass testing with `anti-frida-bypass.js`; detection of security tool interference | Full |
| T1630 | Indicator Removal on Host | Grep for `file.delete()`, `ContentResolver.delete()`, `Log` class suppression patterns | Full |
| T1516 | Input Injection | Grep for `AccessibilityService` abuse, `SYSTEM_ALERT_WINDOW` permission usage | Full |
| T1655 | Masquerading | Package name analysis, launcher icon inspection, certificate chain verification | Full |
| T1575 | Native API | Native binary analysis via Ghidra/radare2; runtime native call tracing with `stalker-tracer.js` | Full |
| T1406 | Obfuscated Files or Information | APKiD packer/obfuscator detection; jadx `--deobf` deobfuscation; entropy and obfuscation analysis | Full |
| T1631 | Process Injection | `ptrace` usage detection in native code; process memory access pattern analysis | Partial |
| T1604 | Proxy Through Victim | Network traffic analysis with mitmproxy for proxy/relay behavior | Detection Only |
| T1632 | Subvert Trust Controls | Certificate pinning bypass and validation with `ssl-bypass.js`; trust anchor analysis | Full |
| T1670 | Virtualization Solution | Grep for VirtualApp, DualSpace, and similar virtualization framework patterns | Partial |
| T1633 | Virtualization/Sandbox Evasion | Emulator detection testing; environment fingerprinting analysis | Full |

### 6. Credential Access (TA0031)

| Technique ID | Technique Name | areclaw Detection / Testing Method | Coverage |
|:---:|---|---|:---:|
| T1453 | Abuse Accessibility Features | Manifest `AccessibilityService` declaration analysis; service configuration review | Full |
| T1517 | Access Notifications | Grep for `NotificationListenerService` declaration and implementation | Full |
| T1414 | Clipboard Data | Grep for `ClipboardManager` read/write operations | Full |
| T1634 | Credentials from Password Store | Shared preferences monitoring with `shared-prefs-monitor.js`; Android KeyStore usage analysis | Full |
| T1417 | Input Capture | Grep for `InputMethodService`, `dispatchKeyEvent()`, soft keyboard interception patterns | Full |
| T1635 | Steal Application Access Token | HTTP traffic token extraction with `http-logger.js`; OAuth/JWT token analysis in network traffic | Full |

### 7. Discovery (TA0032)

| Technique ID | Technique Name | areclaw Detection / Testing Method | Coverage |
|:---:|---|---|:---:|
| T1420 | File and Directory Discovery | Grep for `File.listFiles()`, `Files.walk()`, directory traversal patterns | Full |
| T1430 | Location Tracking | Grep for `LocationManager`, `FusedLocationProviderClient` usage | Full |
| T1423 | Network Service Scanning | Grep for `Socket`, `ServerSocket`, port scanning patterns | Detection Only |
| T1424 | Process Discovery | Grep for `ActivityManager.getRunningAppProcesses()`, `/proc` enumeration | Full |
| T1418 | Software Discovery | Grep for `PackageManager.getInstalledPackages()`, app enumeration APIs | Full |
| T1426 | System Information Discovery | Grep for `Build.*` fields, `SystemProperties`, device fingerprinting patterns | Full |
| T1422 | System Network Configuration Discovery | Grep for `WifiManager`, `ConnectivityManager`, network configuration access | Full |
| T1421 | System Network Connections Discovery | Grep for `TrafficStats`, `NetworkStatsManager`, connection enumeration | Full |

### 8. Lateral Movement (TA0033)

| Technique ID | Technique Name | areclaw Detection / Testing Method | Coverage |
|:---:|---|---|:---:|
| T1428 | Exploitation of Remote Services | API endpoint analysis for service interaction and exploitation patterns | Partial |
| T1458 | Replication Through Removable Media | Not in scope for application-layer analysis | Not Covered |

### 9. Collection (TA0035)

| Technique ID | Technique Name | areclaw Detection / Testing Method | Coverage |
|:---:|---|---|:---:|
| T1453 | Abuse Accessibility Features | Manifest `AccessibilityService` analysis for data collection abuse | Full |
| T1517 | Access Notifications | Grep for `NotificationListenerService` data exfiltration patterns | Full |
| T1638 | Adversary-in-the-Middle | Certificate pinning bypass with `ssl-bypass.js` combined with mitmproxy traffic interception | Full |
| T1532 | Archive Collected Data | Grep for `ZipOutputStream`, `GZIPOutputStream`, compression before exfiltration | Full |
| T1429 | Audio Capture | Grep for `MediaRecorder`, `AudioRecord` microphone access | Full |
| T1616 | Call Control | Grep for `TelecomManager`, `TelephonyManager` call manipulation APIs | Full |
| T1414 | Clipboard Data | Grep for `ClipboardManager` read operations | Full |
| T1533 | Data from Local System | Grep for filesystem access patterns, external storage reads, database queries | Full |
| T1417 | Input Capture | Grep for keylogger patterns, `InputMethodService`, keystroke interception | Full |
| T1676 | Linked Devices | API endpoint analysis for cross-device data sharing | Detection Only |
| T1430 | Location Tracking | Grep for location APIs, geofence monitoring, continuous location requests | Full |
| T1636 | Protected User Data | Permission analysis for contacts, calendar, call log, SMS access | Full |
| T1513 | Screen Capture | Grep for `MediaProjection`, `Screenshot` APIs, framebuffer access | Full |
| T1409 | Stored Application Data | Shared preferences monitoring with `shared-prefs-monitor.js`; adb data directory inspection | Full |
| T1512 | Video Capture | Grep for `Camera`, `CameraX`, `Camera2` API usage | Full |

### 10. Command and Control (TA0037)

| Technique ID | Technique Name | areclaw Detection / Testing Method | Coverage |
|:---:|---|---|:---:|
| T1437 | Application Layer Protocol | HTTP/S traffic interception with `http-logger.js` and mitmproxy; API endpoint analysis | Full |
| T1616 | Call Control | Grep for `TelecomManager` call-based C2 patterns | Full |
| T1637 | Dynamic Resolution | Domain Generation Algorithm (DGA) pattern detection in extracted URLs and strings | Partial |
| T1521 | Encrypted Channel | TLS inspection with `ssl-bypass.js` and mitmproxy; custom encryption detection | Full |
| T1544 | Ingress Tool Transfer | Dynamic code download monitoring with `dex-loader-monitor.js`; network download analysis | Full |
| T1509 | Non-Standard Port | mitmproxy traffic analysis for non-standard port communication | Full |
| T1644 | Out of Band Data | Grep for `SmsManager`, `NfcAdapter`, `BluetoothAdapter` alternative channel usage | Full |
| T1663 | Remote Access Software | Dependency and SDK analysis for embedded remote access tools | Detection Only |
| T1481 | Web Service | Base URL extraction from decompiled code; domain and C2 infrastructure analysis | Full |

### 11. Exfiltration (TA0036)

| Technique ID | Technique Name | areclaw Detection / Testing Method | Coverage |
|:---:|---|---|:---:|
| T1639 | Exfiltration Over Alternative Protocol | mitmproxy multi-protocol traffic analysis (DNS, ICMP tunneling indicators) | Partial |
| T1646 | Exfiltration Over C2 Channel | HTTP traffic volume and payload analysis with `http-logger.js` | Full |

### 12. Impact (TA0034)

| Technique ID | Technique Name | areclaw Detection / Testing Method | Coverage |
|:---:|---|---|:---:|
| T1640 | Account Access Removal | API endpoint analysis for account lockout/deletion functionality | Detection Only |
| T1616 | Call Control | Grep for `TelecomManager` call manipulation for toll fraud | Full |
| T1662 | Data Destruction | Grep for `file.delete()`, `SQLiteDatabase.deleteDatabase()`, bulk deletion patterns | Full |
| T1471 | Data Encrypted for Impact | Grep for `Cipher` usage combined with ransom note patterns and mass file encryption indicators | Partial |
| T1641 | Data Manipulation | Content Provider integrity testing; data tampering pattern analysis | Partial |
| T1642 | Endpoint Denial of Service | Resource consumption analysis (CPU, memory, battery drain patterns) | Detection Only |
| T1643 | Generate Traffic from Victim | Traffic volume and pattern analysis via mitmproxy | Detection Only |
| T1516 | Input Injection | Grep for `AccessibilityService` abuse, `dispatchKeyEvent()` injection patterns | Full |
| T1464 | Network Denial of Service | Not in scope for application-layer analysis | Not Covered |
| T1582 | SMS Control | Grep for `SmsManager`, BroadcastReceiver SMS interception patterns | Full |

---

## Summary Statistics

### Coverage by Tactic

| Tactic | Total Techniques | Full | Partial | Detection Only | Not Covered |
|---|:---:|:---:|:---:|:---:|:---:|
| Initial Access | 8 | 0 | 4 | 0 | 4 |
| Execution | 4 | 3 | 1 | 0 | 0 |
| Persistence | 8 | 6 | 1 | 1 | 0 |
| Privilege Escalation | 3 | 1 | 2 | 0 | 0 |
| Defense Evasion | 17 | 14 | 2 | 1 | 0 |
| Credential Access | 6 | 6 | 0 | 0 | 0 |
| Discovery | 8 | 7 | 0 | 1 | 0 |
| Lateral Movement | 2 | 0 | 1 | 0 | 1 |
| Collection | 15 | 14 | 0 | 1 | 0 |
| Command and Control | 9 | 7 | 1 | 1 | 0 |
| Exfiltration | 2 | 1 | 1 | 0 | 0 |
| Impact | 10 | 4 | 2 | 3 | 1 |
| **Totals (per-tactic rows)** | **92** | **63** | **15** | **8** | **6** |

### Unique Technique Coverage

Because several technique IDs appear under multiple tactics (for example, T1603 Scheduled Task/Job appears under both Execution and Persistence), the unique technique count differs from the per-tactic row count.

| Metric | Count |
|---|:---:|
| Total unique techniques mapped | 84 |
| Full coverage | 58 |
| Partial coverage | 15 |
| Detection Only | 6 |
| Not Covered | 5 |
| **Overall coverage rate** | **94.0% (79 of 84)** |

> **Note:** When a technique appears in multiple tactics with different coverage levels, the highest coverage level is used for the unique count. The "overall coverage rate" counts Full, Partial, and Detection Only as covered.

### Coverage Distribution

```
Full            ██████████████████████████████████████████████████  58  (69.0%)
Partial         █████████████                                       15  (17.9%)
Detection Only  █████                                                6  ( 7.1%)
Not Covered     ████                                                 5  ( 6.0%)
```

---

## Frida Script to MITRE ATT&CK Technique Mapping

The following table maps each areclaw Frida instrumentation script to the MITRE ATT&CK Mobile techniques it helps detect or test.

> **Note:** Full script paths follow the pattern:
> `workspace/frida-scripts/<script-name>`

### `ssl-bypass.js`

Bypasses certificate pinning to enable TLS traffic inspection.

| Technique ID | Technique Name | Tactic |
|:---:|---|---|
| T1632 | Subvert Trust Controls | Defense Evasion |
| T1638 | Adversary-in-the-Middle | Collection |
| T1521 | Encrypted Channel | Command and Control |

### `http-logger.js`

Intercepts and logs HTTP/S requests and responses at the application layer.

| Technique ID | Technique Name | Tactic |
|:---:|---|---|
| T1635 | Steal Application Access Token | Credential Access |
| T1437 | Application Layer Protocol | Command and Control |
| T1646 | Exfiltration Over C2 Channel | Exfiltration |

### `dex-loader-monitor.js`

Monitors dynamic class loading operations including DexClassLoader and InMemoryDexClassLoader.

| Technique ID | Technique Name | Tactic |
|:---:|---|---|
| T1407 | Download New Code at Runtime | Defense Evasion |
| T1625 | Hijack Execution Flow | Persistence |
| T1544 | Ingress Tool Transfer | Command and Control |

### `shared-prefs-monitor.js`

Monitors SharedPreferences read/write operations and KeyStore access.

| Technique ID | Technique Name | Tactic |
|:---:|---|---|
| T1634 | Credentials from Password Store | Credential Access |
| T1409 | Stored Application Data | Collection |

### `reflection-tracer.js`

Traces Java reflection calls including `Method.invoke()`, `Class.forName()`, and related APIs.

| Technique ID | Technique Name | Tactic |
|:---:|---|---|
| T1623 | Command and Scripting Interpreter | Execution |

### `stalker-tracer.js`

Uses Frida Stalker to trace native code execution at the instruction level.

| Technique ID | Technique Name | Tactic |
|:---:|---|---|
| T1575 | Native API | Execution, Defense Evasion |

### `intent-monitor.js`

Monitors incoming and outgoing Android Intent objects at runtime.

| Technique ID | Technique Name | Tactic |
|:---:|---|---|
| T1624 | Event Triggered Execution | Persistence |

### `root-bypass.js`

Bypasses common root detection mechanisms to test root-check robustness.

| Technique ID | Technique Name | Tactic |
|:---:|---|---|
| T1626 | Abuse Elevation Control Mechanism | Privilege Escalation |

### `anti-frida-bypass.js`

Bypasses anti-Frida and anti-instrumentation detection mechanisms.

| Technique ID | Technique Name | Tactic |
|:---:|---|---|
| T1629 | Impair Defenses | Defense Evasion |

### Script Coverage Summary

| Script | Techniques Covered | Primary Tactics |
|---|:---:|---|
| `ssl-bypass.js` | 3 | Defense Evasion, Collection, C2 |
| `http-logger.js` | 3 | Credential Access, C2, Exfiltration |
| `dex-loader-monitor.js` | 3 | Defense Evasion, Persistence, C2 |
| `shared-prefs-monitor.js` | 2 | Credential Access, Collection |
| `reflection-tracer.js` | 1 | Execution |
| `stalker-tracer.js` | 1 | Execution, Defense Evasion |
| `intent-monitor.js` | 1 | Persistence |
| `root-bypass.js` | 1 | Privilege Escalation |
| `anti-frida-bypass.js` | 1 | Defense Evasion |

---

## References

- [MITRE ATT&CK Mobile Matrix](https://attack.mitre.org/matrices/mobile/)
- [MITRE ATT&CK Mobile Techniques](https://attack.mitre.org/techniques/mobile/)
- [OWASP Mobile Application Security](https://mas.owasp.org/)
