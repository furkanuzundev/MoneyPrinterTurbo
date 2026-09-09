"""Per-language subtitle font selection.

Burned-in captions are drawn with PIL/MoviePy using a single TrueType file
(`app/services/video.py`), so that one file must cover every glyph in the
script. The historical default was `STHeitiMedium.ttc`, a CJK font, for all
30 offered languages. That caused two visible defects:

  * U+2019 (') has a full-width advance in CJK fonts, so "it's" was drawn as
    "it ' s" (normalized away in `utils.normalize_punctuation`, but the wide
    Latin metrics remained).
  * STHeitiMedium has no Vietnamese coverage at all, so `vi-VN` rendered tofu.

Coverage below was verified against each file's cmap table:

  BeVietnamPro-Bold  Latin, Latin-Extended (tr/pl/cs/ro), Vietnamese
  Charm-Bold         Latin, Thai
  MicrosoftYaHeiBold Latin, Cyrillic, Greek, zh, ja   (no Vietnamese, no Thai)
  STHeitiMedium      Latin, Cyrillic, Greek, zh, ja   (no Vietnamese, no Thai)

No bundled font covers Korean, Arabic, Hebrew, Devanagari or Persian. Those
keep the historical default so nothing regresses; shipping fonts for them
(and RTL shaping, which MoviePy does not do) is separate work.
"""

import re

# Historical default. Also the fallback for anything we cannot place.
DEFAULT_FONT = "STHeitiMedium.ttc"

LATIN_FONT = "BeVietnamPro-Bold.ttf"
THAI_FONT = "Charm-Bold.ttf"
CYRILLIC_GREEK_FONT = "MicrosoftYaHeiBold.ttc"

_LANGUAGE_FONTS = {
    # Latin / Latin-Extended, plus Vietnamese which only this font covers.
    "en": LATIN_FONT, "es": LATIN_FONT, "de": LATIN_FONT, "fr": LATIN_FONT,
    "pt": LATIN_FONT, "it": LATIN_FONT, "nl": LATIN_FONT, "pl": LATIN_FONT,
    "sv": LATIN_FONT, "da": LATIN_FONT, "fi": LATIN_FONT, "nb": LATIN_FONT,
    "no": LATIN_FONT, "id": LATIN_FONT, "ro": LATIN_FONT, "cs": LATIN_FONT,
    "tr": LATIN_FONT, "vi": LATIN_FONT,
    "th": THAI_FONT,
    "ru": CYRILLIC_GREEK_FONT, "uk": CYRILLIC_GREEK_FONT,
    "el": CYRILLIC_GREEK_FONT,
    "zh": DEFAULT_FONT, "ja": DEFAULT_FONT,
    # ko / ar / he / hi / fa: no bundled coverage -> DEFAULT_FONT via fallback.
}

# Scripts a given font cannot draw. If a script contains any codepoint outside
# its language font's coverage (an English line quoting a Chinese brand name,
# say), fall back to the widest font we have rather than draw tofu boxes.
_SCRIPT_RANGES = {
    "cyrillic": "\u0400-\u04ff\u0500-\u052f",
    "greek": "\u0370-\u03ff\u1f00-\u1fff",
    "hebrew": "\u0590-\u05ff",
    "arabic": "\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff",
    "devanagari": "\u0900-\u097f",
    "thai": "\u0e00-\u0e7f",
    "hangul": "\u1100-\u11ff\uac00-\ud7af\u3130-\u318f",
    "cjk": "\u3000-\u30ff\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef",
}

# Which of the above each font can actually draw (verified against its cmap).
_FONT_SCRIPTS = {
    LATIN_FONT: set(),
    THAI_FONT: {"thai"},
    CYRILLIC_GREEK_FONT: {"cyrillic", "greek", "cjk"},
    DEFAULT_FONT: {"cyrillic", "greek", "cjk"},
}

_UNSUPPORTED_PATTERNS = {
    font: re.compile(
        "["
        + "".join(
            ranges
            for script, ranges in _SCRIPT_RANGES.items()
            if script not in supported
        )
        + "]"
    )
    for font, supported in _FONT_SCRIPTS.items()
}


def font_for_language(language: str, text: str = "") -> str:
    """Return the subtitle font filename (inside `resource/fonts`) to use."""
    code = (language or "").strip().replace("_", "-").split("-")[0].lower()
    font = _LANGUAGE_FONTS.get(code, DEFAULT_FONT)
    if not text or font == DEFAULT_FONT:
        return font
    if _UNSUPPORTED_PATTERNS[font].search(text):
        return DEFAULT_FONT
    return font
