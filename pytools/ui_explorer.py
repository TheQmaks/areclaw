#!/usr/bin/env python3
"""
UI Explorer — CLI for UIAutomator interaction via adb.
Parses UI hierarchy, navigates elements, takes screenshots, BFS screen exploration.

Usage:
    python ui_explorer.py dump                          → JSON UI tree
    python ui_explorer.py screenshot out.png            → screenshot
    python ui_explorer.py tap --id "btn_login"          → tap by resource-id
    python ui_explorer.py tap --text "Sign Up"          → tap by text
    python ui_explorer.py tap --xy 540 960              → tap by coordinates
    python ui_explorer.py tap --xpath '//node[@class="android.widget.Button"]'  → tap by XPath
    python ui_explorer.py input --id "email" "text"     → type text into field
    python ui_explorer.py xpath '//node[@clickable="true"]'  → query UI tree with XPath
    python ui_explorer.py swipe up|down|left|right      → swipe gesture
    python ui_explorer.py activity                      → current Activity
    python ui_explorer.py explore --depth 3             → BFS screen map
    python ui_explorer.py snapshot                      → screenshot + UI tree + Activity
    python ui_explorer.py back                          → press back
    python ui_explorer.py home                          → press home
    python ui_explorer.py list-packages [--filter str]  → list installed packages
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from collections import deque
from pathlib import Path

try:
    from lxml import etree
except ImportError:
    print("ERROR: lxml required. Install: pip install lxml", file=sys.stderr)
    sys.exit(1)

# Resolve adb path
ADB_PATHS = [
    os.environ.get("ANDROID_SDK_ROOT", "") + "/platform-tools/adb",
    os.environ.get("ANDROID_SDK_ROOT", "") + "/platform-tools/adb.exe",
    str(Path.home() / "AppData/Local/Android/Sdk/platform-tools/adb.exe"),
    "adb",
]

ADB = None
for p in ADB_PATHS:
    try:
        subprocess.run([p, "version"], capture_output=True, timeout=5)
        ADB = p
        break
    except (FileNotFoundError, subprocess.TimeoutExpired):
        continue

if not ADB:
    print("ERROR: adb not found. Set ANDROID_SDK_ROOT or add to PATH.", file=sys.stderr)
    sys.exit(1)


def adb(*args, timeout=30):
    """Run adb command, return stdout."""
    cmd = [ADB] + list(args)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0 and result.stderr.strip():
        print(f"adb error: {result.stderr.strip()}", file=sys.stderr)
    return result.stdout.strip()


def adb_shell(*args, timeout=30):
    """Run adb shell command."""
    return adb("shell", *args, timeout=timeout)


def dump_ui_xml():
    """Dump UI hierarchy XML from device, return parsed tree."""
    remote_path = "/sdcard/ui_dump.xml"
    adb_shell("uiautomator", "dump", remote_path)

    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
        local_path = tmp.name

    adb("pull", remote_path, local_path)
    adb_shell("rm", remote_path)

    with open(local_path, "rb") as f:
        tree = etree.parse(f)
    os.unlink(local_path)
    return tree


def parse_bounds(bounds_str):
    """Parse '[x1,y1][x2,y2]' → (x1, y1, x2, y2)."""
    try:
        parts = bounds_str.replace("][", ",").strip("[]").split(",")
        return tuple(int(p) for p in parts)
    except (ValueError, AttributeError):
        return None


def element_center(elem):
    """Get center coordinates of UI element."""
    bounds = parse_bounds(elem.get("bounds", ""))
    if not bounds:
        return None
    x1, y1, x2, y2 = bounds
    return ((x1 + x2) // 2, (y1 + y2) // 2)


def element_to_dict(elem):
    """Convert XML element to dict."""
    d = dict(elem.attrib)
    bounds = parse_bounds(d.get("bounds", ""))
    if bounds:
        d["_center"] = {"x": (bounds[0] + bounds[2]) // 2, "y": (bounds[1] + bounds[3]) // 2}
    children = [element_to_dict(child) for child in elem]
    if children:
        d["children"] = children
    return d


def xpath_query(tree, expression):
    """Query UI tree with XPath expression. Returns list of matching elements."""
    try:
        results = tree.xpath(expression)
        return results if isinstance(results, list) else [results]
    except etree.XPathError as e:
        print(f"XPath error: {e}", file=sys.stderr)
        return []


def find_element(tree, resource_id=None, text=None, content_desc=None, class_name=None, xpath=None):
    """Find UI element by attribute or XPath. Returns first match."""
    if xpath:
        results = xpath_query(tree, xpath)
        return results[0] if results else None

    root = tree.getroot()
    for elem in root.iter():
        if resource_id and resource_id in (elem.get("resource-id", "")):
            return elem
        if text and text == elem.get("text", ""):
            return elem
        if content_desc and content_desc == elem.get("content-desc", ""):
            return elem
        if class_name and class_name == elem.get("class", ""):
            return elem
    return None


def find_all_clickable(tree):
    """Find all clickable/interactive elements."""
    root = tree.getroot()
    elements = []
    for elem in root.iter():
        if elem.get("clickable") == "true" or elem.get("checkable") == "true":
            info = {
                "resource-id": elem.get("resource-id", ""),
                "text": elem.get("text", ""),
                "content-desc": elem.get("content-desc", ""),
                "class": elem.get("class", ""),
                "bounds": elem.get("bounds", ""),
            }
            center = element_center(elem)
            if center:
                info["center"] = {"x": center[0], "y": center[1]}
            elements.append(info)
    return elements


def tap(x, y):
    """Tap at coordinates."""
    adb_shell("input", "tap", str(x), str(y))


def get_screen_size():
    """Get device screen dimensions."""
    try:
        out = subprocess.run(
            [ADB, "shell", "wm", "size"], capture_output=True, text=True, timeout=5
        )
        # Output: "Physical size: 1440x2960"
        match = re.search(r'(\d+)x(\d+)', out.stdout)
        if match:
            return int(match.group(1)), int(match.group(2))
    except Exception:
        pass
    return 1080, 2340  # fallback


def swipe_gesture(direction, duration=300):
    """Swipe in direction. Screen size detected dynamically."""
    w, h = get_screen_size()
    cx, cy = w // 2, h // 2
    moves = {
        "up": (cx, cy + 400, cx, cy - 400),
        "down": (cx, cy - 400, cx, cy + 400),
        "left": (cx + 300, cy, cx - 300, cy),
        "right": (cx - 300, cy, cx + 300, cy),
    }
    if direction not in moves:
        print(f"Unknown direction: {direction}. Use: up/down/left/right", file=sys.stderr)
        return
    x1, y1, x2, y2 = moves[direction]
    adb_shell("input", "swipe", str(x1), str(y1), str(x2), str(y2), str(duration))


def input_text(text):
    """Type text via adb. Escapes special characters for shell."""
    escaped = text.replace("\\", "\\\\")
    for ch in ' &<>\'\"()`;|$!~':
        escaped = escaped.replace(ch, "\\" + ch)
    adb_shell("input", "text", escaped)


def get_current_activity():
    """Get currently focused Activity."""
    output = adb_shell("dumpsys", "activity", "activities")
    for line in output.splitlines():
        if "mResumedActivity" in line or "mFocusedActivity" in line:
            # Extract component name
            parts = line.strip().split()
            for part in parts:
                if "/" in part and "." in part:
                    return part.rstrip("}")

    # Fallback: try window focus
    output = adb_shell("dumpsys", "window", "windows")
    for line in output.splitlines():
        if "mCurrentFocus" in line or "mFocusedApp" in line:
            for part in line.strip().split():
                if "/" in part and "." in part:
                    return part.rstrip("}")
    return "unknown"


def take_screenshot(output_path):
    """Take screenshot and pull to local."""
    remote = "/sdcard/screenshot_tmp.png"
    adb_shell("screencap", "-p", remote)
    adb("pull", remote, output_path)
    adb_shell("rm", remote)
    return output_path


def snapshot(output_dir="."):
    """Full snapshot: screenshot + UI tree + current Activity."""
    ts = int(time.time())

    activity = get_current_activity()

    tree = dump_ui_xml()
    ui_json = element_to_dict(tree.getroot())
    clickable = find_all_clickable(tree)

    screenshot_path = os.path.join(output_dir, f"snapshot_{ts}.png")
    take_screenshot(screenshot_path)

    result = {
        "timestamp": ts,
        "activity": activity,
        "screenshot": screenshot_path,
        "clickable_elements": clickable,
        "ui_tree": ui_json,
    }

    json_path = os.path.join(output_dir, f"snapshot_{ts}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    return result


def explore_bfs(max_depth=3, output_dir="."):
    """BFS exploration of app screens. Taps clickable elements, maps screens."""
    visited_activities = set()
    screen_map = []
    queue = deque()

    # Start state
    start_activity = get_current_activity()
    visited_activities.add(start_activity)
    queue.append((start_activity, 0))

    print(f"Starting BFS from: {start_activity}", file=sys.stderr)

    while queue:
        current_activity, depth = queue.popleft()
        if depth >= max_depth:
            continue

        tree = dump_ui_xml()
        clickable = find_all_clickable(tree)

        screen_info = {
            "activity": current_activity,
            "depth": depth,
            "clickable_count": len(clickable),
            "elements": clickable,
            "transitions": [],
        }

        for elem in clickable:
            center = elem.get("center")
            if not center:
                continue

            label = elem.get("text") or elem.get("content-desc") or elem.get("resource-id") or "unknown"

            # Tap and check new screen
            tap(center["x"], center["y"])
            time.sleep(1.5)

            new_activity = get_current_activity()

            transition = {
                "element": label,
                "target_activity": new_activity,
                "new_screen": new_activity not in visited_activities,
            }
            screen_info["transitions"].append(transition)

            if new_activity not in visited_activities:
                visited_activities.add(new_activity)
                queue.append((new_activity, depth + 1))
                print(f"  Discovered: {new_activity} (depth {depth + 1})", file=sys.stderr)

            # Go back
            adb_shell("input", "keyevent", "KEYCODE_BACK")
            time.sleep(1)

            # Verify we're back
            back_activity = get_current_activity()
            if back_activity != current_activity:
                print(f"  Navigation drift: expected {current_activity}, got {back_activity}", file=sys.stderr)
                break

        screen_map.append(screen_info)

    result = {
        "total_screens": len(visited_activities),
        "activities": list(visited_activities),
        "map": screen_map,
    }

    map_path = os.path.join(output_dir, "screen_map.json")
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    return result


def list_packages(filter_str=None):
    """List installed packages, optionally filtered."""
    output = adb_shell("pm", "list", "packages", "-f")
    packages = []
    for line in output.splitlines():
        if line.startswith("package:"):
            parts = line[8:].rsplit("=", 1)
            if len(parts) == 2:
                apk_path, pkg_name = parts
                if filter_str and filter_str.lower() not in pkg_name.lower():
                    continue
                packages.append({"package": pkg_name, "path": apk_path})
    return packages


def main():
    # Fix Unicode output on Windows (cp1251 console can't handle UI tree chars)
    import sys
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="UI Explorer — UIAutomator CLI for Android reversing")
    sub = parser.add_subparsers(dest="command", help="Command")

    # dump
    sub.add_parser("dump", help="Dump UI hierarchy as JSON")

    # screenshot
    p_ss = sub.add_parser("screenshot", help="Take screenshot")
    p_ss.add_argument("output", nargs="?", default="screenshot.png", help="Output file path")

    # tap
    p_tap = sub.add_parser("tap", help="Tap UI element")
    p_tap.add_argument("--id", help="Resource ID to tap")
    p_tap.add_argument("--text", help="Text to tap")
    p_tap.add_argument("--desc", help="Content description to tap")
    p_tap.add_argument("--xpath", help="XPath expression to find element")
    p_tap.add_argument("--xy", nargs=2, type=int, metavar=("X", "Y"), help="Coordinates")

    # input
    p_inp = sub.add_parser("input", help="Input text into field")
    p_inp.add_argument("--id", help="Resource ID of input field")
    p_inp.add_argument("--text", help="Text label of input field")
    p_inp.add_argument("value", help="Text to input")

    # swipe
    p_sw = sub.add_parser("swipe", help="Swipe gesture")
    p_sw.add_argument("direction", choices=["up", "down", "left", "right"])

    # activity
    sub.add_parser("activity", help="Show current Activity")

    # explore
    p_exp = sub.add_parser("explore", help="BFS explore screens")
    p_exp.add_argument("--depth", type=int, default=3, help="Max BFS depth")
    p_exp.add_argument("--output-dir", default=".", help="Output directory")

    # snapshot
    p_snap = sub.add_parser("snapshot", help="Full snapshot: screenshot + UI + Activity")
    p_snap.add_argument("--output-dir", default=".", help="Output directory")

    # back / home
    sub.add_parser("back", help="Press back button")
    sub.add_parser("home", help="Press home button")

    # xpath
    p_xpath = sub.add_parser("xpath", help="Query UI tree with XPath")
    p_xpath.add_argument("expression", help="XPath expression (e.g. '//node[@clickable=\"true\"]')")

    # list-packages
    p_pkg = sub.add_parser("list-packages", help="List installed packages")
    p_pkg.add_argument("--filter", help="Filter by package name substring")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == "dump":
        tree = dump_ui_xml()
        result = element_to_dict(tree.getroot())
        clickable = find_all_clickable(tree)
        output = {"ui_tree": result, "clickable_elements": clickable}
        print(json.dumps(output, indent=2, ensure_ascii=False))

    elif args.command == "screenshot":
        path = take_screenshot(args.output)
        print(json.dumps({"screenshot": path}))

    elif args.command == "tap":
        if args.xy:
            tap(args.xy[0], args.xy[1])
            print(json.dumps({"tapped": {"x": args.xy[0], "y": args.xy[1]}}))
        else:
            tree = dump_ui_xml()
            elem = find_element(tree, resource_id=args.id, text=args.text, content_desc=args.desc, xpath=args.xpath)
            if elem is None:
                print(json.dumps({"error": "Element not found"}))
                sys.exit(1)
            center = element_center(elem)
            if not center:
                print(json.dumps({"error": "Cannot determine element position"}))
                sys.exit(1)
            tap(center[0], center[1])
            print(json.dumps({"tapped": {"x": center[0], "y": center[1], "element": elem.get("text", elem.get("resource-id", ""))}}))

    elif args.command == "input":
        if args.id or args.text:
            tree = dump_ui_xml()
            elem = find_element(tree, resource_id=args.id, text=args.text)
            if elem is None:
                print(json.dumps({"error": "Input field not found"}))
                sys.exit(1)
            center = element_center(elem)
            if center:
                tap(center[0], center[1])
                time.sleep(0.3)
        # Clear existing text
        adb_shell("input", "keyevent", "KEYCODE_CTRL_LEFT", "KEYCODE_A")
        time.sleep(0.1)
        input_text(args.value)
        print(json.dumps({"input": args.value}))

    elif args.command == "swipe":
        swipe_gesture(args.direction)
        print(json.dumps({"swiped": args.direction}))

    elif args.command == "activity":
        act = get_current_activity()
        print(json.dumps({"activity": act}))

    elif args.command == "explore":
        result = explore_bfs(max_depth=args.depth, output_dir=args.output_dir)
        print(json.dumps(result, indent=2, ensure_ascii=False))

    elif args.command == "snapshot":
        result = snapshot(output_dir=args.output_dir)
        # Don't dump full UI tree to stdout — it's in the JSON file
        print(json.dumps({
            "activity": result["activity"],
            "screenshot": result["screenshot"],
            "clickable_count": len(result["clickable_elements"]),
            "clickable_elements": result["clickable_elements"],
        }, indent=2, ensure_ascii=False))

    elif args.command == "back":
        adb_shell("input", "keyevent", "KEYCODE_BACK")
        print(json.dumps({"action": "back"}))

    elif args.command == "home":
        adb_shell("input", "keyevent", "KEYCODE_HOME")
        print(json.dumps({"action": "home"}))

    elif args.command == "xpath":
        tree = dump_ui_xml()
        results = xpath_query(tree, args.expression)
        elements = []
        for elem in results:
            if hasattr(elem, "attrib"):
                info = dict(elem.attrib)
                center = element_center(elem)
                if center:
                    info["_center"] = {"x": center[0], "y": center[1]}
                elements.append(info)
            else:
                elements.append(str(elem))
        print(json.dumps({"xpath": args.expression, "count": len(elements), "results": elements}, indent=2, ensure_ascii=False))

    elif args.command == "list-packages":
        pkgs = list_packages(filter_str=args.filter)
        print(json.dumps(pkgs, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
