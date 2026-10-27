#!/usr/bin/env python3
"""Check Obsidian wikilinks in a vault without external dependencies."""

from __future__ import annotations

import re
import sys
from pathlib import Path

WIKILINK = re.compile(r"\[\[([^\]|#]+)")
IGNORED_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".pdf", ".webp"}


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: check_links.py <vault>")
        return 2

    root = Path(sys.argv[1]).expanduser().resolve()
    if not root.is_dir():
        print(f"vault not found: {root}")
        return 2

    notes = {p.stem for p in root.rglob("*.md")}
    attachments = {
        p.name
        for p in root.rglob("*")
        if p.is_file() and p.suffix.lower() in IGNORED_SUFFIXES
    }

    missing: list[tuple[Path, str]] = []
    checked = 0

    for note in root.rglob("*.md"):
        text = note.read_text(encoding="utf-8")
        for raw in WIKILINK.findall(text):
            target = raw.strip().split("/")[-1]
            checked += 1
            if target in notes or target in attachments:
                continue
            missing.append((note.relative_to(root), raw.strip()))

    print(f"notes={len(notes)} wikilinks={checked} missing={len(missing)}")
    for note, target in missing:
        print(f"MISSING {note}: [[{target}]]")

    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
