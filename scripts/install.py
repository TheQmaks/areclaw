#!/usr/bin/env python3
"""
Android Reversing Environment — Automated Installer & Updater

Installs all tools, downloads binaries, sets up pip packages.
Skips already-installed tools unless --update is passed.

Usage:
    python scripts/install.py              # Install missing tools
    python scripts/install.py --update     # Update all tools to latest
    python scripts/install.py --verify     # Only verify installations
    python scripts/install.py --dry-run    # Show what would be done
"""

import argparse
import io
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: requests required. Run: pip install requests")
    sys.exit(1)

# ── Paths ──────────────────────────────────────────────
RE_HOME = Path(__file__).parent.parent
TOOLS_DIR = RE_HOME / "tools"
WORKSPACE = RE_HOME / "workspace"
PYTOOLS = RE_HOME / "pytools"
SCRIPTS = RE_HOME / "scripts"
VERSIONS_FILE = RE_HOME / ".tool_versions.json"

# ── GitHub Token (optional, avoids rate limits) ────────
GH_HEADERS = {}
_gh_token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
if _gh_token:
    GH_HEADERS["Authorization"] = f"token {_gh_token}"

# ── Directories to create ─────────────────────────────
DIRECTORIES = [
    TOOLS_DIR,
    WORKSPACE / "samples",
    WORKSPACE / "output",
    WORKSPACE / "frida-scripts",
    WORKSPACE / "reports",
    WORKSPACE / "patches",
    WORKSPACE / "credentials",
    WORKSPACE / "traffic",
    WORKSPACE / "collections",
    PYTOOLS,
    SCRIPTS,
    RE_HOME / ".claude" / "agents",
    RE_HOME / ".claude" / "skills",
]

# ── GitHub tool definitions ────────────────────────────
GITHUB_TOOLS = {
    "jadx": {
        "repo": "skylot/jadx",
        "asset_match": lambda n: "no-jre-win" in n and n.endswith(".zip"),
        "asset_fallback": lambda n: n.endswith(".zip") and "jadx-" in n and "no-jre" not in n,
        "extract": "zip",
        "verify": "bin/jadx",
    },
    "apktool": {
        "repo": "iBotPeaches/Apktool",
        "asset_match": lambda n: n.endswith(".jar") and "apktool_" in n,
        "extract": "jar",
        "jar_name": "apktool.jar",
        "verify": "apktool.jar",
    },
    "dex2jar": {
        "repo": "pxb1988/dex2jar",
        "asset_match": lambda n: n.endswith(".zip") and "dex-tools" in n,
        "extract": "zip",
        "verify": "*/d2j-dex2jar.sh",
    },
    "uber-apk-signer": {
        "repo": "patrickfav/uber-apk-signer",
        "asset_match": lambda n: n.endswith(".jar") and "uber-apk-signer" in n,
        "extract": "jar",
        "jar_name": "uber-apk-signer.jar",
        "verify": "uber-apk-signer.jar",
    },
    "java-deobfuscator": {
        "repo": "java-deobfuscator/deobfuscator",
        "asset_match": lambda n: n.endswith(".jar") and "deobfuscator" in n.lower(),
        "extract": "jar",
        "jar_name": "deobfuscator.jar",
        "verify": "deobfuscator.jar",
    },
    "threadtear": {
        "repo": "GraxCode/threadtear",
        "asset_match": lambda n: n.endswith(".jar") and "threadtear" in n.lower(),
        "extract": "jar",
        "jar_name": "threadtear.jar",
        "verify": "threadtear.jar",
    },
    "simplify": {
        "repo": "CalebFenton/simplify",
        "asset_match": lambda n: n.endswith(".jar") and "simplify-" in n and "sdbg" not in n and "smalivm" not in n,
        "extract": "jar",
        "jar_name": "simplify.jar",
        "verify": "simplify.jar",
    },
    "il2cppdumper": {
        "repo": "Perfare/Il2CppDumper",
        "asset_match": lambda n: "net6-win" in n and n.endswith(".zip") and "arm" not in n.lower(),
        "extract": "zip",
        "verify": "Il2CppDumper.exe",
    },
    "radare2": {
        "repo": "radareorg/radare2",
        "asset_match": lambda n: n.endswith(".zip") and "w64" in n and "arm64" not in n and "blob" not in n,
        "extract": "zip",
        "verify": "*/bin/radare2.exe",
    },
    "ghidra": {
        "repo": "NationalSecurityAgency/ghidra",
        "asset_match": lambda n: n.endswith(".zip") and "PUBLIC" in n,
        "extract": "zip",
        "verify": "*/ghidraRun.bat",
    },
    "trufflehog": {
        "repo": "trufflesecurity/trufflehog",
        "asset_match": lambda n: "windows_amd64" in n and n.endswith(".tar.gz"),
        "extract": "tar.gz",
        "verify": "trufflehog.exe",
    },
}

# ── apk.sh (git-based, not release) ───────────────────
APK_SH = {
    "url": "https://raw.githubusercontent.com/ax/apk.sh/master/apk.sh",
    "dir": "apk.sh",
    "file": "apk.sh",
}

# ── Pip packages ───────────────────────────────────────
PIP_PACKAGES = [
    "frida-tools",
    "objection",
    "mitmproxy",
    "androguard",
    "apkid",
    "lxml",
    "requests",
    "sosaver",
    "clsdumper",
    "jnitrace",
    "fridump3",
    "r2pipe",
    "capstone",
    "unicorn",
    "mitmproxy2swagger",
    "apkleaks",
    "lief",
    "triton-library",
    "androidemu",
    "justapk",
    "tema",
]

# ── narumii-deobfuscator (built from source via Maven) ────
NARUMII = {
    "repo": "narumii/Deobfuscator",
    "branch": "v1",
    "dir": "narumii-deobfuscator",
    "jar_name": "Deobfuscator.jar",
}

# Maven portable URL (needed to build narumii from source)
MAVEN_VERSION = "3.9.16"
MAVEN_URL = f"https://dlcdn.apache.org/maven/maven-3/{MAVEN_VERSION}/binaries/apache-maven-{MAVEN_VERSION}-bin.zip"

# ── phantom-frida (downloaded from own releases) ─────
PHANTOM_FRIDA = {
    "repo": "TheQmaks/phantom-frida",
    "dir": "phantom-frida",
}


def load_versions():
    if VERSIONS_FILE.exists():
        return json.loads(VERSIONS_FILE.read_text())
    return {}


def save_versions(versions):
    VERSIONS_FILE.write_text(json.dumps(versions, indent=2))


def get_latest_release(repo):
    """Get latest release from GitHub API."""
    url = f"https://api.github.com/repos/{repo}/releases/latest"
    try:
        resp = requests.get(url, headers=GH_HEADERS, timeout=20)
        if resp.status_code == 200:
            return resp.json()
        # Try releases list
        url2 = f"https://api.github.com/repos/{repo}/releases"
        resp2 = requests.get(url2, headers=GH_HEADERS, timeout=20)
        if resp2.status_code == 200:
            releases = resp2.json()
            if releases:
                return releases[0]
    except requests.RequestException as e:
        print(f"  ERROR: {e}")
    return None


def find_asset(release, match_fn, fallback_fn=None):
    """Find matching asset in release."""
    assets = release.get("assets", [])
    for a in assets:
        if match_fn(a["name"]):
            return a
    if fallback_fn:
        for a in assets:
            if fallback_fn(a["name"]):
                return a
    return None


def download_file(url, dest):
    """Download file with progress."""
    resp = requests.get(url, stream=True, headers=GH_HEADERS, timeout=300)
    resp.raise_for_status()
    total = int(resp.headers.get("content-length", 0))
    downloaded = 0
    with open(dest, "wb") as f:
        for chunk in resp.iter_content(chunk_size=65536):
            f.write(chunk)
            downloaded += len(chunk)
            if total > 0:
                pct = downloaded * 100 // total
                mb = downloaded / 1048576
                print(f"\r  Downloading: {mb:.1f}MB ({pct}%)", end="", flush=True)
    print()


def extract_zip(zip_path, dest_dir):
    """Extract zip to directory (with path traversal protection)."""
    dest = Path(dest_dir).resolve()
    with zipfile.ZipFile(zip_path, "r") as z:
        for member in z.namelist():
            target = (dest / member).resolve()
            if not str(target).startswith(str(dest) + os.sep):
                raise ValueError(f"ZipSlip detected: {member}")
        z.extractall(dest_dir)


def extract_tar_gz(tar_path, dest_dir):
    """Extract tar.gz to directory."""
    with tarfile.open(tar_path, "r:gz") as t:
        if hasattr(tarfile, 'data_filter'):
            t.extractall(dest_dir, filter='data')
        else:
            t.extractall(dest_dir)


def tool_is_installed(name, info):
    """Check if a tool is already installed."""
    tool_dir = TOOLS_DIR / name
    if not tool_dir.exists():
        return False
    verify = info.get("verify", "")
    if "*" in verify:
        # Glob pattern
        import glob
        return bool(glob.glob(str(tool_dir / verify)))
    return (tool_dir / verify).exists()


def install_github_tool(name, info, dry_run=False, update=False):
    """Download and install a GitHub-released tool.

    When update=True, downloads to a staging dir first, then replaces.
    This prevents data loss if the download fails mid-update.
    """
    tool_dir = TOOLS_DIR / name
    print(f"\n  Fetching latest release for {info['repo']}...")

    release = get_latest_release(info["repo"])
    if not release:
        print(f"  ERROR: Could not fetch release for {name}")
        return False

    tag = release.get("tag_name", "unknown")
    asset = find_asset(release, info["asset_match"], info.get("asset_fallback"))
    if not asset:
        print(f"  ERROR: No matching asset found for {name} in {tag}")
        return False

    print(f"  Found: {asset['name']} ({asset['size'] / 1048576:.1f}MB) [{tag}]")

    if dry_run:
        print(f"  [DRY RUN] Would download and install to {tool_dir}")
        return True

    # When updating, use a staging directory to avoid data loss on failure
    staging_dir = TOOLS_DIR / f".{name}_staging" if update else tool_dir
    staging_dir.mkdir(parents=True, exist_ok=True)

    extract_type = info.get("extract", "zip")

    with tempfile.NamedTemporaryFile(suffix=Path(asset["name"]).suffix, delete=False) as tmp:
        tmp_path = tmp.name

    try:
        download_file(asset["browser_download_url"], tmp_path)

        if extract_type == "zip":
            print(f"  Extracting...")
            extract_zip(tmp_path, str(staging_dir))
        elif extract_type == "tar.gz":
            print(f"  Extracting...")
            extract_tar_gz(tmp_path, str(staging_dir))
        elif extract_type == "jar":
            jar_name = info.get("jar_name", asset["name"])
            shutil.copy2(tmp_path, str(staging_dir / jar_name))
        elif extract_type == "exe":
            exe_name = info.get("exe_name", asset["name"])
            shutil.copy2(tmp_path, str(staging_dir / exe_name))
    except Exception as e:
        print(f"  ERROR: Download/extract failed: {e}")
        if update and staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        return False
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    # If updating, swap staging dir into place (old -> delete, staging -> rename)
    if update and staging_dir != tool_dir:
        if tool_dir.exists():
            shutil.rmtree(tool_dir, ignore_errors=True)
        staging_dir.rename(tool_dir)

    # Save version
    versions = load_versions()
    versions[name] = {"version": tag, "asset": asset["name"]}
    save_versions(versions)

    print(f"  Installed {name} {tag}")
    return True


def install_apk_sh(dry_run=False):
    """Download apk.sh script."""
    dest_dir = TOOLS_DIR / APK_SH["dir"]
    dest_file = dest_dir / APK_SH["file"]

    if dest_file.exists() and dest_file.stat().st_size > 1000:
        print(f"\n[SKIP] apk.sh already installed")
        return True

    print(f"\n[INSTALL] apk.sh")
    if dry_run:
        print(f"  [DRY RUN] Would download apk.sh")
        return True

    dest_dir.mkdir(parents=True, exist_ok=True)
    resp = requests.get(APK_SH["url"], timeout=30)
    resp.raise_for_status()
    dest_file.write_text(resp.text)
    print(f"  Downloaded ({len(resp.text)} bytes)")
    return True


def ensure_maven():
    """Ensure Maven is available, download portable if not."""
    # Check system Maven first
    try:
        result = subprocess.run(
            ["mvn", "--version"], capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return "mvn"
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Check our portable Maven
    maven_dir = TOOLS_DIR / "maven"
    mvn_bin = maven_dir / f"apache-maven-{MAVEN_VERSION}" / "bin" / "mvn"
    if platform.system() == "Windows":
        mvn_bin = mvn_bin.with_suffix(".cmd")
    if mvn_bin.exists():
        return str(mvn_bin)

    # Download portable Maven
    print(f"  Downloading Maven {MAVEN_VERSION} (portable)...")
    maven_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        download_file(MAVEN_URL, tmp_path)
        extract_zip(tmp_path, str(maven_dir))
    finally:
        os.unlink(tmp_path)

    if mvn_bin.exists():
        print(f"  Maven {MAVEN_VERSION} ready")
        return str(mvn_bin)

    print("  ERROR: Maven download failed")
    return None


def install_narumii(dry_run=False, force=False):
    """Build narumii-deobfuscator from source via Maven."""
    tool_dir = TOOLS_DIR / NARUMII["dir"]
    jar_path = tool_dir / NARUMII["jar_name"]

    if jar_path.exists() and not force:
        # Ensure version is tracked even if installed manually
        versions = load_versions()
        if "narumii-deobfuscator" not in versions:
            try:
                resp = requests.get(
                    f"https://api.github.com/repos/{NARUMII['repo']}/commits/{NARUMII['branch']}",
                    headers=GH_HEADERS, timeout=10
                )
                if resp.status_code == 200:
                    sha = resp.json()["sha"][:8]
                    versions["narumii-deobfuscator"] = {"version": f"v1@{sha}", "branch": NARUMII["branch"]}
                    save_versions(versions)
            except Exception:
                pass
        print(f"\n[SKIP] narumii-deobfuscator (already installed)")
        return True

    print(f"\n[INSTALL] narumii-deobfuscator (building from source)")

    if dry_run:
        print(f"  [DRY RUN] Would clone {NARUMII['repo']} and build with Maven")
        return True

    # Ensure Maven is available
    mvn = ensure_maven()
    if not mvn:
        print("  ERROR: Maven not available, cannot build narumii")
        return False

    # Clone to temp directory
    with tempfile.TemporaryDirectory() as tmp_dir:
        clone_url = f"https://github.com/{NARUMII['repo']}.git"
        print(f"  Cloning {NARUMII['repo']} (branch {NARUMII['branch']})...")
        result = subprocess.run(
            ["git", "clone", "--depth", "1", "--branch", NARUMII["branch"],
             clone_url, tmp_dir],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            print(f"  ERROR: git clone failed: {result.stderr.strip()}")
            return False

        # Add maven-shade-plugin for fat JAR (pom.xml has no uber-jar plugin)
        pom_path = Path(tmp_dir) / "pom.xml"
        pom_text = pom_path.read_text(encoding="utf-8")
        shade_plugin = """
    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-shade-plugin</artifactId>
                <version>3.6.0</version>
                <executions>
                    <execution>
                        <phase>package</phase>
                        <goals><goal>shade</goal></goals>
                        <configuration>
                            <transformers>
                                <transformer implementation="org.apache.maven.plugins.shade.resource.ManifestResourceTransformer">
                                    <mainClass>uwu.narumi.deobfuscator.Deobfuscator</mainClass>
                                </transformer>
                            </transformers>
                            <createDependencyReducedPom>false</createDependencyReducedPom>
                        </configuration>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
"""
        # Insert <build> before closing </project>
        if "<build>" not in pom_text:
            pom_text = pom_text.replace("</project>", shade_plugin + "</project>")
            pom_path.write_text(pom_text, encoding="utf-8")

        # Build
        print(f"  Building with Maven (this may take a minute)...")
        env = os.environ.copy()
        java_home = os.environ.get("JAVA_HOME")
        if java_home:
            env["JAVA_HOME"] = java_home
        else:
            print("  WARNING: JAVA_HOME not set, Maven will use Java from PATH")
        result = subprocess.run(
            [mvn, "package", "-DskipTests", "-q"],
            cwd=tmp_dir, capture_output=True, text=True, timeout=300, env=env
        )
        if result.returncode != 0:
            print(f"  ERROR: Maven build failed:")
            # Show last 20 lines of output
            lines = (result.stdout + result.stderr).strip().split("\n")
            for line in lines[-20:]:
                print(f"    {line}")
            return False

        # Find the built JAR (shaded JAR is the one without 'original-' prefix)
        target_dir = Path(tmp_dir) / "target"
        built_jars = [f for f in target_dir.glob("*.jar")
                      if not f.name.startswith("original-")]
        if not built_jars:
            print("  ERROR: No JAR found after build")
            return False

        built_jar = built_jars[0]
        tool_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(built_jar), str(jar_path))
        print(f"  Built {jar_path.name} ({jar_path.stat().st_size / 1048576:.1f}MB)")

    # Save version (track commit SHA)
    try:
        resp = requests.get(
            f"https://api.github.com/repos/{NARUMII['repo']}/commits/{NARUMII['branch']}",
            headers=GH_HEADERS, timeout=10
        )
        if resp.status_code == 200:
            sha = resp.json()["sha"][:8]
            versions = load_versions()
            versions["narumii-deobfuscator"] = {"version": f"v1@{sha}", "branch": NARUMII["branch"]}
            save_versions(versions)
    except Exception:
        pass

    print(f"  Installed narumii-deobfuscator")
    return True


def install_phantom_frida(dry_run=False, force=False):
    """Download latest phantom-frida stealth build from GitHub Releases."""
    import gzip

    tool_dir = TOOLS_DIR / PHANTOM_FRIDA["dir"]
    build_info_path = tool_dir / "build-info.json"

    if build_info_path.exists() and not force:
        info = json.loads(build_info_path.read_text())
        print(f"\n[SKIP] phantom-frida (installed: {info.get('name', '?')} "
              f"v{info.get('version', '?')} port:{info.get('port', '?')})")
        return True

    print(f"\n[INSTALL] phantom-frida")
    release = get_latest_release(PHANTOM_FRIDA["repo"])
    if not release:
        print("  ERROR: Could not fetch phantom-frida release")
        return False

    tag = release.get("tag_name", "unknown")
    assets = release.get("assets", [])

    # Find build-info.json and server .gz
    info_asset = next((a for a in assets if a["name"] == "build-info.json"), None)
    server_asset = next((a for a in assets if a["name"].endswith("-server-" + tag.lstrip("v").split("-")[0] + "-android-arm64.gz")
                         or ("server" in a["name"] and a["name"].endswith(".gz"))), None)

    if not info_asset or not server_asset:
        print(f"  ERROR: Release {tag} missing expected assets")
        print(f"  Available: {[a['name'] for a in assets]}")
        return False

    print(f"  Found: {server_asset['name']} ({server_asset['size'] / 1048576:.1f}MB) [{tag}]")

    if dry_run:
        print(f"  [DRY RUN] Would download to {tool_dir}")
        return True

    tool_dir.mkdir(parents=True, exist_ok=True)

    # Download build-info.json
    resp = requests.get(info_asset["browser_download_url"], headers=GH_HEADERS, timeout=30)
    resp.raise_for_status()
    build_info = resp.json()
    build_info_path.write_text(json.dumps(build_info, indent=2))
    server_name = build_info.get("name", "phantom")

    # Download and decompress server binary
    with tempfile.NamedTemporaryFile(suffix=".gz", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        download_file(server_asset["browser_download_url"], tmp_path)
        server_dest = tool_dir / f"{server_name}-server"
        print(f"  Extracting to {server_dest.name}...")
        with gzip.open(tmp_path, "rb") as gz:
            server_dest.write_bytes(gz.read())
    finally:
        os.unlink(tmp_path)

    # Save version
    versions = load_versions()
    versions["phantom-frida"] = {
        "version": tag,
        "name": server_name,
        "port": build_info.get("port"),
        "frida_version": build_info.get("version"),
    }
    save_versions(versions)

    print(f"  Installed phantom-frida [{tag}]: name={server_name}, port={build_info.get('port')}")
    return True


def install_pip_packages(dry_run=False):
    """Install all pip packages."""
    print("\n=== PIP PACKAGES ===")

    # Get currently installed
    result = subprocess.run(
        [sys.executable, "-m", "pip", "list", "--format=json"],
        capture_output=True, text=True, timeout=30
    )
    installed = {}
    if result.returncode == 0:
        for pkg in json.loads(result.stdout):
            installed[pkg["name"].lower().replace("-", "_")] = pkg["version"]

    to_install = []
    for pkg in PIP_PACKAGES:
        normalized = pkg.lower().replace("-", "_")
        if normalized in installed:
            print(f"  [OK] {pkg} ({installed[normalized]})")
        else:
            print(f"  [MISSING] {pkg}")
            to_install.append(pkg)

    if not to_install:
        print("  All pip packages installed.")
        return True

    if dry_run:
        print(f"  [DRY RUN] Would install: {', '.join(to_install)}")
        return True

    print(f"\n  Installing {len(to_install)} packages...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install"] + to_install,
        timeout=300
    )
    return result.returncode == 0


def verify_all():
    """Verify all installations."""
    print("\n" + "=" * 50)
    print("  VERIFICATION REPORT")
    print("=" * 50)

    ok = 0
    fail = 0

    # Tools
    print("\n--- Standalone Tools ---")
    for name, info in GITHUB_TOOLS.items():
        if tool_is_installed(name, info):
            print(f"  [OK] {name}")
            ok += 1
        else:
            print(f"  [FAIL] {name}")
            fail += 1

    # apk.sh
    if (TOOLS_DIR / "apk.sh" / "apk.sh").exists():
        print(f"  [OK] apk.sh")
        ok += 1
    else:
        print(f"  [FAIL] apk.sh")
        fail += 1

    # narumii
    if (TOOLS_DIR / "narumii-deobfuscator" / "Deobfuscator.jar").exists():
        print(f"  [OK] narumii-deobfuscator")
        ok += 1
    else:
        print(f"  [FAIL] narumii-deobfuscator")
        fail += 1

    # phantom-frida
    pf_info_path = TOOLS_DIR / "phantom-frida" / "build-info.json"
    if pf_info_path.exists():
        pf = json.loads(pf_info_path.read_text())
        print(f"  [OK] phantom-frida ({pf.get('name')} v{pf.get('version')} port:{pf.get('port')})")
        ok += 1
    else:
        print(f"  [FAIL] phantom-frida")
        fail += 1

    # Pip packages
    print("\n--- Pip Packages ---")
    # Packages where import name differs from pip name
    IMPORT_MAP = {
        "frida-tools": "frida",
        "apkid": "apkid",
        "triton-library": "triton",
        "mitmproxy2swagger": "mitmproxy2swagger",
        "apkleaks": "apkleaks",
        "androidemu": "androidemu",
    }
    for pkg in PIP_PACKAGES:
        try:
            import_name = IMPORT_MAP.get(pkg, pkg.replace("-", "_").lower())
            try:
                __import__(import_name)
            except ImportError:
                # Fallback: check if pip knows about it
                result = subprocess.run(
                    [sys.executable, "-m", "pip", "show", pkg],
                    capture_output=True, text=True, timeout=10
                )
                if result.returncode != 0:
                    raise ImportError(f"{pkg} not installed")
            print(f"  [OK] {pkg}")
            ok += 1
        except (ImportError, subprocess.TimeoutExpired):
            print(f"  [FAIL] {pkg}")
            fail += 1

    # Frida scripts
    print("\n--- Frida Scripts ---")
    scripts_dir = WORKSPACE / "frida-scripts"
    if scripts_dir.exists():
        count = len(list(scripts_dir.glob("*.js")))
        print(f"  [OK] {count} scripts found")
        ok += 1
    else:
        print(f"  [FAIL] No scripts directory")
        fail += 1

    # Python tools
    print("\n--- Python Tools ---")
    for tool in ["ui_explorer.py", "traffic_to_collection.py", "check_updates.py"]:
        if (PYTOOLS / tool).exists():
            print(f"  [OK] {tool}")
            ok += 1
        else:
            print(f"  [FAIL] {tool}")
            fail += 1

    print(f"\n--- Result: {ok} OK, {fail} FAIL ---")
    return fail == 0


def main():
    parser = argparse.ArgumentParser(description="Android Reversing Environment Installer")
    parser.add_argument("--update", action="store_true", help="Update all tools to latest versions")
    parser.add_argument("--verify", action="store_true", help="Only verify installations")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done")
    parser.add_argument("--tools-only", action="store_true", help="Only install standalone tools")
    parser.add_argument("--pip-only", action="store_true", help="Only install pip packages")
    args = parser.parse_args()

    if args.verify:
        success = verify_all()
        sys.exit(0 if success else 1)

    print("=" * 50)
    print("  Android Reversing Environment Installer")
    print("=" * 50)

    # Create directories
    print("\n=== Creating directories ===")
    for d in DIRECTORIES:
        d.mkdir(parents=True, exist_ok=True)
    print(f"  Created {len(DIRECTORIES)} directories")

    if not args.pip_only:
        # Install GitHub tools
        print("\n=== STANDALONE TOOLS ===")
        for name, info in GITHUB_TOOLS.items():
            if tool_is_installed(name, info) and not args.update:
                print(f"\n[SKIP] {name} (already installed)")
            else:
                action = "UPDATE" if tool_is_installed(name, info) else "INSTALL"
                print(f"\n[{action}] {name}")
                install_github_tool(name, info, dry_run=args.dry_run,
                                    update=(action == "UPDATE"))

        # apk.sh
        install_apk_sh(dry_run=args.dry_run)

        # narumii-deobfuscator (built from source)
        install_narumii(dry_run=args.dry_run, force=args.update)

        # phantom-frida
        install_phantom_frida(dry_run=args.dry_run, force=args.update)

    if not args.tools_only:
        # Pip packages
        install_pip_packages(dry_run=args.dry_run)

    # Verify
    verify_all()

    print("\nDone! Run 'source scripts/setup-env.sh' to configure PATH.")


if __name__ == "__main__":
    main()
