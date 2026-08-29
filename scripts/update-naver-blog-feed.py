#!/usr/bin/env python3
import html
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path

BLOG_ID = "sayul_official"
RSS_URL = f"https://rss.blog.naver.com/{BLOG_ID}.xml"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "blog-posts.json"
KST = timezone(timedelta(hours=9))
ANCHOR = datetime(2026, 1, 1, tzinfo=KST).date()


def cycle_number(now):
    return (now.astimezone(KST).date() - ANCHOR).days // 3


def text(node, name):
    child = node.find(name)
    return (child.text or "").strip() if child is not None else ""


def plain(value):
    value = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def summary(value, limit=150):
    value = plain(value)
    if len(value) <= limit:
        return value
    shortened = value[:limit].rsplit(" ", 1)[0].strip()
    return (shortened or value[:limit]).rstrip(".,") + "…"


def iso_date(value):
    if not value:
        return ""
    try:
        return parsedate_to_datetime(value).astimezone(KST).isoformat()
    except (TypeError, ValueError):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(KST).isoformat()
        except ValueError:
            return ""


def current_payload():
    try:
        return json.loads(OUTPUT.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def main():
    now = datetime.now(timezone.utc)
    cycle = cycle_number(now)
    current = current_payload()
    if current.get("cycle") == cycle and current.get("source") == "naver-rss" and os.getenv("FORCE_REFRESH") != "true":
        print(f"Cycle {cycle} is already current; nothing to update.")
        return

    request = urllib.request.Request(RSS_URL, headers={"User-Agent": "Mozilla/5.0 SayulawFeedUpdater/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        root = ET.fromstring(response.read())

    posts = []
    for item in root.findall("./channel/item"):
        title = plain(text(item, "title"))
        link = text(item, "link")
        if not title or not link or "blog.naver.com" not in link:
            continue
        posts.append({
            "title": title,
            "link": link,
            "summary": summary(text(item, "description")),
            "category": plain(text(item, "category")) or "SAYUL",
            "published_at": iso_date(text(item, "pubDate")),
        })
        if len(posts) >= 50:
            break

    if len(posts) < 3:
        raise RuntimeError(f"Expected at least 3 blog posts, received {len(posts)}")

    payload = {
        "source": "naver-rss",
        "blog_id": BLOG_ID,
        "cycle": cycle,
        "generated_at": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "items": posts,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(posts)} posts for cycle {cycle}.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Feed update failed: {error}", file=sys.stderr)
        raise
