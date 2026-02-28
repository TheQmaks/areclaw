---
name: compare-versions
description: Compare two versions of an Android app — diff permissions, APIs, security, code changes
user_invocable: true
argument: "<old.apk> <new.apk>"
agent: android-reverser
---

# /compare-versions — Version Comparison Analysis

You are comparing two versions of the same Android app to identify what changed: new features, security changes, API modifications, permission changes.

## Input
- `$ARGUMENTS` — two APK paths: `<old.apk> <new.apk>`

Parse arguments: first = OLD version, second = NEW version.

## Phase 1: Decompile Both

```bash
# Get version info
apkid $OLD_APK
apkid $NEW_APK

# Decompile both
jadx -d workspace/output/old_version --deobf $OLD_APK
jadx -d workspace/output/new_version --deobf $NEW_APK

# Also decode resources
java -jar tools/apktool/apktool.jar d -o workspace/output/old_version-smali $OLD_APK
java -jar tools/apktool/apktool.jar d -o workspace/output/new_version-smali $NEW_APK
```

## Phase 2: Manifest Diff

Compare AndroidManifest.xml:

### 2a. Permissions
```bash
# Extract permissions from both
grep 'uses-permission' workspace/output/old_version-smali/AndroidManifest.xml | sort > /tmp/perms_old.txt
grep 'uses-permission' workspace/output/new_version-smali/AndroidManifest.xml | sort > /tmp/perms_new.txt
diff /tmp/perms_old.txt /tmp/perms_new.txt
```

Flag: new dangerous permissions, removed permissions.

### 2b. Components
```bash
# Compare activities, services, receivers, providers
grep -E 'activity |service |receiver |provider ' workspace/output/old_version-smali/AndroidManifest.xml | sort > /tmp/comp_old.txt
grep -E 'activity |service |receiver |provider ' workspace/output/new_version-smali/AndroidManifest.xml | sort > /tmp/comp_new.txt
diff /tmp/comp_old.txt /tmp/comp_new.txt
```

Flag: new exported components, removed components, changed intent-filters.

### 2c. SDK & Flags
Compare: targetSdkVersion, minSdkVersion, debuggable, allowBackup, networkSecurityConfig.

## Phase 3: Code Diff

### 3a. File tree diff
```bash
# Compare directory structures
find workspace/output/old_version -name "*.java" | sed 's|workspace/output/old_version/||' | sort > /tmp/files_old.txt
find workspace/output/new_version -name "*.java" | sed 's|workspace/output/new_version/||' | sort > /tmp/files_new.txt

# New files
comm -13 /tmp/files_old.txt /tmp/files_new.txt > /tmp/new_files.txt
# Removed files
comm -23 /tmp/files_old.txt /tmp/files_new.txt > /tmp/removed_files.txt
# Common files (for content diff)
comm -12 /tmp/files_old.txt /tmp/files_new.txt > /tmp/common_files.txt
```

### 3b. Content diff for key files
Focus on files likely to contain security-relevant changes:
- Network configuration classes
- Auth/login related classes
- API interface definitions
- Crypto utility classes
- SharedPreferences usage

```bash
diff -rq workspace/output/old_version workspace/output/new_version | head -50
```

## Phase 4: API Diff

### 4a. Endpoint changes
```bash
# Extract endpoints from both versions
grep -rn '@GET\|@POST\|@PUT\|@DELETE\|@PATCH' workspace/output/old_version/ | sort > /tmp/api_old.txt
grep -rn '@GET\|@POST\|@PUT\|@DELETE\|@PATCH' workspace/output/new_version/ | sort > /tmp/api_new.txt
```

Compare: new endpoints, removed endpoints, changed paths, changed parameters.

### 4b. Base URL changes
```bash
grep -rn 'baseUrl\|BASE_URL\|API_URL' workspace/output/old_version/ > /tmp/urls_old.txt
grep -rn 'baseUrl\|BASE_URL\|API_URL' workspace/output/new_version/ > /tmp/urls_new.txt
```

## Phase 5: Security Diff

### 5a. Pinning changes
- Added or removed certificate pinning?
- Changed pinned certificates?
- Modified network_security_config.xml?

### 5b. Crypto changes
- New crypto algorithms introduced?
- Changed key lengths?
- New encryption/signing logic?

### 5c. Protection changes
- Added root detection?
- Added Frida detection?
- Added integrity checks?
- Changed obfuscation level?

### 5d. Data storage changes
- New SharedPreferences keys?
- New database tables?
- Changed storage patterns?

## Phase 6: Native Library Diff

```bash
# Compare .so files
unzip -l $OLD_APK | grep '\.so' | sort > /tmp/so_old.txt
unzip -l $NEW_APK | grep '\.so' | sort > /tmp/so_new.txt
diff /tmp/so_old.txt /tmp/so_new.txt
```

New native libraries may indicate new features or security measures.

## Phase 7: Report

Save to `workspace/reports/compare-<pkg>-<old_ver>-vs-<new_ver>.md`:

```markdown
# Version Comparison: <App Name>
**Old Version**: X.Y.Z (versionCode)
**New Version**: X.Y.Z (versionCode)
**Date**: YYYY-MM-DD

## Summary
<Key changes in 3-5 bullet points>

## Permissions
### Added
- <permission> — <risk assessment>
### Removed
- <permission>

## Components
### New
- <component type> <name> — exported: yes/no
### Removed
- ...

## API Changes
### New Endpoints
| Method | Path | Notes |
### Removed Endpoints
| Method | Path | Notes |
### Modified Endpoints
| Method | Path | What Changed |

## Security Changes
### Improvements
- <change> — <impact>
### Regressions
- <change> — <risk>

## Notable Code Changes
<Summary of significant code modifications>

## New Dependencies
<New third-party libraries added>
```
