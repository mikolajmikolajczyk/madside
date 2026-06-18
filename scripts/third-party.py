#!/usr/bin/env python3
"""Third-party registry tool (single source: ../third-party.toml).

Usage:
  third-party.py get <dotted.key>   # print one value (justfile reads pins this way)
  third-party.py docs               # regenerate the docs licence table

`get` keeps the justfile free of duplicated upstream/commit pins. `docs` renders
the bundled-software table (built-from-source + npm runtime libs) into the public
docs; npm versions/licences are read live from node_modules so they never drift
from package.json.
"""
import json
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "third-party.toml"
DOCS_PAGE = ROOT / "docs/src/content/docs/reference/third-party.md"


def load() -> dict:
    with REGISTRY.open("rb") as f:
        return tomllib.load(f)


def get(key: str) -> str:
    node = load()
    for part in key.split("."):
        node = node[part]
    return str(node)


def npm_meta(pkg: str) -> tuple[str, str]:
    """(version, license) from node_modules/<pkg>/package.json."""
    pj = ROOT / "node_modules" / pkg / "package.json"
    try:
        data = json.loads(pj.read_text())
    except FileNotFoundError:
        return ("?", "?")
    lic = data.get("license") or data.get("licenses") or "?"
    if isinstance(lic, list):
        lic = " / ".join(x.get("type", "?") for x in lic)
    elif isinstance(lic, dict):
        lic = lic.get("type", "?")
    return (str(data.get("version", "?")), str(lic))


def link(name: str, url: str | None) -> str:
    return f"[{name}]({url})" if url else name


def docs() -> None:
    reg = load()
    lines = [
        "---",
        "title: Third-party software",
        "description: The upstream tools and libraries madside bundles, with versions and licences.",
        "---",
        "",
        "<!-- AUTO-GENERATED from third-party.toml by scripts/third-party.py."
        " Do not edit by hand — run `just third-party-docs`. -->",
        "",
        "madside bundles the following third-party software. Build-time toolchains"
        " (Free Pascal, wasi-sdk, Emscripten) compile the artifacts below but are"
        " not themselves shipped.",
        "",
        "## Built from source",
        "",
        "Compiled to WebAssembly by `just build-*` and committed as bundle assets."
        " **Source** is the exact repository we build from — our fork where we"
        " carry patches, the upstream project otherwise.",
        "",
        "| Software | Version | Licence | Source | Used for |",
        "| --- | --- | --- | --- | --- |",
    ]
    for t in reg.get("source", {}).values():
        src_url = t.get("source") or t.get("upstream")
        src_label = f"fork @ {t['branch']}" if t.get("branch") else "upstream"
        lines.append(
            f"| {link(t['name'], t.get('upstream'))} | {t.get('version', '?')} "
            f"| {t.get('license', '?')} | {link(src_label, src_url)} | {t.get('role', '')} |"
        )

    lines += [
        "",
        "## Bundled libraries",
        "",
        "npm packages that ship inside the app. Versions and licences are read"
        " from the installed packages.",
        "",
        "| Library | Version | Licence | Used for |",
        "| --- | --- | --- | --- |",
    ]
    for t in reg.get("bundled", {}).values():
        ver, lic = npm_meta(t["npm"])
        if t.get("license_note"):
            lic = f"{lic} ({t['license_note']})"
        lines.append(
            f"| {link(t['name'], t.get('upstream'))} | {ver} | {lic} | {t.get('role', '')} |"
        )
    lines.append("")

    DOCS_PAGE.write_text("\n".join(lines))
    print(f"wrote {DOCS_PAGE.relative_to(ROOT)} ({len(reg.get('source', {}))} source + "
          f"{len(reg.get('bundled', {}))} bundled)")


def main() -> int:
    if len(sys.argv) >= 3 and sys.argv[1] == "get":
        print(get(sys.argv[2]))
        return 0
    if len(sys.argv) == 2 and sys.argv[1] == "docs":
        docs()
        return 0
    print(__doc__, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
