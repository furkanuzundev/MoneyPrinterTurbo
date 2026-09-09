"""Tests for typographic punctuation normalization in subtitle text.

Regression guard for the burned-in caption bug: U+2019 (') has a full-width
advance in the bundled CJK fonts (STHeitiMedium/MicrosoftYaHei), so "it's"
rendered as "it ' s" with a whole em of dead space, and the same measurement
poisoned line wrapping.
"""

from app.utils import utils


def test_curly_apostrophe_becomes_straight():
    assert utils.normalize_punctuation("it’s") == "it's"


def test_all_single_quote_variants_become_straight():
    assert utils.normalize_punctuation("‘a’ ‚b‛") == "'a' 'b'"


def test_curly_double_quotes_become_straight():
    assert utils.normalize_punctuation("“quoted”") == '"quoted"'


def test_dashes_become_hyphen():
    assert utils.normalize_punctuation("a–b—c―d") == "a-b-c-d"


def test_ellipsis_becomes_three_dots():
    assert utils.normalize_punctuation("wait…") == "wait..."


def test_exotic_spaces_become_plain_space():
    assert utils.normalize_punctuation("a b c d") == "a b c d"


def test_cjk_fullwidth_punctuation_is_untouched():
    # STHeiti renders these correctly and they are intentional in zh/ja scripts.
    text = "你好，世界。真的？「引用」"
    assert utils.normalize_punctuation(text) == text


def test_straight_ascii_text_is_unchanged():
    assert utils.normalize_punctuation("it's a \"test\" - ok...") == "it's a \"test\" - ok..."


def test_none_and_empty_are_safe():
    assert utils.normalize_punctuation("") == ""
    assert utils.normalize_punctuation(None) == ""
