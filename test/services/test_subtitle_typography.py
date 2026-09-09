"""End-to-end guard for the burned-in caption typography fix.

These assert the *property* the fix relies on, using the same PIL measurement
path the renderer uses (`app/services/video.py: wrap_text`), so they fail if
`normalize_punctuation` is ever removed from the subtitle path.
"""

import os
import unittest

from PIL import ImageFont

from app.services import video as vd
from app.utils import utils

FONT_DIR = utils.font_dir()
FONT_FILES = sorted(
    f for f in os.listdir(FONT_DIR) if f.lower().endswith((".ttf", ".ttc"))
)


class TestApostropheWidth(unittest.TestCase):
    def test_curly_apostrophe_is_wider_than_straight_in_the_bundled_cjk_font(self):
        """The bug itself: this is why normalization is required, not cosmetic."""
        font = ImageFont.truetype(os.path.join(FONT_DIR, "STHeitiMedium.ttc"), 60)
        self.assertGreater(font.getlength("’"), font.getlength("'") * 3)

    def test_normalized_text_measures_identically_in_every_bundled_font(self):
        for name in FONT_FILES:
            font = ImageFont.truetype(os.path.join(FONT_DIR, name), 60)
            normalized = utils.normalize_punctuation("it’s “fine”…")
            self.assertEqual(
                font.getlength(normalized),
                font.getlength('it\'s "fine"...'),
                name,
            )


class TestWrappingIsUnaffectedByTypographicInput(unittest.TestCase):
    def test_wrap_text_breaks_identically_after_normalization(self):
        sentence_curly = (
            "It’s the one habit that changed everything — "
            "and it’s free, so there’s really no excuse…"
        )
        sentence_straight = utils.normalize_punctuation(sentence_curly)
        for name in ["STHeitiMedium.ttc", "BeVietnamPro-Bold.ttf"]:
            path = os.path.join(FONT_DIR, name)
            wrapped_normalized, _ = vd.wrap_text(
                sentence_straight, max_width=900, font=path, fontsize=60
            )
            self.assertEqual(
                wrapped_normalized,
                vd.wrap_text(
                    "It's the one habit that changed everything - "
                    "and it's free, so there's really no excuse...",
                    max_width=900,
                    font=path,
                    fontsize=60,
                )[0],
                name,
            )

    def test_raw_typographic_input_wraps_differently_without_normalization(self):
        """Guards the guard: proves the assertions above are not vacuous."""
        path = os.path.join(FONT_DIR, "STHeitiMedium.ttc")
        curly = "It’s free and it’s fast and it’s honestly the best"
        straight = utils.normalize_punctuation(curly)
        self.assertNotEqual(
            vd.wrap_text(curly, max_width=600, font=path, fontsize=60)[0],
            vd.wrap_text(straight, max_width=600, font=path, fontsize=60)[0],
        )


if __name__ == "__main__":
    unittest.main()
