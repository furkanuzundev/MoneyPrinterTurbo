from app.services.voice import is_known_previewable_voice, sample_text_for_voice


def test_sample_text_turkish():
    assert sample_text_for_voice("tr-TR-EmelNeural-Female").startswith("Merhaba")


def test_sample_text_known_locale_english():
    assert sample_text_for_voice("en-US-JennyNeural-Female") == (
        "Hello, this is a sample of my voice."
    )


def test_sample_text_unknown_locale_falls_back_to_english():
    assert sample_text_for_voice("xx-XX-FooNeural-Female") == (
        "Hello, this is a sample of my voice."
    )


def test_is_known_previewable_voice_accepts_known_azure_voice_female():
    assert is_known_previewable_voice("tr-TR-EmelNeural-Female") is True


def test_is_known_previewable_voice_accepts_known_azure_voice_male():
    assert is_known_previewable_voice("en-US-JennyNeural-Male") is True


def test_is_known_previewable_voice_rejects_unknown_azure_voice():
    assert is_known_previewable_voice("xx-XX-FakeNeural-Female") is False


def test_is_known_previewable_voice_allows_no_voice_sentinel():
    assert is_known_previewable_voice("no-voice") is True
