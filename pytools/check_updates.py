#!/usr/bin/env python3
"""
Tool Update Checker — Checks all Android reversing tools for available updates.
Compares installed versions against latest GitHub releases.

Usage:
    python check_updates.py           -> check all tools
    python check_updates.py --json    -> output as JSON
    To install updates: python scripts/install.py --update
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: requests required. Install: pip install requests", file=sys.stderr)
    sys.exit(1)

RE_HOME = Path(__file__).parent.parent
TOOLS_DIR = RE_HOME / "tools"

# Tool definitions: name ->{ repo, current_version_cmd, asset_pattern, install_fn }
GITHUB_TOOLS = {
    "jadx": {
        "repo": "skylot/jadx",
        "version_cmd": [str(TOOLS_DIR / "jadx" / "bin" / "jadx"), "--version"],
        "version_regex": r"(\d+\.\d+\.\d+)",
        "asset_pattern": r"jadx-[\d.]+-no-jre-win\.zip|jadx-[\d.]+\.zip",
        "install_dir": "jadx",
    },
    "apktool": {
        "repo": "iBotPeaches/Apktool",
        "version_cmd": ["java", "-jar", str(TOOLS_DIR / "apktool" / "apktool.jar"), "--version"],
        "version_regex": r"(\d+\.\d+\.\d+)",
        "asset_pattern": r"apktool_[\d.]+\.jar",
        "install_dir": "apktool",
        "single_jar": "apktool.jar",
    },
    "dex2jar": {
        "repo": "pxb1988/dex2jar",
        "version_regex": r"v?([\d.]+)",
        "asset_pattern": r"dex-tools.*\.zip",
        "install_dir": "dex2jar",
    },
    "uber-apk-signer": {
        "repo": "patrickfav/uber-apk-signer",
        "version_cmd": ["java", "-jar", str(TOOLS_DIR / "uber-apk-signer" / "uber-apk-signer.jar"), "--version"],
        "version_regex": r"(\d+\.\d+\.\d+)",
        "asset_pattern": r"uber-apk-signer.*\.jar",
        "install_dir": "uber-apk-signer",
        "single_jar": "uber-apk-signer.jar",
    },
    "java-deobfuscator": {
        "repo": "java-deobfuscator/deobfuscator",
        "version_regex": r"v?([\d.]+)",
        "asset_pattern": r"deobfuscator.*\.jar",
        "install_dir": "java-deobfuscator",
        "single_jar": "deobfuscator.jar",
    },
    "threadtear": {
        "repo": "GraxCode/threadtear",
        "version_regex": r"v?([\d.]+)",
        "asset_pattern": r"threadtear.*\.jar",
        "install_dir": "threadtear",
        "single_jar": "threadtear.jar",
    },
    # narumii-deobfuscator: no releases, tracked via commits (see check_narumii)
    "simplify": {
        "repo": "CalebFenton/simplify",
        "version_regex": r"v?([\d.]+)",
        "asset_pattern": r"simplify-[\d.]+\.jar",
        "install_dir": "simplify",
        "single_jar": "simplify.jar",
    },
    "il2cppdumper": {
        "repo": "Perfare/Il2CppDumper",
        "version_regex": r"v?([\d.]+)",
        "asset_pattern": r"Il2CppDumper-net6-win.*\.zip",
        "install_dir": "il2cppdumper",
    },
    "trufflehog": {
        "repo": "trufflesecurity/trufflehog",
        "version_regex": r"v?([\d.]+)",
        "asset_pattern": r"trufflehog_.*_windows_amd64\.tar\.gz",
        "install_dir": "trufflehog",
    },
    "ghidra": {
        "repo": "NationalSecurityAgency/ghidra",
        "version_regex": r"Ghidra_([\d.]+)",
        "asset_pattern": r"ghidra_.*_PUBLIC_.*\.zip",
        "install_dir": "ghidra",
    },
    "radare2": {
        "repo": "radareorg/radare2",
        "version_regex": r"([\d.]+)",
        "asset_pattern": r"radare2-.*-w64\.zip",
        "install_dir": "radare2",
    },
}

PIP_PACKAGES = [
    "frida", "frida-tools",
    "objection", "mitmproxy", "androguard", "apkid",
    "lxml", "requests", "sosaver", "clsdumper",
    "jnitrace", "fridump3",
    "r2pipe", "capstone", "unicorn", "mitmproxy2swagger",
    "apkleaks", "lief", "triton-library", "androidemu",
    "justapk",
    "tema",
]

PHANTOM_FRIDA_REPO = "TheQmaks/phantom-frida"

VERSIONS_FILE = RE_HOME / ".tool_versions.json"


def load_versions():
    """Load saved version info."""
    if VERSIONS_FILE.exists():
        with open(VERSIONS_FILE) as f:
            return json.load(f)
    return {}


def save_versions(versions):
    """Save version info."""
    with open(VERSIONS_FILE, "w") as f:
        json.dump(versions, f, indent=2)


def get_installed_version(tool_name, tool_info):
    """Get currently installed version of a tool."""
    # Try command
    if "version_cmd" in tool_info:
        try:
            result = subprocess.run(
                tool_info["version_cmd"],
                capture_output=True, text=True, timeout=15
            )
            output = result.stdout + result.stderr
            match = re.search(tool_info["version_regex"], output)
            if match:
                return match.group(1)
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass

    # Fall back to saved versions
    versions = load_versions()
    return versions.get(tool_name, {}).get("installed_version", "unknown")


def get_latest_github_release(repo):
    """Get latest release info from GitHub API."""
    url = f"https://api.github.com/repos/{repo}/releases/latest"
    headers = {}
    gh_token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if gh_token:
        headers["Authorization"] = f"token {gh_token}"

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            tag = data.get("tag_name", "")
            version = re.sub(r"^v", "", tag)
            assets = [
                {"name": a["name"], "url": a["browser_download_url"], "size": a["size"]}
                for a in data.get("assets", [])
            ]
            return {"version": version, "tag": tag, "assets": assets}
        elif resp.status_code == 404:
            # Try releases list (some repos don't have "latest")
            url2 = f"https://api.github.com/repos/{repo}/releases"
            resp2 = requests.get(url2, headers=headers, timeout=15)
            if resp2.status_code == 200:
                releases = resp2.json()
                if releases:
                    data = releases[0]
                    tag = data.get("tag_name", "")
                    version = re.sub(r"^v", "", tag)
                    assets = [
                        {"name": a["name"], "url": a["browser_download_url"], "size": a["size"]}
                        for a in data.get("assets", [])
                    ]
                    return {"version": version, "tag": tag, "assets": assets}
    except requests.RequestException as e:
        return {"error": str(e)}

    return {"error": f"HTTP {resp.status_code}"}


def get_pip_versions():
    """Get installed and latest versions of pip packages."""
    results = {}
    try:
        output = subprocess.run(
            [sys.executable, "-m", "pip", "list", "--outdated", "--format=json"],
            capture_output=True, text=True, timeout=60
        )
        if output.returncode == 0:
            outdated = json.loads(output.stdout)
            for pkg in outdated:
                results[pkg["name"].lower()] = {
                    "installed": pkg["version"],
                    "latest": pkg["latest_version"],
                    "outdated": True,
                }
    except (subprocess.TimeoutExpired, json.JSONDecodeError):
        pass

    # Get installed versions for non-outdated
    try:
        output = subprocess.run(
            [sys.executable, "-m", "pip", "list", "--format=json"],
            capture_output=True, text=True, timeout=30
        )
        if output.returncode == 0:
            installed = json.loads(output.stdout)
            for pkg in installed:
                name = pkg["name"].lower()
                if name not in results:
                    results[name] = {
                        "installed": pkg["version"],
                        "latest": pkg["version"],
                        "outdated": False,
                    }
    except (subprocess.TimeoutExpired, json.JSONDecodeError):
        pass

    return results


def check_frida_version():
    """Check frida and frida-tools versions."""
    result = {}
    try:
        output = subprocess.run(
            ["frida", "--version"],
            capture_output=True, text=True, timeout=10
        )
        if output.returncode == 0:
            result["frida"] = output.stdout.strip()
    except FileNotFoundError:
        result["frida"] = "not found"
    return result


def check_narumii():
    """Check narumii-deobfuscator for new commits (no releases available)."""
    repo = "narumii/Deobfuscator"
    branch = "v1"
    headers = {}
    gh_token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if gh_token:
        headers["Authorization"] = f"token {gh_token}"

    # Get installed commit SHA from saved versions
    versions = load_versions()
    installed_info = versions.get("narumii-deobfuscator", {})
    installed_ver = installed_info.get("version", "unknown")  # e.g. "v1@abc12345"
    installed_sha = installed_ver.split("@")[1] if "@" in installed_ver else None

    # Check if JAR exists on disk even without version tracking
    jar_exists = (TOOLS_DIR / "narumii-deobfuscator" / "Deobfuscator.jar").exists()
    if installed_ver == "unknown" and jar_exists:
        installed_ver = "installed (untracked)"

    # Get latest commit on v1 branch
    try:
        resp = requests.get(
            f"https://api.github.com/repos/{repo}/commits/{branch}",
            headers=headers, timeout=15
        )
        if resp.status_code == 200:
            data = resp.json()
            latest_sha = data["sha"][:8]
            latest_date = data["commit"]["committer"]["date"][:10]
            is_outdated = installed_sha and installed_sha != latest_sha
            return {
                "installed": installed_ver,
                "latest": f"v1@{latest_sha} ({latest_date})",
                "status": "outdated" if is_outdated else ("unknown" if not installed_sha else "up_to_date"),
                "repo": repo,
            }
    except requests.RequestException as e:
        return {"installed": installed_ver, "latest": f"error: {e}", "status": "check_failed"}

    return {"installed": installed_ver, "latest": "check failed", "status": "check_failed"}


def main():
    parser = argparse.ArgumentParser(description="Check Android reversing tools for updates")
    parser.add_argument("--update", action="store_true",
                        help="Suppress the update hint (actual updates: python scripts/install.py --update)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    results = {"github_tools": {}, "pip_packages": {}, "frida": {}}
    updates_available = []

    # --- GitHub tools ---
    print("Checking GitHub tools...", file=sys.stderr)
    for name, info in GITHUB_TOOLS.items():
        installed = get_installed_version(name, info)
        latest_info = get_latest_github_release(info["repo"])

        if "error" in latest_info:
            results["github_tools"][name] = {
                "installed": installed,
                "latest": f"error: {latest_info['error']}",
                "status": "check_failed",
            }
        else:
            latest = latest_info["version"]
            is_outdated = installed != latest and installed != "unknown"
            status = "outdated" if is_outdated else ("unknown" if installed == "unknown" else "up_to_date")

            results["github_tools"][name] = {
                "installed": installed,
                "latest": latest,
                "status": status,
                "repo": info["repo"],
            }

            if is_outdated or installed == "unknown":
                updates_available.append(f"  {name}: {installed} ->{latest} ({info['repo']})")

            # Save version info
            versions = load_versions()
            if name not in versions:
                versions[name] = {}
            versions[name]["latest_version"] = latest
            versions[name]["latest_tag"] = latest_info.get("tag", "")
            if installed != "unknown":
                versions[name]["installed_version"] = installed
            save_versions(versions)

    # --- narumii (commit-based, no releases) ---
    print("Checking narumii-deobfuscator...", file=sys.stderr)
    narumii_info = check_narumii()
    results["github_tools"]["narumii-deobfuscator"] = narumii_info
    if narumii_info["status"] == "outdated":
        updates_available.append(f"  narumii-deobfuscator: {narumii_info['installed']} ->{narumii_info['latest']}")

    # --- pip packages ---
    print("Checking pip packages...", file=sys.stderr)
    pip_info = get_pip_versions()
    for pkg in PIP_PACKAGES:
        pkg_lower = pkg.lower()
        if pkg_lower in pip_info:
            info = pip_info[pkg_lower]
            results["pip_packages"][pkg] = info
            if info["outdated"]:
                updates_available.append(f"  {pkg}: {info['installed']} ->{info['latest']}")
        else:
            results["pip_packages"][pkg] = {"installed": "not found", "latest": "?", "outdated": False}

    # --- Frida ---
    print("Checking Frida...", file=sys.stderr)
    results["frida"] = check_frida_version()

    # --- phantom-frida ---
    print("Checking phantom-frida...", file=sys.stderr)
    pf_info_path = TOOLS_DIR / "phantom-frida" / "build-info.json"
    pf_installed_tag = None
    if pf_info_path.exists():
        pf_local = json.loads(pf_info_path.read_text())
        pf_installed_tag = f"v{pf_local.get('version', '?')}-{pf_local.get('date', '?').replace('-', '')}"

    pf_latest = get_latest_github_release(PHANTOM_FRIDA_REPO)
    if "error" not in pf_latest:
        pf_latest_tag = pf_latest.get("tag", "?")
        pf_outdated = pf_installed_tag and pf_installed_tag != pf_latest_tag
        results["phantom_frida"] = {
            "installed": pf_installed_tag or "not installed",
            "latest": pf_latest_tag,
            "status": "outdated" if pf_outdated else ("not_installed" if not pf_installed_tag else "up_to_date"),
        }
        if pf_outdated:
            updates_available.append(f"  phantom-frida: {pf_installed_tag} ->{pf_latest_tag}")
        elif not pf_installed_tag:
            updates_available.append(f"  phantom-frida: not installed (latest: {pf_latest_tag})")
    else:
        results["phantom_frida"] = {"installed": pf_installed_tag or "not installed", "latest": "check failed", "status": "check_failed"}

    # --- Output ---
    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print("\n=== Android Reversing Tools — Update Check ===\n")

        print("GitHub Tools:")
        for name, info in results["github_tools"].items():
            status_icon = {"up_to_date": "[OK]", "outdated": "[UPDATE]", "unknown": "[?]", "check_failed": "[ERR]"}.get(info["status"], "[?]")
            print(f"  {status_icon} {name}: {info['installed']} (latest: {info['latest']})")

        print("\nPip Packages:")
        for name, info in results["pip_packages"].items():
            icon = "[UPDATE]" if info.get("outdated") else "[OK]"
            if info["installed"] == "not found":
                icon = "[MISSING]"
            print(f"  {icon} {name}: {info['installed']}" + (f" ->{info['latest']}" if info.get("outdated") else ""))

        print(f"\nFrida: {results['frida'].get('frida', 'not checked')}")

        pf = results.get("phantom_frida", {})
        pf_icon = {"up_to_date": "[OK]", "outdated": "[UPDATE]", "not_installed": "[MISSING]", "check_failed": "[ERR]"}.get(pf.get("status"), "[?]")
        print(f"phantom-frida: {pf_icon} {pf.get('installed', '?')} (latest: {pf.get('latest', '?')})")

        if updates_available:
            print(f"\n--- {len(updates_available)} update(s) available ---")
            for u in updates_available:
                print(u)
            if not args.update:
                print("\nTo install updates: python scripts/install.py --update")
        else:
            print("\nAll tools are up to date!")


if __name__ == "__main__":
    main()
