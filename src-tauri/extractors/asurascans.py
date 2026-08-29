# -*- coding: utf-8 -*-

# asurascans.com extractor for gallery-dl (external module).
#
# asurascans.com is an Astro.js SPA (not WordPress/Madara anymore): the whole
# chapter payload lives in an HTML-escaped JSON blob inside an
# <astro-island props="..."> tag. This module parses that blob and yields the
# page image URLs using the same folder/filename layout gallery-dl uses for
# other manga sources.
#
# Loaded by the app through `gallery-dl -X <extractors-dir>` (or the
# `extractor.module-sources` config key). No fork/rebuild of gallery-dl is
# needed. The module stays in the app data dir so it can be hot-patched
# without shipping a new release.
#
# Notes (verified live 2026-08-26 against the installed gallery-dl 1.32.9):
# - Free chapters download without any auth.
# - Premium (Asura+) chapters are gated behind an API + access_token cookie;
#   they surface a clear error instead of a silent failure.
# - Some premium batches arrive tile-scrambled (tiles/tileCols/tileRows);
#   unsupported for now -> clear error.

import html as _html
import json
import re

from gallery_dl import exception, text
from gallery_dl.extractor.common import Extractor, Message

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
PROPS_RE = re.compile(r'<astro-island[^>]*\bprops="([^"]*)"')


def _unwrap(value):
    """Recursively unwrap Astro island serialization.

    Astro encodes prop values as tagged tuples:
      [0, value]            -> value
      [1|2, [...]]          -> list of (recursively unwrapped) values
    Plain strings/numbers/bools pass through untouched.
    """
    if isinstance(value, list):
        if len(value) == 2 and isinstance(value[0], int) and value[0] in (0, 1, 2, 3):
            tag, payload = value[0], value[1]
            if tag == 0:
                return _unwrap(payload)
            if tag in (1, 2) and isinstance(payload, list):
                return [_unwrap(item) for item in payload]
            return _unwrap(payload)
        return [_unwrap(item) for item in value]
    if isinstance(value, dict):
        return {key: _unwrap(item) for key, item in value.items()}
    return value


class AsuraScansChapterExtractor(Extractor):
    """Download a single asurascans.com chapter."""

    category = "asurascans"
    subcategory = "chapter"
    directory_fmt = ("{category}", "{seriesName}", "{chapterNumber:>03}")
    filename_fmt = "{num:>03}.{extension}"
    archive_fmt = "c{chapterNumber}_{num}"
    pattern = (
        r"https?://(?:www\.)?asurascans\.com/"
        r"(?:comics|series|manga)/([^/?#]+)/chapter/(\d+)"
    )
    test = []

    def __init__(self, match):
        Extractor.__init__(self, match)
        self.slug = match.group(1)
        self.chapter_number = int(match.group(2))
        self.headers = {
            "User-Agent": BROWSER_UA,
            "Referer": "https://asurascans.com/",
        }

    def _chapter_props(self, url):
        page = self.request(url, headers=self.headers).text
        match = PROPS_RE.search(page)
        if not match:
            raise exception.StopExtraction(
                "Could not find chapter data on the page - the site layout "
                "may have changed"
            )
        return _unwrap(json.loads(_html.unescape(match.group(1))))

    def items(self):
        props = self._chapter_props(self.url)
        pages = props.get("pages") or []

        if not pages:
            if props.get("isPremium") or props.get("isLocked"):
                raise exception.StopExtraction(
                    "This chapter is premium (Asura+). Import your Asura+ "
                    "login cookies in the app's cookie settings and retry"
                )
            raise exception.StopExtraction("No page images found on the chapter page")

        for page in pages:
            if isinstance(page, dict) and page.get("tiles"):
                raise exception.StopExtraction(
                    "This chapter uses tile-scrambled images, which are not "
                    "supported yet"
                )

        chapter_number = props.get("chapterNumber") or self.chapter_number
        data = {
            "category": self.category,
            "subcategory": self.subcategory,
            "seriesName": props.get("seriesName") or self.slug,
            "seriesSlug": props.get("seriesSlug") or self.slug,
            "chapterNumber": chapter_number,
            "chapterName": props.get("chapterName") or chapter_number,
            "count": len(pages),
        }

        yield Message.Directory, "", data

        for num, page in enumerate(pages, 1):
            url = page.get("url") if isinstance(page, dict) else page
            if not url:
                continue
            file_data = dict(data)
            file_data["num"] = num
            text.nameext_from_url(url, file_data)
            yield Message.Url, url, file_data
