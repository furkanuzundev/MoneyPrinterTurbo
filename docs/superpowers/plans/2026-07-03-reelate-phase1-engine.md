# Reelate Faz 1 — Motor Optimizasyonu + Worker'laştırma + SLO Ölçümü Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Video üretim motorunu 60 sn'lik videoyu ~2 dk'da üretecek şekilde hızlandırmak, Redis kuyruğundan beslenen durumsuz bir worker süreci eklemek ve SLO varsayımını ölçen bir benchmark aracı üretmek.

**Architecture:** Mevcut `app/services` pipeline'ı korunur; hız için config'e bağlı 720p çıktı, ffmpeg `veryfast` preset ve paralel klip indirme eklenir. Klip önbelleği (mevcut `storage/cache_videos` URL-hash dedup'u) LRU boyut sınırıyla tamamlanır. Worker, `worker/` paketinde yaşar: Redis `BRPOPLPUSH` ile güvenilir kuyruk (heartbeat + stale requeue), iş mantığı mevcut `task.start`'a delege edilir.

**Tech Stack:** Python 3.11, moviepy 2.2.1, ffmpeg, redis-py 5.2.0, pytest + fakeredis (dev), uv.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-03-reelate-credit-saas-design.md` (Bölüm 3: SLO tasarımı)
- Yeni config anahtarları `config.example.toml`'a belgelenerek eklenir; mevcut kullanıcı davranışı değişmez (varsayılanlar geriye uyumlu: `video_quality="1080p"`)
- Kuyruk anahtarları `reelate:` öneki ile başlar
- Testler `test/services/` ve `test/worker/` altına; `uv run pytest` ile koşulur
- Her task sonunda commit; commit mesajı sonunda `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Whisper altyazı MVP'de kapalı kalır (`subtitle_provider="edge"` varsayılanı değişmez)

---

### Task 1: Test altyapısı (pytest + fakeredis)

**Files:**
- Modify: `pyproject.toml` (dev dependency group)
- Create: `test/services/__init__.py`, `test/worker/__init__.py`

**Interfaces:**
- Produces: `uv run pytest` çalışır durumda; sonraki tüm task'lar bunu kullanır

- [ ] **Step 1: Dev bağımlılıklarını ekle**

```bash
uv add --dev pytest==8.4.2 fakeredis==2.26.2
```

- [ ] **Step 2: Test paket dosyalarını oluştur**

```bash
touch test/services/__init__.py
mkdir -p test/worker && touch test/worker/__init__.py
```

- [ ] **Step 3: pytest'in çalıştığını doğrula**

Run: `uv run pytest --collect-only -q`
Expected: hata yok (0 test toplanması normal)

- [ ] **Step 4: Commit**

```bash
git add pyproject.toml uv.lock test/services/__init__.py test/worker/__init__.py
git commit -m "chore: add pytest and fakeredis dev dependencies"
```

---

### Task 2: Config'e bağlı hedef çözünürlük (720p)

**Files:**
- Modify: `app/services/video.py` (yeni fonksiyon + 2 çağrı yeri: satır ~565 `combine_videos` içi ve ~904 `generate_video` içi)
- Modify: `config.example.toml` (`[app]` bölümüne anahtar)
- Test: `test/services/test_video_resolution.py`

**Interfaces:**
- Produces: `get_target_resolution(aspect: VideoAspect) -> tuple[int, int]` — `video.py` module-level; `config.app["video_quality"]` ("1080p" | "720p", varsayılan "1080p") okur

- [ ] **Step 1: Failing test yaz**

`test/services/test_video_resolution.py`:

```python
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
```

- [ ] **Step 2: Testin FAIL ettiğini doğrula**

Run: `uv run pytest test/services/test_video_resolution.py -v`
Expected: FAIL — `AttributeError: module ... has no attribute 'get_target_resolution'`

- [ ] **Step 3: Implementasyon**

`app/services/video.py` içine, `_get_configured_video_codec` fonksiyonunun üstüne ekle:

```python
def get_target_resolution(aspect: VideoAspect) -> tuple[int, int]:
    """Config'teki video_quality'ye göre hedef çözünürlük.

    "720p" seçiliyse doğal 1080 tabanlı çözünürlük 2/3 oranında küçültülür
    (1080x1920 -> 720x1280). Bilinmeyen değerde doğal çözünürlük korunur.
    """
    width, height = aspect.to_resolution()
    quality = str(config.app.get("video_quality", "1080p")).strip().lower()
    if quality == "720p":
        width, height = round(width * 2 / 3), round(height * 2 / 3)
    return width, height
```

İki çağrı yerini değiştir (satır ~565 ve ~904), her ikisinde de:

```python
# ESKİ:
video_width, video_height = aspect.to_resolution()
# YENİ:
video_width, video_height = get_target_resolution(aspect)
```

`config.example.toml` `[app]` bölümüne ekle:

```toml
# Çıktı çözünürlüğü: "1080p" (varsayılan) veya "720p".
# 720p, kısa video platformları için yeterlidir ve render süresini belirgin düşürür.
video_quality = "1080p"
```

- [ ] **Step 4: Testlerin PASS ettiğini doğrula**

Run: `uv run pytest test/services/test_video_resolution.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/video.py config.example.toml test/services/test_video_resolution.py
git commit -m "feat(video): add config-driven 720p target resolution"
```

---

### Task 3: ffmpeg veryfast preset

**Files:**
- Modify: `app/services/video.py` — `_write_videofile_with_codec_fallback` (~satır 276), `_fallback_write_videofile` (~263), `concat_video_clips_with_ffmpeg` (~316; içindeki `build_command` module-level fonksiyona çıkarılır)
- Modify: `config.example.toml`
- Test: `test/services/test_ffmpeg_preset.py`

**Interfaces:**
- Consumes: `_DEFAULT_VIDEO_CODEC = "libx264"` (video.py:77)
- Produces: `_get_ffmpeg_preset() -> str` (config `ffmpeg_preset`, varsayılan `"veryfast"`); `_build_concat_command(codec, concat_list_file, output_file, threads) -> list[str]` module-level

- [ ] **Step 1: Failing test yaz**

`test/services/test_ffmpeg_preset.py`:

```python
from app.services import video as video_svc


class FakeClip:
    def __init__(self):
        self.kwargs = None

    def write_videofile(self, output_file, **kwargs):
        self.kwargs = kwargs


def test_preset_added_for_libx264(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {})
    monkeypatch.setattr(video_svc, "_get_effective_video_codec", lambda c: "libx264")
    clip = FakeClip()
    video_svc._write_videofile_with_codec_fallback(clip, "/tmp/out.mp4", codec="libx264")
    assert clip.kwargs["preset"] == "veryfast"


def test_preset_configurable(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {"ffmpeg_preset": "ultrafast"})
    monkeypatch.setattr(video_svc, "_get_effective_video_codec", lambda c: "libx264")
    clip = FakeClip()
    video_svc._write_videofile_with_codec_fallback(clip, "/tmp/out.mp4", codec="libx264")
    assert clip.kwargs["preset"] == "ultrafast"


def test_preset_skipped_for_hw_encoder(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {})
    monkeypatch.setattr(
        video_svc, "_get_effective_video_codec", lambda c: "h264_videotoolbox"
    )
    clip = FakeClip()
    video_svc._write_videofile_with_codec_fallback(
        clip, "/tmp/out.mp4", codec="h264_videotoolbox"
    )
    assert "preset" not in clip.kwargs


def test_concat_command_includes_preset_for_libx264(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {})
    cmd = video_svc._build_concat_command("libx264", "/tmp/list.txt", "/tmp/o.mp4", 2)
    i = cmd.index("-preset")
    assert cmd[i + 1] == "veryfast"


def test_concat_command_skips_preset_for_hw_encoder(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {})
    cmd = video_svc._build_concat_command(
        "h264_videotoolbox", "/tmp/list.txt", "/tmp/o.mp4", 2
    )
    assert "-preset" not in cmd
```

- [ ] **Step 2: FAIL doğrula**

Run: `uv run pytest test/services/test_ffmpeg_preset.py -v`
Expected: FAIL — `_build_concat_command` yok / preset kwargs yok

- [ ] **Step 3: Implementasyon**

`app/services/video.py`:

```python
def _get_ffmpeg_preset() -> str:
    return str(config.app.get("ffmpeg_preset", "veryfast")).strip() or "veryfast"
```

`_write_videofile_with_codec_fallback` gövdesini güncelle — mevcut:

```python
def _write_videofile_with_codec_fallback(clip, output_file: str, codec: str, **kwargs):
    effective_codec = _get_effective_video_codec(codec)
    try:
        clip.write_videofile(output_file, codec=effective_codec, **kwargs)
        return effective_codec
```

yerine:

```python
def _write_videofile_with_codec_fallback(clip, output_file: str, codec: str, **kwargs):
    effective_codec = _get_effective_video_codec(codec)
    write_kwargs = dict(kwargs)
    if effective_codec == _DEFAULT_VIDEO_CODEC:
        write_kwargs.setdefault("preset", _get_ffmpeg_preset())
    try:
        clip.write_videofile(output_file, codec=effective_codec, **write_kwargs)
        return effective_codec
```

(aynı fonksiyonun `except` bloğundaki `_fallback_write_videofile(clip, output_file, effective_codec, str(exc), **kwargs)` çağrısı `**kwargs` ile kalır; `_fallback_write_videofile` içine de aynı iki satırı ekle:)

```python
def _fallback_write_videofile(clip, output_file: str, failed_codec: str, reason: str, **kwargs):
    ...
    write_kwargs = dict(kwargs)
    write_kwargs.setdefault("preset", _get_ffmpeg_preset())  # fallback her zaman libx264
    clip.write_videofile(output_file, codec=_DEFAULT_VIDEO_CODEC, **write_kwargs)
    _disable_runtime_video_codec(failed_codec, reason)
```

`concat_video_clips_with_ffmpeg` içindeki iç içe `build_command`'ı module-level'a çıkar:

```python
def _build_concat_command(
    codec: str, concat_list_file: str, output_file: str, threads: int
) -> list[str]:
    command = [
        utils.get_ffmpeg_binary(),
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concat_list_file,
        "-c:v",
        codec,
        "-threads",
        str(threads or 2),
        "-pix_fmt",
        "yuv420p",
    ]
    if codec == _DEFAULT_VIDEO_CODEC:
        command += ["-preset", _get_ffmpeg_preset()]
    command.append(output_file)
    return command
```

`concat_video_clips_with_ffmpeg` içinde `run_concat` artık şunu kullanır:

```python
    def run_concat(codec: str):
        command = _build_concat_command(codec, concat_list_file, output_file, threads)
```

(iç `build_command` tanımı silinir.)

`config.example.toml` `[app]`:

```toml
# ffmpeg x264 encode hız/kalite dengesi: ultrafast..veryslow. veryfast, kalite
# kaybı algılanmadan render süresini ciddi kısaltır.
ffmpeg_preset = "veryfast"
```

- [ ] **Step 4: PASS doğrula**

Run: `uv run pytest test/services/test_ffmpeg_preset.py test/services/test_video_resolution.py -v`
Expected: 10 PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/video.py config.example.toml test/services/test_ffmpeg_preset.py
git commit -m "feat(video): use veryfast ffmpeg preset for software encodes"
```

---

### Task 4: Paralel klip indirme

**Files:**
- Modify: `app/services/material.py` — `download_videos` içindeki sıralı indirme döngüsü (satır ~362-384)
- Modify: `config.example.toml`
- Test: `test/services/test_parallel_download.py`

**Interfaces:**
- Consumes: `save_video(video_url, save_dir) -> str` (material.py:244, URL-hash önbellekli)
- Produces: `_download_candidates_parallel(video_items, save_dir, needed_duration, max_clip_duration, concurrency) -> list[str]` — module-level, sıra korunur, süre karşılanınca durur

Not: `_download_videos_by_script_order` (script sıralı eşleme modu) kapsam dışı — MVP sihirbazı bu modu kullanmıyor; sıralı kalır.

- [ ] **Step 1: Failing test yaz**

`test/services/test_parallel_download.py`:

```python
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
```

- [ ] **Step 2: FAIL doğrula**

Run: `uv run pytest test/services/test_parallel_download.py -v`
Expected: FAIL — `_download_candidates_parallel` tanımlı değil

- [ ] **Step 3: Implementasyon**

`app/services/material.py` başına import ekle:

```python
from concurrent.futures import ThreadPoolExecutor
```

Module-level yeni fonksiyon (download_videos'un üstüne):

```python
def _download_candidates_parallel(
    video_items: list,
    save_dir: str,
    needed_duration: float,
    max_clip_duration: int,
    concurrency: int,
) -> List[str]:
    """Adaylari concurrency'lik partiler halinde paralel indirir.

    Parti tamamlaninca toplam sure kontrol edilir; needed_duration asilinca
    kalan adaylar indirilmez. Basarisiz/gecersiz indirmeler atlanir.
    """
    video_paths: List[str] = []
    total_duration = 0.0
    index = 0
    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        while index < len(video_items) and total_duration <= needed_duration:
            batch = video_items[index : index + max(1, concurrency)]
            index += len(batch)
            futures = [
                pool.submit(save_video, video_url=item.url, save_dir=save_dir)
                for item in batch
            ]
            for item, future in zip(batch, futures):
                try:
                    saved_video_path = future.result()
                except Exception as e:
                    logger.error(
                        f"failed to download video: {utils.to_json(item)} => {str(e)}"
                    )
                    continue
                if not saved_video_path:
                    continue
                video_paths.append(saved_video_path)
                total_duration += min(max_clip_duration, item.duration)
    return video_paths
```

`download_videos` içindeki sıralı döngüyü (`total_duration = 0.0` satırından `logger.success` öncesine kadar) şununla değiştir:

```python
    concurrency = int(config.app.get("download_concurrency", 4))
    video_paths = _download_candidates_parallel(
        video_items=valid_video_items,
        save_dir=material_directory,
        needed_duration=audio_duration,
        max_clip_duration=max_clip_duration,
        concurrency=concurrency,
    )
```

(üstteki `video_paths = []` satırı da kaldırılır; `import config` zaten mevcut.)

`config.example.toml` `[app]`:

```toml
# Stok klip indirme eşzamanlılığı. 4, Pexels CDN için güvenli bir değerdir.
download_concurrency = 4
```

- [ ] **Step 4: PASS doğrula**

Run: `uv run pytest test/services/test_parallel_download.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/material.py config.example.toml test/services/test_parallel_download.py
git commit -m "feat(material): download stock clips in parallel batches"
```

---

### Task 5: Klip önbelleği LRU boyut sınırı

**Files:**
- Modify: `app/services/material.py` — `save_video` (önbellek isabetinde mtime tazeleme) + yeni `enforce_material_cache_limit` + `download_videos` sonunda çağrı
- Modify: `config.example.toml`
- Test: `test/services/test_material_cache.py`

**Interfaces:**
- Consumes: `utils.storage_dir("cache_videos")` (mevcut önbellek dizini)
- Produces: `enforce_material_cache_limit(cache_dir: str | None = None, max_bytes: int | None = None) -> int` (silinen dosya sayısını döner)

- [ ] **Step 1: Failing test yaz**

`test/services/test_material_cache.py`:

```python
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
```

- [ ] **Step 2: FAIL doğrula**

Run: `uv run pytest test/services/test_material_cache.py -v`
Expected: FAIL — `enforce_material_cache_limit` yok; mtime testi de FAIL

- [ ] **Step 3: Implementasyon**

`app/services/material.py` — `save_video` içindeki önbellek isabeti bloğunu güncelle:

```python
    # if video already exists, return the path
    if os.path.exists(video_path) and os.path.getsize(video_path) > 0:
        os.utime(video_path, None)  # LRU: isabet eden dosyayı tazele
        logger.info(f"video already exists: {video_path}")
        return video_path
```

Yeni fonksiyon (save_video'nun altına):

```python
def enforce_material_cache_limit(
    cache_dir: str | None = None, max_bytes: int | None = None
) -> int:
    """Önbellek dizinini LRU mantığıyla max_bytes altına indirir."""
    cache_dir = cache_dir or utils.storage_dir("cache_videos")
    if max_bytes is None:
        max_gb = float(config.app.get("material_cache_max_gb", 50))
        max_bytes = int(max_gb * 1024**3)
    entries = []
    for name in os.listdir(cache_dir):
        path = os.path.join(cache_dir, name)
        if os.path.isfile(path):
            stat = os.stat(path)
            entries.append((stat.st_mtime, stat.st_size, path))
    total = sum(size for _, size, _ in entries)
    removed = 0
    for _, size, path in sorted(entries):
        if total <= max_bytes:
            break
        try:
            os.remove(path)
            total -= size
            removed += 1
        except OSError as e:
            logger.warning(f"failed to evict cache file {path}: {str(e)}")
    if removed:
        logger.info(f"evicted {removed} cached clips to enforce cache limit")
    return removed
```

`download_videos` fonksiyonunun sonunda, `logger.success(...)` satırından önce:

```python
    enforce_material_cache_limit()
```

`config.example.toml` `[app]`:

```toml
# Stok klip önbelleğinin (storage/cache_videos) üst sınırı, GB.
material_cache_max_gb = 50
```

- [ ] **Step 4: PASS doğrula**

Run: `uv run pytest test/services/test_material_cache.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/material.py config.example.toml test/services/test_material_cache.py
git commit -m "feat(material): enforce LRU size limit on clip cache"
```

---

### Task 6: Redis iş kuyruğu modülü

**Files:**
- Create: `worker/__init__.py`, `worker/queue.py`
- Test: `test/worker/test_queue.py`

**Interfaces:**
- Produces (worker/queue.py, hepsi module-level):
  - `PENDING_KEY = "reelate:queue:pending"`
  - `enqueue(r, task_id: str, params: dict, attempts: int = 0) -> None`
  - `claim(r, worker_id: str, timeout: int = 5) -> tuple[dict, str] | None` — (job, raw) döner; raw, complete için gerekli
  - `complete(r, worker_id: str, raw: str) -> None`
  - `heartbeat(r, worker_id: str, ttl: int = 30) -> None`
  - `requeue_stale(r) -> int` — heartbeat'i ölmüş worker'ların processing listelerini pending'e taşır

- [ ] **Step 1: Failing test yaz**

`test/worker/test_queue.py`:

```python
import json

import fakeredis

from worker import queue


def _redis():
    return fakeredis.FakeStrictRedis()


def test_enqueue_claim_roundtrip():
    r = _redis()
    queue.enqueue(r, "task-1", {"video_subject": "cats"})
    result = queue.claim(r, "worker-a", timeout=0)
    assert result is not None
    job, raw = result
    assert job["task_id"] == "task-1"
    assert job["params"] == {"video_subject": "cats"}
    assert job["attempts"] == 0
    # iş pending'den processing'e taşındı
    assert r.llen(queue.PENDING_KEY) == 0
    assert r.llen("reelate:queue:processing:worker-a") == 1
    assert json.loads(raw)["task_id"] == "task-1"


def test_claim_empty_returns_none():
    r = _redis()
    assert queue.claim(r, "worker-a", timeout=0) is None


def test_complete_removes_from_processing():
    r = _redis()
    queue.enqueue(r, "task-1", {})
    job, raw = queue.claim(r, "worker-a", timeout=0)
    queue.complete(r, "worker-a", raw)
    assert r.llen("reelate:queue:processing:worker-a") == 0


def test_requeue_stale_moves_dead_workers_jobs():
    r = _redis()
    queue.enqueue(r, "task-1", {})
    queue.claim(r, "dead-worker", timeout=0)  # heartbeat yok -> ölü
    moved = queue.requeue_stale(r)
    assert moved == 1
    assert r.llen(queue.PENDING_KEY) == 1
    assert r.llen("reelate:queue:processing:dead-worker") == 0


def test_requeue_stale_keeps_alive_workers_jobs():
    r = _redis()
    queue.enqueue(r, "task-1", {})
    queue.claim(r, "worker-a", timeout=0)
    queue.heartbeat(r, "worker-a")
    moved = queue.requeue_stale(r)
    assert moved == 0
    assert r.llen("reelate:queue:processing:worker-a") == 1


def test_attempts_preserved_through_requeue():
    r = _redis()
    queue.enqueue(r, "task-1", {}, attempts=1)
    queue.claim(r, "dead-worker", timeout=0)
    queue.requeue_stale(r)
    job, _ = queue.claim(r, "worker-b", timeout=0)
    assert job["attempts"] == 1
```

- [ ] **Step 2: FAIL doğrula**

Run: `uv run pytest test/worker/test_queue.py -v`
Expected: FAIL — `worker.queue` modülü yok

- [ ] **Step 3: Implementasyon**

`worker/__init__.py`: boş dosya.

`worker/queue.py`:

```python
"""Reelate güvenilir iş kuyruğu.

Desen: BRPOPLPUSH ile pending -> processing:{worker_id}. Worker canlılığı
heartbeat anahtarıyla izlenir; heartbeat'i düşen worker'ın processing
listesi requeue_stale ile pending'e geri taşınır. Böylece worker/makine
ölümünde iş kaybolmaz (spec Bölüm 3/9).
"""

import json

PENDING_KEY = "reelate:queue:pending"
PROCESSING_KEY_PREFIX = "reelate:queue:processing:"
HEARTBEAT_KEY_PREFIX = "reelate:worker:alive:"
HEARTBEAT_TTL_SECONDS = 30


def _processing_key(worker_id: str) -> str:
    return f"{PROCESSING_KEY_PREFIX}{worker_id}"


def _heartbeat_key(worker_id: str) -> str:
    return f"{HEARTBEAT_KEY_PREFIX}{worker_id}"


def enqueue(r, task_id: str, params: dict, attempts: int = 0) -> None:
    payload = json.dumps(
        {"task_id": task_id, "params": params, "attempts": attempts}
    )
    r.lpush(PENDING_KEY, payload)


def claim(r, worker_id: str, timeout: int = 5):
    if timeout > 0:
        raw = r.brpoplpush(PENDING_KEY, _processing_key(worker_id), timeout=timeout)
    else:
        raw = r.rpoplpush(PENDING_KEY, _processing_key(worker_id))
    if raw is None:
        return None
    raw = raw.decode() if isinstance(raw, bytes) else raw
    return json.loads(raw), raw


def complete(r, worker_id: str, raw: str) -> None:
    r.lrem(_processing_key(worker_id), 1, raw)


def heartbeat(r, worker_id: str, ttl: int = HEARTBEAT_TTL_SECONDS) -> None:
    r.set(_heartbeat_key(worker_id), "1", ex=ttl)


def requeue_stale(r) -> int:
    moved = 0
    for key in r.scan_iter(match=f"{PROCESSING_KEY_PREFIX}*"):
        key_str = key.decode() if isinstance(key, bytes) else key
        worker_id = key_str[len(PROCESSING_KEY_PREFIX):]
        if r.exists(_heartbeat_key(worker_id)):
            continue
        while r.rpoplpush(key_str, PENDING_KEY) is not None:
            moved += 1
    return moved
```

- [ ] **Step 4: PASS doğrula**

Run: `uv run pytest test/worker/test_queue.py -v`
Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git add worker/__init__.py worker/queue.py test/worker/test_queue.py
git commit -m "feat(worker): add reliable redis job queue with stale requeue"
```

---

### Task 7: Worker süreci

**Files:**
- Create: `worker/main.py`
- Test: `test/worker/test_main.py`

**Interfaces:**
- Consumes: `worker.queue` (Task 6 imzaları); `app.services.task.start(task_id, params, stop_at="video") -> dict | None`; `app.services.state` (`sm.state.update_task`); `app.models.const.TASK_STATE_FAILED`
- Produces: `process_job(r, worker_id: str, job: dict, raw: str) -> bool` (başarı durumu); `run() -> None` (ana döngü); `python -m worker.main` ile çalışır. `MAX_ATTEMPTS = 2` (spec Bölüm 9: 2 deneme sonrası failed)

- [ ] **Step 1: Failing test yaz**

`test/worker/test_main.py`:

```python
import fakeredis

from worker import main as worker_main
from worker import queue


def _redis():
    return fakeredis.FakeStrictRedis()


def _claimed(r, subject="cats", attempts=0):
    queue.enqueue(r, "task-1", {"video_subject": subject}, attempts=attempts)
    return queue.claim(r, "worker-a", timeout=0)


def test_success_completes_job(monkeypatch):
    r = _redis()
    calls = {}

    def fake_start(task_id, params, stop_at="video"):
        calls["task_id"] = task_id
        calls["subject"] = params.video_subject
        return {"videos": ["/tmp/final-1.mp4"]}

    monkeypatch.setattr(worker_main.tm, "start", fake_start)
    job, raw = _claimed(r)
    assert worker_main.process_job(r, "worker-a", job, raw) is True
    assert calls == {"task_id": "task-1", "subject": "cats"}
    assert r.llen("reelate:queue:processing:worker-a") == 0
    assert r.llen(queue.PENDING_KEY) == 0


def test_failure_requeues_with_attempt(monkeypatch):
    r = _redis()

    def fake_start(task_id, params, stop_at="video"):
        raise RuntimeError("render exploded")

    monkeypatch.setattr(worker_main.tm, "start", fake_start)
    job, raw = _claimed(r)
    assert worker_main.process_job(r, "worker-a", job, raw) is False
    assert r.llen(queue.PENDING_KEY) == 1
    requeued, _ = queue.claim(r, "worker-b", timeout=0)
    assert requeued["attempts"] == 1


def test_final_failure_marks_task_failed(monkeypatch):
    r = _redis()
    states = {}

    def fake_start(task_id, params, stop_at="video"):
        raise RuntimeError("still broken")

    def fake_update(task_id, **kwargs):
        states[task_id] = kwargs

    monkeypatch.setattr(worker_main.tm, "start", fake_start)
    monkeypatch.setattr(worker_main.sm.state, "update_task", fake_update)
    job, raw = _claimed(r, attempts=1)  # bu ikinci deneme
    assert worker_main.process_job(r, "worker-a", job, raw) is False
    assert r.llen(queue.PENDING_KEY) == 0  # tekrar kuyruğa girmedi
    assert states["task-1"]["state"] == worker_main.const.TASK_STATE_FAILED


def test_empty_result_treated_as_failure(monkeypatch):
    r = _redis()
    monkeypatch.setattr(
        worker_main.tm, "start", lambda task_id, params, stop_at="video": None
    )
    job, raw = _claimed(r)
    assert worker_main.process_job(r, "worker-a", job, raw) is False
    assert r.llen(queue.PENDING_KEY) == 1
```

- [ ] **Step 2: FAIL doğrula**

Run: `uv run pytest test/worker/test_main.py -v`
Expected: FAIL — `worker.main` yok

- [ ] **Step 3: Implementasyon**

`worker/main.py`:

```python
"""Reelate render worker: Redis kuyruğundan iş çeker, video üretir.

Çalıştırma: uv run python -m worker.main
Gereksinim: config.toml'da enable_redis=true ve redis_* ayarları.
"""

import os
import socket
import threading
import time

from loguru import logger

from app.config import config
from app.models import const
from app.models.schema import VideoParams
from app.services import state as sm
from app.services import task as tm
from worker import queue

MAX_ATTEMPTS = 2
CLAIM_TIMEOUT_SECONDS = 5
HEARTBEAT_INTERVAL_SECONDS = 10


def _redis_client():
    import redis

    return redis.Redis(
        host=config.app.get("redis_host", "localhost"),
        port=int(config.app.get("redis_port", 6379)),
        db=int(config.app.get("redis_db", 0)),
        password=config.app.get("redis_password") or None,
    )


def process_job(r, worker_id: str, job: dict, raw: str) -> bool:
    task_id = job["task_id"]
    attempts = int(job.get("attempts", 0))
    logger.info(f"processing task {task_id} (attempt {attempts + 1}/{MAX_ATTEMPTS})")
    try:
        params = VideoParams(**job["params"])
        result = tm.start(task_id, params)
        if not result:
            raise RuntimeError("task returned no result")
        queue.complete(r, worker_id, raw)
        logger.success(f"task {task_id} completed")
        return True
    except Exception as e:
        logger.error(f"task {task_id} failed: {str(e)}")
        queue.complete(r, worker_id, raw)
        if attempts + 1 < MAX_ATTEMPTS:
            queue.enqueue(r, task_id, job["params"], attempts=attempts + 1)
            logger.info(f"task {task_id} requeued")
        else:
            sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
            logger.error(f"task {task_id} permanently failed")
        return False


def _heartbeat_loop(r, worker_id: str, stop: threading.Event):
    while not stop.is_set():
        try:
            queue.heartbeat(r, worker_id)
        except Exception as e:
            logger.warning(f"heartbeat failed: {str(e)}")
        stop.wait(HEARTBEAT_INTERVAL_SECONDS)


def run() -> None:
    worker_id = f"{socket.gethostname()}-{os.getpid()}"
    r = _redis_client()
    stop = threading.Event()
    threading.Thread(
        target=_heartbeat_loop, args=(r, worker_id, stop), daemon=True
    ).start()
    logger.info(f"worker {worker_id} started, waiting for jobs")
    try:
        while True:
            try:
                queue.requeue_stale(r)
                claimed = queue.claim(r, worker_id, timeout=CLAIM_TIMEOUT_SECONDS)
                if claimed is None:
                    continue
                job, raw = claimed
                process_job(r, worker_id, job, raw)
            except KeyboardInterrupt:
                raise
            except Exception as e:
                logger.error(f"worker loop error: {str(e)}")
                time.sleep(2)
    except KeyboardInterrupt:
        logger.info("worker shutting down")
    finally:
        stop.set()


if __name__ == "__main__":
    run()
```

- [ ] **Step 4: PASS doğrula**

Run: `uv run pytest test/worker/ -v`
Expected: 10 PASS (queue 6 + main 4)

- [ ] **Step 5: Commit**

```bash
git add worker/main.py test/worker/test_main.py
git commit -m "feat(worker): add queue-consuming render worker process"
```

---

### Task 8: Enqueue CLI + uçtan uca kuyruk doğrulaması

**Files:**
- Create: `worker/enqueue.py`

**Interfaces:**
- Consumes: `worker.queue.enqueue`, `worker.main._redis_client`
- Produces: `python -m worker.enqueue --subject "..." --script-file <path> --terms "a,b"` — task_id basar. Faz 2'de Next.js aynı Redis anahtarına yazacak.

- [ ] **Step 1: CLI'yi yaz**

`worker/enqueue.py`:

```python
"""Test amaçlı iş kuyruklama CLI'si.

Örnek:
  uv run python -m worker.enqueue --subject "morning habits" \
      --script-file test/resources/script-60s.txt --terms "morning,coffee,sunrise"
"""

import argparse
import uuid

from worker import queue
from worker.main import _redis_client


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", required=True)
    parser.add_argument("--script-file", default="")
    parser.add_argument("--terms", default="")
    parser.add_argument("--aspect", default="9:16", choices=["9:16", "16:9", "1:1"])
    parser.add_argument("--voice", default="en-US-JennyNeural-Female")
    args = parser.parse_args()

    script = ""
    if args.script_file:
        with open(args.script_file, encoding="utf-8") as f:
            script = f.read().strip()

    params = {
        "video_subject": args.subject,
        "video_script": script,
        "video_terms": [t.strip() for t in args.terms.split(",") if t.strip()],
        "video_aspect": args.aspect,
        "voice_name": args.voice,
        "subtitle_enabled": True,
    }
    task_id = str(uuid.uuid4())
    queue.enqueue(_redis_client(), task_id, params)
    print(task_id)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 60 sn'lik senaryo fixture'ı oluştur**

`test/resources/script-60s.txt` — ~150 kelimelik İngilizce sabit metin:

```
Every morning offers a fresh start, but most people waste it scrolling through their phones. Here are three habits that can transform your mornings. First, drink a full glass of water before anything else. Your body wakes up dehydrated, and water kickstarts your metabolism instantly. Second, spend five minutes moving your body. You do not need a full workout; simple stretches or a short walk will wake up your muscles and sharpen your mind. Third, write down one goal for the day. Just one. A single clear intention beats a long list you will never finish. These three habits take less than fifteen minutes combined, yet they set the tone for everything that follows. Try them for one week and notice the difference in your energy, focus, and mood. Small consistent actions compound into remarkable results. Your future self will thank you for starting today.
```

- [ ] **Step 3: Uçtan uca doğrulama (Redis + worker + gerçek üretim)**

Redis'i başlat (Docker en pratik yol):

```bash
docker run -d --name reelate-redis -p 6379:6379 redis:7-alpine
```

`config.toml`'da `enable_redis = true` yap (redis_host varsayılanı localhost). Ayrıca `video_quality = "720p"` ekle. Sonra:

```bash
# Terminal 1:
uv run python -m worker.main
# Terminal 2:
uv run python -m worker.enqueue --subject "morning habits" \
  --script-file test/resources/script-60s.txt --terms "morning,coffee,sunrise,journal,stretching"
```

Expected: worker logunda `processing task <id>` → pipeline logları → `task <id> completed`; `storage/tasks/<task_id>/final-1.mp4` oluşur ve oynatılabilir.

- [ ] **Step 4: Commit**

```bash
git add worker/enqueue.py test/resources/script-60s.txt
git commit -m "feat(worker): add enqueue CLI for end-to-end queue testing"
```

---

### Task 9: SLO benchmark aracı

**Files:**
- Create: `scripts/benchmark_slo.py`

**Interfaces:**
- Consumes: `app.services.task` fonksiyonları (`generate_audio`, `generate_subtitle`, `get_video_materials`, `generate_final_videos`, `start`), Task 8'in `test/resources/script-60s.txt` fixture'ı
- Produces: `uv run python scripts/benchmark_slo.py [--aspect 9:16]` — aşama bazlı süre tablosu basar, JSON'u `storage/benchmarks/` altına yazar

- [ ] **Step 1: Benchmark script'ini yaz**

`scripts/benchmark_slo.py`:

```python
"""Reelate SLO benchmark: tam pipeline'ı sabit senaryoyla koşup aşama
sürelerini ölçer. LLM adımı dahil değildir (senaryo sabit; spec Bölüm 3:
LLM sihirbazda, SLO saati dışında).

Kullanım: uv run python scripts/benchmark_slo.py [--aspect 9:16] [--label mac-local]
Gereksinim: config.toml'da geçerli Pexels API key.
"""

import argparse
import functools
import json
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.schema import VideoParams
from app.services import task as task_svc
from app.utils import utils

STAGES = {
    "generate_audio": "tts",
    "generate_subtitle": "subtitle",
    "get_video_materials": "download",
    "generate_final_videos": "render",
}
TIMINGS: dict[str, float] = {}


def _instrument(func_name: str, label: str):
    original = getattr(task_svc, func_name)

    @functools.wraps(original)
    def wrapper(*args, **kwargs):
        started = time.perf_counter()
        try:
            return original(*args, **kwargs)
        finally:
            TIMINGS[label] = time.perf_counter() - started

    setattr(task_svc, func_name, wrapper)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--aspect", default="9:16", choices=["9:16", "16:9", "1:1"])
    parser.add_argument("--label", default="unlabeled")
    args = parser.parse_args()

    script_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "test/resources/script-60s.txt",
    )
    with open(script_path, encoding="utf-8") as f:
        script = f.read().strip()

    for func_name, label in STAGES.items():
        _instrument(func_name, label)

    params = VideoParams(
        video_subject="morning habits benchmark",
        video_script=script,
        video_terms=["morning", "coffee", "sunrise", "journal", "stretching"],
        video_aspect=args.aspect,
        voice_name="en-US-JennyNeural-Female",
        subtitle_enabled=True,
    )
    task_id = f"benchmark-{uuid.uuid4()}"
    started = time.perf_counter()
    result = task_svc.start(task_id, params)
    total = time.perf_counter() - started

    if not result:
        print("BENCHMARK FAILED: task produced no result", file=sys.stderr)
        sys.exit(1)

    report = {
        "label": args.label,
        "aspect": args.aspect,
        "task_id": task_id,
        "stages_seconds": {k: round(v, 2) for k, v in TIMINGS.items()},
        "total_seconds": round(total, 2),
        "videos": result.get("videos", []),
    }
    out_dir = utils.storage_dir("benchmarks", create=True)
    out_file = os.path.join(out_dir, f"benchmark-{int(time.time())}.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"\n{'Stage':<12} {'Seconds':>8}")
    print("-" * 21)
    for stage in ["tts", "subtitle", "download", "render"]:
        print(f"{stage:<12} {TIMINGS.get(stage, 0):>8.1f}")
    print("-" * 21)
    print(f"{'TOTAL':<12} {total:>8.1f}")
    print(f"\nreport: {out_file}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Script'in çalıştığını doğrula (gerçek koşu)**

Run: `uv run python scripts/benchmark_slo.py --label smoke`
Expected: aşama tablosu basılır, `storage/benchmarks/benchmark-*.json` oluşur, exit 0

- [ ] **Step 3: Commit**

```bash
git add scripts/benchmark_slo.py
git commit -m "feat(bench): add per-stage SLO benchmark script"
```

---

### Task 10: SLO ölçümü — önce/sonra karşılaştırması ve kayıt

**Files:**
- Create: `docs/superpowers/specs/2026-07-03-phase1-slo-results.md`
- Modify: `docs/superpowers/specs/2026-07-03-reelate-credit-saas-design.md` (Bölüm 3'teki ⚠ varsayım notu ölçümle güncellenir)

**Interfaces:**
- Consumes: Task 9 benchmark aracı

- [ ] **Step 1: "Önce" ölçümü (1080p + varsayılan preset)**

`config.toml`'da geçici olarak `video_quality = "1080p"` ve `ffmpeg_preset = "medium"` ayarla, sonra:

Run: `uv run python scripts/benchmark_slo.py --label before-1080p-medium`
Expected: JSON raporu oluşur; toplam süreyi not et

- [ ] **Step 2: "Sonra" ölçümü (720p + veryfast, soğuk önbellek)**

`config.toml`'a `video_quality = "720p"`, `ffmpeg_preset = "veryfast"` ayarla; `storage/cache_videos` içeriğini geçici boşalt (soğuk ölçüm için):

Run: `uv run python scripts/benchmark_slo.py --label after-720p-veryfast-cold`

- [ ] **Step 3: "Sonra" ölçümü (sıcak önbellek)**

Aynı komutu tekrar çalıştır (klipler artık önbellekte):

Run: `uv run python scripts/benchmark_slo.py --label after-720p-veryfast-warm`

- [ ] **Step 4: Sonuç dokümanını yaz**

`docs/superpowers/specs/2026-07-03-phase1-slo-results.md` — üç koşunun aşama tablolarını, makine bilgisini (Apple Silicon Mac — Hetzner CPX51 değil; nihai SLO ölçümü Faz 3'te sunucuda tekrarlanacak) ve sonucu içerir. Spec Bölüm 3'teki ⚠ notuna ölçülen değerler işlenir: hedef "render ≤ ~2 dk" tutuyor mu, tutmuyorsa hangi ek optimizasyon gerekiyor (aday: fps=30→24, klip ön-ölçekleme).

- [ ] **Step 5: Tüm test paketini koş ve commit'le**

Run: `uv run pytest -v`
Expected: tüm testler PASS

```bash
git add docs/superpowers/specs/2026-07-03-phase1-slo-results.md docs/superpowers/specs/2026-07-03-reelate-credit-saas-design.md
git commit -m "docs: record phase 1 SLO benchmark results"
```

---

## Self-Review Notları

- **Spec kapsaması:** Faz 1 kapsamındaki tüm kalemler karşılandı — 720p (Task 2), veryfast (Task 3), paralel indirme (Task 4), klip önbelleği LRU (Task 5; URL-hash dedup zaten mevcuttu), worker'laştırma (Task 6-8), SLO ölçümü (Task 9-10). Azure TTS yedeği spec Bölüm 3'te geçiyor ancak faz planında motor optimizasyonu kalemi değil; Faz 2 planına taşınacak (kuyruk/SaaS entegrasyonuyla birlikte). Script-order indirme modu bilinçli kapsam dışı (Task 4 notu).
- **Tip tutarlılığı:** `claim` her yerde `tuple[dict, str] | None`; `process_job(r, worker_id, job, raw) -> bool`; `enqueue(r, task_id, params: dict, attempts)` — Task 6/7/8 çapraz kontrol edildi.
- **Placeholder taraması:** temiz.
