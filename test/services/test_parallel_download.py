import time

from app.models.schema import MaterialInfo
from app.services import material as material_svc


def _item(url: str, duration: int = 10) -> MaterialInfo:
    item = MaterialInfo()
    item.provider = "pexels"
    item.url = url
    item.duration = duration
    return item


def test_stops_when_duration_satisfied(monkeypatch, tmp_path):
    downloaded = []

    def fake_save(video_url, save_dir=""):
        downloaded.append(video_url)
        return f"{save_dir}/{video_url.split('/')[-1]}.mp4"

    monkeypatch.setattr(material_svc, "save_video", fake_save)
    items = [_item(f"http://x/{i}") for i in range(20)]
    paths = material_svc._download_candidates_parallel(
        items, str(tmp_path), needed_duration=10.0, max_clip_duration=5, concurrency=4
    )
    # her klip min(5,10)=5 sn sayılır; 10 sn'yi aşmak için 3 klip (batch=4 nedeniyle
    # en fazla 4 indirme yapılmış olabilir, 8'e asla çıkmamalı)
    assert len(paths) >= 3
    assert len(downloaded) <= 4


def test_failed_download_skipped(monkeypatch, tmp_path):
    def fake_save(video_url, save_dir=""):
        if video_url.endswith("/1"):
            raise RuntimeError("network")
        if video_url.endswith("/2"):
            return ""  # geçersiz dosya
        return f"{save_dir}/ok.mp4"

    monkeypatch.setattr(material_svc, "save_video", fake_save)
    items = [_item(f"http://x/{i}", duration=3) for i in range(4)]
    paths = material_svc._download_candidates_parallel(
        items, str(tmp_path), needed_duration=100.0, max_clip_duration=5, concurrency=2
    )
    assert len(paths) == 2  # 0 ve 3 başarılı


def test_runs_concurrently(monkeypatch, tmp_path):
    def slow_save(video_url, save_dir=""):
        time.sleep(0.2)
        return f"{save_dir}/x.mp4"

    monkeypatch.setattr(material_svc, "save_video", slow_save)
    items = [_item(f"http://x/{i}", duration=3) for i in range(4)]
    t0 = time.perf_counter()
    material_svc._download_candidates_parallel(
        items, str(tmp_path), needed_duration=100.0, max_clip_duration=5, concurrency=4
    )
    elapsed = time.perf_counter() - t0
    assert elapsed < 0.6  # sıralı olsaydı ~0.8 sn sürerdi
