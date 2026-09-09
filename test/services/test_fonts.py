"""Tests for per-language subtitle font selection.

Coverage was verified against the bundled fonts' cmap tables:
  BeVietnamPro-Bold : Latin + Latin-Extended (tr/pl/cs) + Vietnamese
  Charm-Bold        : Latin + Thai
  MicrosoftYaHeiBold: Latin + Cyrillic + Greek + zh/ja
  STHeitiMedium     : Latin + Cyrillic + Greek + zh/ja  (no Vietnamese, no Thai)
No bundled font covers Korean, Arabic, Hebrew or Devanagari.
"""

import os
import unittest

from app.services import fonts
from app.utils import utils

# Mirrors web/src/lib/jobs/options.ts LANGUAGES.
WEB_LANGUAGES = [
    "en-US", "en-GB", "tr-TR", "es-ES", "es-MX", "de-DE", "fr-FR", "pt-BR",
    "it-IT", "ru-RU", "ar-SA", "zh-CN", "ja-JP", "ko-KR", "hi-IN", "nl-NL",
    "pl-PL", "sv-SE", "id-ID", "vi-VN", "th-TH", "uk-UA", "ro-RO", "el-GR",
    "cs-CZ", "he-IL", "da-DK", "fi-FI", "nb-NO", "fa-IR",
]


class TestFontForLanguage(unittest.TestCase):
    def test_latin_languages_use_the_latin_font(self):
        for code in ["en-US", "en-GB", "es-ES", "de-DE", "fr-FR", "pt-BR",
                     "it-IT", "nl-NL", "pl-PL", "sv-SE", "id-ID", "ro-RO",
                     "cs-CZ", "da-DK", "fi-FI", "nb-NO", "tr-TR"]:
            self.assertEqual(fonts.font_for_language(code),
                             "BeVietnamPro-Bold.ttf", code)

    def test_vietnamese_uses_the_latin_font(self):
        # STHeitiMedium has no Vietnamese coverage, so the old default drew tofu.
        self.assertEqual(fonts.font_for_language("vi-VN"), "BeVietnamPro-Bold.ttf")

    def test_thai_uses_charm(self):
        self.assertEqual(fonts.font_for_language("th-TH"), "Charm-Bold.ttf")

    def test_cyrillic_and_greek_use_yahei(self):
        for code in ["ru-RU", "uk-UA", "el-GR"]:
            self.assertEqual(fonts.font_for_language(code),
                             "MicrosoftYaHeiBold.ttc", code)

    def test_cjk_keeps_the_previous_default(self):
        for code in ["zh-CN", "ja-JP"]:
            self.assertEqual(fonts.font_for_language(code),
                             "STHeitiMedium.ttc", code)

    def test_uncovered_scripts_fall_back_to_the_previous_default(self):
        # No bundled font covers these; keep the status quo rather than regress.
        for code in ["ko-KR", "ar-SA", "he-IL", "hi-IN", "fa-IR"]:
            self.assertEqual(fonts.font_for_language(code),
                             "STHeitiMedium.ttc", code)

    def test_unknown_and_empty_fall_back_to_the_previous_default(self):
        for code in ["", None, "xx-XX", "klingon"]:
            self.assertEqual(fonts.font_for_language(code), "STHeitiMedium.ttc", code)

    def test_bare_language_codes_work_without_a_region(self):
        self.assertEqual(fonts.font_for_language("en"), "BeVietnamPro-Bold.ttf")
        self.assertEqual(fonts.font_for_language("vi"), "BeVietnamPro-Bold.ttf")

    def test_every_offered_language_maps_to_a_font_file_that_exists(self):
        for code in WEB_LANGUAGES:
            name = fonts.font_for_language(code)
            self.assertTrue(
                os.path.exists(os.path.join(utils.font_dir(), name)),
                f"{code} -> {name} is not present in resource/fonts",
            )

    def test_mixed_script_text_falls_back_to_a_wider_font(self):
        # An English script containing a Chinese brand name must not tofu.
        self.assertEqual(
            fonts.font_for_language("en-US", text="Try 小米 today"),
            "STHeitiMedium.ttc",
        )

    def test_thai_text_keeps_the_thai_font(self):
        # Charm is the only bundled font with Thai coverage; the mixed-script
        # fallback must not pull th-TH away from it.
        self.assertEqual(
            fonts.font_for_language("th-TH", text="\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35\u0e0a\u0e32\u0e27\u0e42\u0e25\u0e01"),
            "Charm-Bold.ttf",
        )

    def test_vietnamese_text_keeps_the_latin_font(self):
        self.assertEqual(
            fonts.font_for_language("vi-VN", text="ti\u1ebfng Vi\u1ec7t \u1ea1\u1ea3\u00e3"),
            "BeVietnamPro-Bold.ttf",
        )

    def test_plain_latin_text_keeps_the_latin_font(self):
        self.assertEqual(
            fonts.font_for_language("en-US", text="It's simple - really."),
            "BeVietnamPro-Bold.ttf",
        )


if __name__ == "__main__":
    unittest.main()
