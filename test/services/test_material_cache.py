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
