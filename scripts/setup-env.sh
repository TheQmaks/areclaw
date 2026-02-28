#!/bin/bash
# Android Reversing Environment — PATH configuration
# Usage: source scripts/setup-env.sh
# Works in Git Bash (MSYS), WSL, and native Linux

# Auto-detect project root from this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ANDROID_RE_HOME="$(cd "$SCRIPT_DIR/.." && pwd)"

# Auto-detect Android SDK location
if [ -n "$ANDROID_HOME" ]; then
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
elif [ -n "$ANDROID_SDK_ROOT" ]; then
    :  # already set
else
    # Try standard locations
    if [[ "$(uname -s)" == MINGW* ]] || [[ "$(uname -s)" == MSYS* ]]; then
        _SDK_DEFAULT="/c/Users/$USERNAME/AppData/Local/Android/Sdk"
    elif [ -d "/mnt/c" ]; then
        _WSL_USER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')
        _SDK_DEFAULT="/mnt/c/Users/${_WSL_USER}/AppData/Local/Android/Sdk"
    else
        _SDK_DEFAULT="$HOME/Android/Sdk"
    fi
    if [ -d "$_SDK_DEFAULT" ]; then
        export ANDROID_SDK_ROOT="$_SDK_DEFAULT"
    else
        echo "[setup-env] WARNING: Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT."
    fi
fi

# Auto-detect versioned tool directories
GHIDRA_DIR=$(ls -d "$ANDROID_RE_HOME"/tools/ghidra/ghidra_*_PUBLIC 2>/dev/null | head -1)
RADARE2_DIR=$(ls -d "$ANDROID_RE_HOME"/tools/radare2/radare2-*-w64 2>/dev/null | head -1)
DEX2JAR_DIR=$(ls -d "$ANDROID_RE_HOME"/tools/dex2jar/dex-tools-* 2>/dev/null | head -1)

BUILD_TOOLS_DIR=$(ls -d "$ANDROID_SDK_ROOT"/build-tools/* 2>/dev/null | sort -V | tail -1)

export PATH="$ANDROID_SDK_ROOT/platform-tools:${BUILD_TOOLS_DIR}:$ANDROID_RE_HOME/tools/jadx/bin:${DEX2JAR_DIR}:${RADARE2_DIR}/bin:${GHIDRA_DIR}/support:$ANDROID_RE_HOME/tools/trufflehog:$PATH"

echo "[setup-env] ANDROID_SDK_ROOT=$ANDROID_SDK_ROOT"
echo "[setup-env] ANDROID_RE_HOME=$ANDROID_RE_HOME"
echo "[setup-env] adb: $(which adb 2>/dev/null || echo 'not in PATH')"
echo "[setup-env] jadx: $(which jadx 2>/dev/null || echo 'not in PATH')"
