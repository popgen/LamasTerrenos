#!/usr/bin/env python3
"""Quita avatares de Messenger/perfil y fotos repetidas entre anuncios.

El scrape guardaba cada <img> de la ficha de Facebook: la cara del chat
(~100px o ~260px) y miniaturas de otros anuncios quedaban en
listings/<id>/*.jpg y se mostraban como fotos del terreno.

Una imagen se conserva solo si:
- no tiene tamaño de avatar, y
- el mismo archivo (MD5) aparece en menos de SHARE_MIN anuncios.

Luego reescribe las rutas en viewer-data.json, latest.json e index.html.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import struct
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
LISTINGS = ROOT / "listings"
SHARE_MIN = 5
LIMA = ZoneInfo("America/Lima")

DAY = 24 * 60 * 60 * 1000
HOUR = 60 * 60 * 1000
MIN = 60 * 1000


def jpeg_size(path: Path):
    data = path.read_bytes()
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        return None
    i = 2
    while i < len(data) - 9:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3):
            h, w = struct.unpack(">HH", data[i + 5 : i + 9])
            return (w, h)
        if marker in (0xD8, 0xD9, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        if i + 4 > len(data):
            break
        seglen = struct.unpack(">H", data[i + 2 : i + 4])[0]
        if seglen < 2:
            break
        i += 2 + seglen
    return None


def is_avatar(dim, size: int) -> bool:
    if dim is None:
        return size < 6000
    w, h = dim
    if max(w, h) <= 168:
        return True
    if abs(w - h) <= 4 and 220 <= min(w, h) and max(w, h) <= 310:
        return True
    return False


def file_index(name: str) -> int:
    stem = name.split(".", 1)[0]
    return int(stem) if stem.isdigit() else 9999


def parse_instant(value):
    if not value:
        return None
    s = str(value).strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return datetime.fromisoformat(s + "T12:00:00-05:00")
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def lima_day(value) -> str:
    dt = value if isinstance(value, datetime) else parse_instant(value)
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(LIMA).date().isoformat()


def display_amount(display):
    s = (display or "").strip()
    if not s:
        return None
    if re.match(r"^(free|gratis)\b", s, re.I):
        return 0
    m = re.match(r"^(?:pen|s/\.?)\s*([0-9][0-9.,]*)", s, re.I)
    if not m:
        return None
    raw = m.group(1)
    if re.fullmatch(r"\d{1,3}(,\d{3})+", raw):
        return float(raw.replace(",", ""))
    if re.fullmatch(r"\d+,\d{1,2}", raw):
        return float(raw.replace(",", "."))
    try:
        return float(raw.replace(",", ""))
    except ValueError:
        return None


def is_contact_price(listing) -> bool:
    display = str(listing.get("price_display") or "").strip()
    if re.match(r"^(free|gratis)\b", display, re.I):
        return True
    if re.match(r"^precio desconocido\b", display, re.I):
        return True
    amount = display_amount(display)
    if amount is not None:
        return amount <= 1
    sort = listing.get("sort_price")
    if sort is not None and sort != "":
        try:
            return float(sort) <= 1
        except (TypeError, ValueError):
            pass
    if listing.get("price_unknown"):
        return True
    if not display:
        return True
    return False


def relative_phrase_ms(phrase: str):
    p = re.sub(r"\s+", " ", phrase or "").strip().lower()
    if not p:
        return None
    if p in {"just now", "hoy", "today", "ahora", "hace un momento"}:
        return 0
    if p in {"yesterday", "ayer", "a day ago", "1 day ago", "hace un día", "hace un dia", "hace 1 día", "hace 1 dia"}:
        return DAY
    fixed = {
        "a minute ago": MIN,
        "1 minute ago": MIN,
        "an hour ago": HOUR,
        "a hour ago": HOUR,
        "1 hour ago": HOUR,
        "a week ago": 7 * DAY,
        "1 week ago": 7 * DAY,
        "a month ago": 30 * DAY,
        "1 month ago": 30 * DAY,
        "a year ago": 365 * DAY,
        "1 year ago": 365 * DAY,
    }
    if p in fixed:
        return fixed[p]
    m = re.fullmatch(r"(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago", p)
    units = {"minute": MIN, "hour": HOUR, "day": DAY, "week": 7 * DAY, "month": 30 * DAY, "year": 365 * DAY}
    if m:
        return int(m.group(1)) * units[m.group(2)]
    m = re.fullmatch(r"hace\s+(\d+|un|una)\s+(minuto|hora|d[ií]a|semana|mes|a[nñ]o)s?", p)
    if m:
        n = 1 if m.group(1) in {"un", "una"} else int(m.group(1))
        word = m.group(2)
        if word.startswith("minuto"):
            u = MIN
        elif word.startswith("hora"):
            u = HOUR
        elif word.startswith("d"):
            u = DAY
        elif word.startswith("semana"):
            u = 7 * DAY
        elif word.startswith("mes"):
            u = 30 * DAY
        else:
            u = 365 * DAY
        return n * u
    return None


def parse_relative_listed(text, scraped_ms):
    if not text or scraped_ms is None:
        return None
    raw = str(text).strip()
    m = re.search(r"\s+in\s+", raw, re.I)
    phrase = raw[: m.start()] if m else raw
    delta = relative_phrase_ms(phrase)
    if delta is None:
        return None
    return scraped_ms - delta


def normalize_listing_dates(listing, raw_text):
    scraped = parse_instant(listing.get("scraped_at"))
    scraped_ms = scraped.timestamp() * 1000 if scraped else None
    posted_ms = parse_relative_listed(raw_text, scraped_ms) if raw_text else None
    if posted_ms is not None and scraped is not None:
        listing["listed_at"] = datetime.fromtimestamp(posted_ms / 1000, tz=ZoneInfo("UTC")).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        listing["listed_text"] = str(raw_text).strip()
    else:
        listing["listed_at"] = None
        listing["listed_text"] = None


def apply_price(listing):
    if is_contact_price(listing):
        listing["price_display"] = "Precio desconocido"
        listing["sort_price"] = None
        listing["price_unknown"] = True
        flags = list(listing.get("value_flags") or [])
        if "free_or_contact_price" not in flags:
            flags.append("free_or_contact_price")
        listing["value_flags"] = flags
    return listing


def scan_files():
    by_hash = defaultdict(list)
    info = {}
    for listing_dir in LISTINGS.iterdir():
        if not listing_dir.is_dir():
            continue
        for path in listing_dir.iterdir():
            if not path.is_file():
                continue
            digest = hashlib.md5(path.read_bytes()).hexdigest()
            dim = jpeg_size(path)
            size = path.stat().st_size
            rec = {
                "path": path,
                "listing": listing_dir.name,
                "name": path.name,
                "hash": digest,
                "dim": dim,
                "size": size,
            }
            info[path] = rec
            by_hash[digest].append(rec)
    listing_counts = {h: len({r["listing"] for r in rows}) for h, rows in by_hash.items()}
    return info, by_hash, listing_counts


def keep_path(rec, listing_counts) -> bool:
    if is_avatar(rec["dim"], rec["size"]):
        return False
    if listing_counts[rec["hash"]] >= SHARE_MIN:
        return False
    return True


def rel_photo(listing_id: str, name: str) -> str:
    return f"listings/{listing_id}/{name}"


def write_text_atomic(path: Path, text: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def protect_lone_surrogates(obj):
    """Emojis reales se quedan. Un solo surrogate (JSON roto) se marca para re-escapar."""
    if isinstance(obj, str):
        return "".join(
            f"\ue000{ord(ch):04X}\ue001" if 0xD800 <= ord(ch) <= 0xDFFF else ch
            for ch in obj
        )
    if isinstance(obj, list):
        return [protect_lone_surrogates(x) for x in obj]
    if isinstance(obj, dict):
        return {k: protect_lone_surrogates(v) for k, v in obj.items()}
    return obj


def dump_json(obj, pretty: bool) -> str:
    raw = json.dumps(
        protect_lone_surrogates(obj),
        ensure_ascii=False,
        indent=2 if pretty else None,
        separators=None if pretty else (",", ":"),
    )
    return re.sub(r"\ue000([0-9A-F]{4})\ue001", lambda m: "\\u" + m.group(1).lower(), raw)


def main():
    info, _by_hash, listing_counts = scan_files()
    best = {}
    for rec in info.values():
        if not keep_path(rec, listing_counts):
            continue
        key = (rec["listing"], rec["hash"])
        prev = best.get(key)
        rank = (file_index(rec["name"]), rec["name"])
        if prev is None or rank < (file_index(prev["name"]), prev["name"]):
            best[key] = rec
    kept_by_listing = defaultdict(list)
    keep_paths = set()
    for rec in best.values():
        kept_by_listing[rec["listing"]].append(rec)
        keep_paths.add(rec["path"])
    for rows in kept_by_listing.values():
        rows.sort(key=lambda r: (file_index(r["name"]), r["name"]))
    kept = len(keep_paths)
    removed = 0
    for rec in info.values():
        if rec["path"] in keep_paths:
            continue
        rec["path"].unlink()
        removed += 1

    for listing_dir in list(LISTINGS.iterdir()):
        if listing_dir.is_dir() and not any(listing_dir.iterdir()):
            listing_dir.rmdir()

    viewer_path = ROOT / "viewer-data.json"
    viewer = json.loads(viewer_path.read_text(encoding="utf-8"))
    today = lima_day(viewer.get("generated_at"))
    new_count = 0
    for listing in viewer["listings"]:
        lid = str(listing["id"])
        listing["photos"] = [rel_photo(lid, r["name"]) for r in kept_by_listing.get(lid, [])]
        raw_text = listing.get("listed_text") or listing.get("posted_text")
        normalize_listing_dates(listing, raw_text)
        apply_price(listing)
        fs = listing.get("first_seen_at")
        listing["is_new"] = bool(fs) and lima_day(fs) == today
        if listing["is_new"]:
            new_count += 1
    viewer["today_lima"] = today
    viewer["new_count"] = new_count
    write_text_atomic(viewer_path, dump_json(viewer, pretty=True) + "\n")

    latest_path = ROOT / "latest.json"
    latest = json.loads(latest_path.read_text(encoding="utf-8"))
    for listing in latest:
        lid = str(listing["id"])
        names = [r["name"] for r in kept_by_listing.get(lid, [])]
        listing["photo_paths"] = [
            f"/workspace/lamas-marketplace/listings/{lid}/{name}" for name in names
        ]
    write_text_atomic(latest_path, dump_json(latest, pretty=True) + "\n")

    index_path = ROOT / "index.html"
    html = index_path.read_text(encoding="utf-8")
    payload = dump_json(viewer, pretty=False)
    lines = html.split("\n")
    replaced = 0
    for i, line in enumerate(lines):
        if line.startswith("const DATA = "):
            lines[i] = "const DATA = " + payload + ";"
            replaced += 1
            break
    if replaced != 1:
        raise SystemExit(f"no se pudo reemplazar const DATA (matches={replaced})")
    write_text_atomic(index_path, "\n".join(lines))

    empty = sum(1 for listing in viewer["listings"] if not listing["photos"])
    print(
        json.dumps(
            {
                "kept_files": kept,
                "removed_files": removed,
                "listings": len(viewer["listings"]),
                "listings_without_photos": empty,
                "new_count": new_count,
                "today_lima": today,
                "contact_prices": sum(1 for l in viewer["listings"] if l.get("price_unknown")),
                "with_listed_at": sum(1 for l in viewer["listings"] if l.get("listed_at")),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
