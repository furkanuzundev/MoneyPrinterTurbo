from app.services.voice import sample_text_for_voice


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
