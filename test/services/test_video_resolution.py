from app.models.schema import VideoAspect
from app.services import video as video_svc


def test_default_quality_is_1080p(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {})
    assert video_svc.get_target_resolution(VideoAspect.portrait) == (1080, 1920)


def test_720p_portrait(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {"video_quality": "720p"})
    assert video_svc.get_target_resolution(VideoAspect.portrait) == (720, 1280)


def test_720p_landscape(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {"video_quality": "720p"})
    assert video_svc.get_target_resolution(VideoAspect.landscape) == (1280, 720)


def test_720p_square(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {"video_quality": "720p"})
    assert video_svc.get_target_resolution(VideoAspect.square) == (720, 720)


def test_unknown_quality_falls_back_to_native(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {"video_quality": "4k"})
    assert video_svc.get_target_resolution(VideoAspect.portrait) == (1080, 1920)
