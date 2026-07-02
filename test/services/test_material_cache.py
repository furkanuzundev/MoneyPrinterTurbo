import glob
import os
import time

from app.services import material as material_svc


def _make_file(path, size, age_seconds):
    with open(path, "wb") as f:
        f.write(b"0" * size)
    past = time.time() - age_seconds
    os.utime(path, (past, past))


def test_oldest_files_removed_first(tmp_path):
    _make_file(tmp_path / "old.mp4", 100, age_seconds=3600)
    _make_file(tmp_path / "mid.mp4", 100, age_seconds=1800)
    _make_file(tmp_path / "new.mp4", 100, age_seconds=10)
    removed = material_svc.enforce_material_cache_limit(
        cache_dir=str(tmp_path), max_bytes=250
    )
    assert removed == 1
    assert not (tmp_path / "old.mp4").exists()
    assert (tmp_path / "mid.mp4").exists()
    assert (tmp_path / "new.mp4").exists()


def test_under_limit_removes_nothing(tmp_path):
    _make_file(tmp_path / "a.mp4", 100, age_seconds=3600)
    removed = material_svc.enforce_material_cache_limit(
        cache_dir=str(tmp_path), max_bytes=1000
    )
    assert removed == 0
    assert (tmp_path / "a.mp4").exists()


def test_cache_hit_refreshes_mtime(tmp_path, monkeypatch):
    # save_video, var olan dosyada indirme yapmadan yolu döner ve mtime tazeler
    url = "http://example.com/video.mp4"
    from app.utils import utils

    url_hash = utils.md5(url.split("?")[0])
    path = tmp_path / f"vid-{url_hash}.mp4"
    _make_file(path, 100, age_seconds=3600)
    before = os.path.getmtime(path)
    result = material_svc.save_video(url, save_dir=str(tmp_path))
    assert result == str(path)
    assert os.path.getmtime(path) > before


def test_missing_cache_dir_is_noop(tmp_path):
    missing = tmp_path / "does-not-exist"
    removed = material_svc.enforce_material_cache_limit(
        cache_dir=str(missing), max_bytes=100
    )
    assert removed == 0


class _FakeResponse:
    def __init__(self, content: bytes):
        self.content = content


class _FakeClip:
    def __init__(self, path):
        self.duration = 5.0
        self.fps = 30.0

    def close(self):
        pass


def test_save_video_downloads_atomically(tmp_path, monkeypatch):
    # İndirme, doğrudan final cache path'e değil önce benzersiz bir temp
    # dosyaya yazılmalı; doğrulama sonrası os.replace ile atomik taşınmalı.
    # Böylece iki worker aynı URL'yi aynı anda indirse birbirini bozmaz ve
    # doğrulama sırasında os.remove yarışına girmez.
    monkeypatch.setattr(
        material_svc.requests, "get", lambda *a, **k: _FakeResponse(b"video-bytes")
    )
    monkeypatch.setattr(material_svc, "VideoFileClip", _FakeClip)

    opened_paths = []
    real_open = open

    def spy_open(path, *args, **kwargs):
        opened_paths.append(str(path))
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr("builtins.open", spy_open)

    result = material_svc.save_video(
        "http://example.com/v.mp4", save_dir=str(tmp_path)
    )

    assert result != ""
    assert os.path.exists(result)
    with open(result, "rb") as f:
        assert f.read() == b"video-bytes"
    assert glob.glob(str(tmp_path / "*.part")) == []
    # İndirme yazımı final path'e değil, ondan farklı bir temp path'e yapılmış olmalı.
    write_paths = [p for p in opened_paths if p != result]
    assert write_paths, "expected download write to go to a distinct temp path"
    assert all(p != result for p in write_paths)
    assert all(".part" in p for p in write_paths)


def test_save_video_removes_temp_on_invalid_download(tmp_path, monkeypatch):
    monkeypatch.setattr(
        material_svc.requests, "get", lambda *a, **k: _FakeResponse(b"garbage")
    )

    def _raise(path):
        raise ValueError("not a real video")

    monkeypatch.setattr(material_svc, "VideoFileClip", _raise)

    result = material_svc.save_video(
        "http://example.com/bad.mp4", save_dir=str(tmp_path)
    )

    assert result == ""
    assert glob.glob(str(tmp_path / "*.part")) == []
    assert glob.glob(str(tmp_path / "*.mp4")) == []
