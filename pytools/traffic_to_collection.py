#!/usr/bin/env python3
"""
Traffic to Collection — Convert intercepted HTTP traffic to Postman Collection v2.1.
Supports: Frida http-logger.js JSON output, mitmproxy HAR files.

Usage:
    python traffic_to_collection.py frida traffic.json       → from http-logger.js
    python traffic_to_collection.py har traffic.har          → from mitmproxy HAR
    python traffic_to_collection.py frida traffic.json --output col.json
    python traffic_to_collection.py frida traffic.json --name "MyApp API"
"""

import argparse
import json
import re
import sys
from collections import OrderedDict
from pathlib import Path
from urllib.parse import parse_qs, urlparse


def parse_frida_log(filepath):
    """Parse http-logger.js JSON lines output."""
    entries = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            # Strip [HTTP-LOG] prefix if present
            if line.startswith("[HTTP-LOG]"):
                line = line[len("[HTTP-LOG]"):].strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                entries.append(normalize_entry(entry, source="frida"))
            except json.JSONDecodeError:
                continue
    return entries


def parse_har(filepath):
    """Parse HAR (HTTP Archive) file."""
    with open(filepath, "r", encoding="utf-8") as f:
        har = json.load(f)

    entries = []
    for entry in har.get("log", {}).get("entries", []):
        req = entry.get("request", {})
        resp = entry.get("response", {})

        normalized = {
            "method": req.get("method", "GET"),
            "url": req.get("url", ""),
            "requestHeaders": {h["name"]: h["value"] for h in req.get("headers", [])},
            "requestBody": None,
            "status": resp.get("status", 0),
            "responseHeaders": {h["name"]: h["value"] for h in resp.get("headers", [])},
            "responseBody": resp.get("content", {}).get("text", ""),
        }

        # Request body
        post_data = req.get("postData", {})
        if post_data:
            normalized["requestBody"] = post_data.get("text", "")

        entries.append(normalized)

    return entries


def normalize_entry(entry, source="frida"):
    """Normalize traffic entry to common format."""
    return {
        "method": entry.get("method", "GET"),
        "url": entry.get("url", ""),
        "requestHeaders": entry.get("requestHeaders", {}),
        "requestBody": entry.get("requestBody"),
        "status": entry.get("status", 0),
        "responseHeaders": entry.get("responseHeaders", {}),
        "responseBody": entry.get("responseBody"),
    }


def deduplicate_entries(entries):
    """Deduplicate by method+path (keep first occurrence)."""
    seen = OrderedDict()
    for entry in entries:
        parsed = urlparse(entry["url"])
        # Normalize path: remove query params for dedup key
        key = f"{entry['method']}|{parsed.scheme}://{parsed.netloc}{parsed.path}"
        if key not in seen:
            seen[key] = entry
    return list(seen.values())


def detect_auth_headers(entries):
    """Detect common auth header patterns across entries."""
    auth_headers = {}
    auth_keys = ["authorization", "x-api-key", "x-auth-token", "x-access-token",
                 "x-csrf-token", "cookie", "x-requested-with"]

    for entry in entries:
        for key, value in entry.get("requestHeaders", {}).items():
            if key.lower() in auth_keys:
                auth_headers[key] = value
    return auth_headers


def group_by_base_url(entries):
    """Group entries by base URL (scheme + host)."""
    groups = OrderedDict()
    for entry in entries:
        parsed = urlparse(entry["url"])
        base = f"{parsed.scheme}://{parsed.netloc}"
        if base not in groups:
            groups[base] = []
        groups[base].append(entry)
    return groups


def entry_to_postman_item(entry):
    """Convert a traffic entry to Postman Collection item."""
    parsed = urlparse(entry["url"])
    path_parts = [p for p in parsed.path.split("/") if p]

    # Generate readable name
    name = f"{entry['method']} {parsed.path}" if parsed.path != "/" else f"{entry['method']} /"

    # Build URL object
    url_obj = {
        "raw": entry["url"],
        "protocol": parsed.scheme,
        "host": (parsed.hostname or parsed.netloc).split("."),
        "path": path_parts,
    }

    # Query params
    if parsed.query:
        query_params = parse_qs(parsed.query, keep_blank_values=True)
        url_obj["query"] = [
            {"key": k, "value": v[0] if v else ""}
            for k, v in query_params.items()
        ]

    # Headers
    headers = [
        {"key": k, "value": v, "type": "text"}
        for k, v in entry.get("requestHeaders", {}).items()
        if k.lower() not in ("host", "content-length", "connection")
    ]

    item = {
        "name": name,
        "request": {
            "method": entry["method"],
            "header": headers,
            "url": url_obj,
        },
    }

    # Request body
    body = entry.get("requestBody")
    if body and entry["method"] in ("POST", "PUT", "PATCH"):
        content_type = ""
        for k, v in entry.get("requestHeaders", {}).items():
            if k.lower() == "content-type":
                content_type = v.lower()
                break

        if "json" in content_type or (body.strip().startswith("{") or body.strip().startswith("[")):
            item["request"]["body"] = {
                "mode": "raw",
                "raw": body,
                "options": {"raw": {"language": "json"}},
            }
        elif "form" in content_type:
            params = parse_qs(body, keep_blank_values=True)
            item["request"]["body"] = {
                "mode": "urlencoded",
                "urlencoded": [
                    {"key": k, "value": v[0] if v else "", "type": "text"}
                    for k, v in params.items()
                ],
            }
        else:
            item["request"]["body"] = {
                "mode": "raw",
                "raw": body,
            }

    # Response example
    resp_body = entry.get("responseBody")
    if resp_body and entry.get("status"):
        item["response"] = [{
            "name": f"Example ({entry['status']})",
            "status": str(entry["status"]),
            "code": entry["status"],
            "body": resp_body[:5000],  # limit size
            "header": [
                {"key": k, "value": v}
                for k, v in entry.get("responseHeaders", {}).items()
            ],
        }]

    return item


def build_collection(entries, name="Intercepted API"):
    """Build Postman Collection v2.1 from traffic entries."""
    # Deduplicate
    entries = deduplicate_entries(entries)

    # Detect auth
    auth_headers = detect_auth_headers(entries)

    # Group by base URL
    groups = group_by_base_url(entries)

    # Build folder structure
    folders = []
    for base_url, group_entries in groups.items():
        items = [entry_to_postman_item(e) for e in group_entries]
        folders.append({
            "name": base_url,
            "item": items,
        })

    # Collection root
    collection = {
        "info": {
            "name": name,
            "_postman_id": "",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
            "description": f"Auto-generated from intercepted traffic.\n"
                           f"Total requests: {len(entries)}\n"
                           f"Base URLs: {', '.join(groups.keys())}",
        },
        "item": folders if len(folders) > 1 else (folders[0]["item"] if folders else []),
    }

    # Add auth if detected
    if auth_headers:
        # Use the most likely auth header
        for key in ["Authorization", "authorization", "X-API-Key", "x-api-key"]:
            if key in auth_headers:
                value = auth_headers[key]
                if value.lower().startswith("bearer "):
                    collection["auth"] = {
                        "type": "bearer",
                        "bearer": [{"key": "token", "value": value[7:], "type": "string"}],
                    }
                else:
                    collection["auth"] = {
                        "type": "apikey",
                        "apikey": [
                            {"key": "key", "value": key, "type": "string"},
                            {"key": "value", "value": value, "type": "string"},
                            {"key": "in", "value": "header", "type": "string"},
                        ],
                    }
                break

    # Variables for base URLs
    variables = []
    for i, base_url in enumerate(groups.keys()):
        var_name = "baseUrl" if i == 0 else f"baseUrl{i + 1}"
        variables.append({"key": var_name, "value": base_url})
    if variables:
        collection["variable"] = variables

    return collection


def main():
    parser = argparse.ArgumentParser(description="Convert intercepted traffic to Postman Collection")
    sub = parser.add_subparsers(dest="format", help="Input format")

    p_frida = sub.add_parser("frida", help="Frida http-logger.js JSON lines")
    p_frida.add_argument("input", help="Input JSON file")
    p_frida.add_argument("--output", "-o", help="Output file (default: <input>_collection.json)")
    p_frida.add_argument("--name", default=None, help="Collection name")

    p_har = sub.add_parser("har", help="mitmproxy HAR file")
    p_har.add_argument("input", help="Input HAR file")
    p_har.add_argument("--output", "-o", help="Output file")
    p_har.add_argument("--name", default=None, help="Collection name")

    args = parser.parse_args()

    if not args.format:
        parser.print_help()
        sys.exit(1)

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"ERROR: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    # Parse input
    if args.format == "frida":
        entries = parse_frida_log(args.input)
    elif args.format == "har":
        entries = parse_har(args.input)
    else:
        print(f"ERROR: Unknown format: {args.format}", file=sys.stderr)
        sys.exit(1)

    if not entries:
        print("WARNING: No HTTP entries found in input", file=sys.stderr)

    # Build collection
    col_name = args.name or f"{input_path.stem} API"
    collection = build_collection(entries, name=col_name)

    # Output
    output_path = args.output or str(input_path.with_suffix("")) + "_collection.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({"collection": collection}, f, indent=2, ensure_ascii=False)

    # Summary
    summary = {
        "output": output_path,
        "total_entries": len(entries),
        "deduplicated": len(deduplicate_entries(entries)),
        "base_urls": list(group_by_base_url(entries).keys()),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
