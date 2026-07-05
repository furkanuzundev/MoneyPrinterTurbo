# Hetzner Object Storage Video Depolama — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render edilen videoları ve rerender için gereken ara dosyaları paylaşımlı Docker volume yerine Hetzner Object Storage (S3 uyumlu) bucket'ta saklamak; kullanıcıya presigned URL redirect ile sunmak.

**Architecture:** Python tarafında tek bir `storage` soyutlama katmanı (`LocalStorage` + `S3Storage`) worker'ın upload/download/delete ihtiyaçlarını karşılar. Web tarafında ayna bir `storage` yardımcısı auth sonrası presigned GET URL üretip 307 redirect döner. Backend seçimi env/config ile anahtarlanır; env yoksa mevcut yerel-dosya davranışı korunur (regresyon yok).

**Tech Stack:** Python 3 + `boto3` + `moto` (test); Next.js + `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`; vitest; pytest/unittest.

## Global Constraints

- Backend anahtarı: `storage_backend` (config.toml, Python) / `STORAGE_BACKEND` (env, web). Değer `s3` veya `local` (varsayılan `local`).
- S3 config anahtarları (Python, `config.app.get`): `s3_endpoint`, `s3_bucket`, `s3_region`, `s3_access_key`, `s3_secret_key`.
- S3 env değişkenleri (web): `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`.
- Bucket private. Presigned GET TTL = 15 dakika (900 sn).
- Bucket key formatı: `tasks/<task_id>/<dosya>` (örn. `tasks/<id>/final-1.mp4`). Bu string DB `outputPath` ile bire bir aynıdır.
- `boto3` endpoint için `endpoint_url=s3_endpoint`, `region_name=s3_region`, path-style zorunlu değil ama Hetzner virtual-hosted destekler; varsayılan bırakılır.
- Mevcut testler `storage_backend=local` (varsayılan) altında yeşil kalmalı.
- Rerender'ın mevcut güvenlik mantığı korunur: hata → COMPLETE'e geri dön, asla FAILED yazma.
- `storage/cache_videos` stok önbelleği task dizininden ayrıdır; hiçbir temizlik onu silmez.

---

### Task 1: Python storage soyutlama katmanı

**Files:**
- Create: `app/services/storage.py`
- Test: `test/services/test_storage.py`

**Interfaces:**
- Consumes: `app.config.config` (config.app.get ile anahtarlar).
- Produces:
  - `get_storage() -> Storage` — config'e göre `LocalStorage` veya `S3Storage` döner (modül-seviyesi singleton).
  - `class Storage` (soyut) metotları:
    - `put(local_path: str, key: str) -> None`
    - `get(key: str, local_path: str) -> None`
    - `delete_prefix(prefix: str) -> None`
    - `presigned_get(key: str, ttl: int = 900) -> str`
    - `exists(key: str) -> bool`
  - `class LocalStorage(Storage)` — key'i `utils.storage_dir()` altına map eder; `put`/`get` kopyalar, `presigned_get` `file://` mutlak yol döner, `delete_prefix` dizini siler.
  - `class S3Storage(Storage)` — boto3 client ile bucket işlemleri.

- [ ] **Step 1: boto3 bağımlılığını ekle**

`requirements.txt` sonuna ekle:

```
boto3==1.35.99
```

`pyproject.toml` içindeki test/dev bağımlılıklarına (pytest'in yanına) ekle:

```
    "moto==5.0.28",
```

- [ ] **Step 2: Failing test yaz — LocalStorage round-trip**

`test/services/test_storage.py` oluştur:

```python
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.services import storage as st


class TestLocalStorage(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()

    def _local(self):
        # storage_dir() root'unu geçici dizine çevir
        patcher = patch("app.services.storage.utils.storage_dir", return_value=self.root)
        patcher.start()
        self.addCleanup(patcher.stop)
        return st.LocalStorage()

    def test_put_then_get_roundtrip(self):
        local = self._local()
        src = os.path.join(self.root, "src.txt")
        with open(src, "w") as f:
            f.write("hello")
        local.put(src, "tasks/abc/final-1.mp4")
        self.assertTrue(local.exists("tasks/abc/final-1.mp4"))
        dst = os.path.join(self.root, "dst.txt")
        local.get("tasks/abc/final-1.mp4", dst)
        with open(dst) as f:
            self.assertEqual(f.read(), "hello")

    def test_delete_prefix_removes_task_dir(self):
        local = self._local()
        src = os.path.join(self.root, "src.txt")
        with open(src, "w") as f:
            f.write("x")
        local.put(src, "tasks/abc/final-1.mp4")
        local.delete_prefix("tasks/abc/")
        self.assertFalse(local.exists("tasks/abc/final-1.mp4"))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Test'i çalıştır, fail görmeli**

Run: `python -m pytest test/services/test_storage.py -v`
Expected: FAIL — `ModuleNotFoundError: app.services.storage` veya `AttributeError`.

- [ ] **Step 4: storage.py'yi yaz**

`app/services/storage.py` oluştur:

```python
"""Depolama soyutlaması: yerel disk veya S3 uyumlu bucket (Hetzner Object Storage).

Backend config.toml'daki storage_backend ile seçilir ("local" | "s3").
Anahtar (key) formatı worker ve web arasında ortaktır: tasks/<task_id>/<dosya>.
"""

import os
import shutil

from loguru import logger

from app.config import config
from app.utils import utils


class Storage:
    def put(self, local_path: str, key: str) -> None:
        raise NotImplementedError

    def get(self, key: str, local_path: str) -> None:
        raise NotImplementedError

    def delete_prefix(self, prefix: str) -> None:
        raise NotImplementedError

    def presigned_get(self, key: str, ttl: int = 900) -> str:
        raise NotImplementedError

    def exists(self, key: str) -> bool:
        raise NotImplementedError


class LocalStorage(Storage):
    """key'i storage_dir() altına map eder. Mevcut yerel-dosya davranışı."""

    def _path(self, key: str) -> str:
        return os.path.join(utils.storage_dir(), key)

    def put(self, local_path: str, key: str) -> None:
        dst = self._path(key)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if os.path.abspath(local_path) != os.path.abspath(dst):
            shutil.copy2(local_path, dst)

    def get(self, key: str, local_path: str) -> None:
        src = self._path(key)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        if os.path.abspath(src) != os.path.abspath(local_path):
            shutil.copy2(src, local_path)

    def delete_prefix(self, prefix: str) -> None:
        target = self._path(prefix.rstrip("/"))
        if os.path.isdir(target):
            shutil.rmtree(target, ignore_errors=True)

    def presigned_get(self, key: str, ttl: int = 900) -> str:
        return "file://" + self._path(key)

    def exists(self, key: str) -> bool:
        return os.path.exists(self._path(key))


class S3Storage(Storage):
    """Hetzner Object Storage (S3 uyumlu). boto3 ile konuşur."""

    def __init__(self):
        import boto3

        self._bucket = config.app.get("s3_bucket")
        self._client = boto3.client(
            "s3",
            endpoint_url=config.app.get("s3_endpoint"),
            region_name=config.app.get("s3_region"),
            aws_access_key_id=config.app.get("s3_access_key"),
            aws_secret_access_key=config.app.get("s3_secret_key"),
        )

    def put(self, local_path: str, key: str) -> None:
        self._client.upload_file(local_path, self._bucket, key)

    def get(self, key: str, local_path: str) -> None:
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        self._client.download_file(self._bucket, key, local_path)

    def delete_prefix(self, prefix: str) -> None:
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            objs = [{"Key": o["Key"]} for o in page.get("Contents", [])]
            if objs:
                self._client.delete_objects(
                    Bucket=self._bucket, Delete={"Objects": objs}
                )

    def presigned_get(self, key: str, ttl: int = 900) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=ttl,
        )

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError:
            return False


_storage = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        backend = str(config.app.get("storage_backend", "local")).strip().lower()
        if backend == "s3":
            logger.info("storage backend: s3")
            _storage = S3Storage()
        else:
            logger.info("storage backend: local")
            _storage = LocalStorage()
    return _storage
```

- [ ] **Step 5: LocalStorage testini çalıştır, geçmeli**

Run: `python -m pytest test/services/test_storage.py -v`
Expected: PASS (2 test).

- [ ] **Step 6: S3Storage için moto testi ekle**

`test/services/test_storage.py` içine, `TestLocalStorage`'ın altına ekle:

```python
class TestS3Storage(unittest.TestCase):
    def setUp(self):
        try:
            from moto import mock_aws
        except ImportError:
            self.skipTest("moto not installed")
        self._mock = mock_aws()
        self._mock.start()
        self.addCleanup(self._mock.stop)
        import boto3

        self._boto = boto3.client("s3", region_name="us-east-1")
        self._boto.create_bucket(Bucket="test-bucket")
        cfg = {
            "s3_bucket": "test-bucket",
            "s3_endpoint": None,
            "s3_region": "us-east-1",
            "s3_access_key": "test",
            "s3_secret_key": "test",
        }
        patcher = patch.object(st.config, "app", cfg)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.root = tempfile.mkdtemp()

    def test_put_get_exists_delete(self):
        s3 = st.S3Storage()
        src = os.path.join(self.root, "src.txt")
        with open(src, "w") as f:
            f.write("data")
        s3.put(src, "tasks/xyz/final-1.mp4")
        self.assertTrue(s3.exists("tasks/xyz/final-1.mp4"))
        dst = os.path.join(self.root, "out.txt")
        s3.get("tasks/xyz/final-1.mp4", dst)
        with open(dst) as f:
            self.assertEqual(f.read(), "data")
        s3.delete_prefix("tasks/xyz/")
        self.assertFalse(s3.exists("tasks/xyz/final-1.mp4"))

    def test_presigned_get_returns_url(self):
        s3 = st.S3Storage()
        url = s3.presigned_get("tasks/xyz/final-1.mp4", ttl=900)
        self.assertIn("tasks/xyz/final-1.mp4", url)
        self.assertTrue(url.startswith("http"))
```

- [ ] **Step 7: Tüm storage testini çalıştır**

Run: `python -m pytest test/services/test_storage.py -v`
Expected: PASS (4 test). moto kuruluysa S3 testleri çalışır; değilse skip.

- [ ] **Step 8: Commit**

```bash
git add app/services/storage.py test/services/test_storage.py requirements.txt pyproject.toml
git commit -m "feat(storage): S3/local storage soyutlama katmanı"
```

---

### Task 2: Worker render çıktısını bucket'a yükle (`start`)

**Files:**
- Modify: `app/services/task.py` (import bloğu; `generate_final_videos` sonrası veya `start` içinde upload)
- Test: `test/services/test_task.py`

**Interfaces:**
- Consumes: `app.services.storage.get_storage()`, `Storage.put`.
- Produces: `start()` render bitince `final-<i>.mp4`, `combined-1.mp4`, `audio.mp3` dosyalarını `tasks/<task_id>/<isim>` key'leriyle bucket'a yükler. Yerel dosya bırakılır (retry güvenliği); `LocalStorage`'da put no-op benzeri (aynı yol → kopya atlanır).

- [ ] **Step 1: task.py import'una storage ekle**

`app/services/task.py` içindeki servis import satırını güncelle:

Mevcut:
```python
from app.services import llm, material, subtitle, twelvelabs, video, voice, upload_post
```
Yeni:
```python
from app.services import llm, material, subtitle, twelvelabs, video, voice, upload_post
from app.services import storage as sto
```

- [ ] **Step 2: Failing test yaz — start upload çağrısı**

`test/services/test_task.py` içine yeni test ekle (sınıf içine):

```python
    def test_start_uploads_outputs_to_storage(self):
        """Render bitince final/combined/audio bucket'a put edilmeli."""
        params = VideoParams(video_subject="x", video_script="bir cümle.", video_source="local")
        put_calls = []

        class FakeStorage:
            def put(self, local, key):
                put_calls.append(key)

        with patch.object(tm, "generate_script", return_value="bir cümle."), \
             patch.object(tm, "generate_terms", return_value="x"), \
             patch.object(tm, "save_script_data"), \
             patch.object(tm, "generate_audio", return_value=("audio.mp3", 3.0, object())), \
             patch.object(tm, "generate_subtitle", return_value="sub.srt"), \
             patch.object(tm, "get_video_materials", return_value=["m.mp4"]), \
             patch.object(tm, "generate_final_videos",
                          return_value=(["/t/tasks/id/final-1.mp4"], ["/t/tasks/id/combined-1.mp4"])), \
             patch.object(tm.sto, "get_storage", return_value=FakeStorage()), \
             patch.object(tm.sm.state, "update_task"):
            tm.start("id", params)

        self.assertIn("tasks/id/final-1.mp4", put_calls)
        self.assertIn("tasks/id/combined-1.mp4", put_calls)
        self.assertIn("tasks/id/audio.mp3", put_calls)
```

- [ ] **Step 3: Test'i çalıştır, fail görmeli**

Run: `python -m pytest test/services/test_task.py::TestTaskService::test_start_uploads_outputs_to_storage -v`
Expected: FAIL — put çağrıları boş (`AssertionError`).

- [ ] **Step 4: start()'a upload adımı ekle**

`app/services/task.py` içinde `start()` fonksiyonunda, `generate_final_videos(...)` çağrısından sonra ve `TASK_STATE_COMPLETE` set edilmeden önce (final_video_paths elde edildikten hemen sonra) şu bloğu ekle:

```python
    # Çıktıları ve rerender için gereken ara dosyaları bucket'a yükle.
    # (LocalStorage'da bu no-op benzeri: kaynak==hedef ise kopya atlanır.)
    store = sto.get_storage()
    for fp in final_video_paths:
        store.put(fp, f"tasks/{task_id}/{path.basename(fp)}")
    for cp in combined_video_paths:
        store.put(cp, f"tasks/{task_id}/{path.basename(cp)}")
    audio_key_src = path.join(utils.task_dir(task_id), "audio.mp3")
    if path.exists(audio_key_src):
        store.put(audio_key_src, f"tasks/{task_id}/audio.mp3")
```

> Not: Bu bloğun `start()` içinde `final_video_paths, combined_video_paths = generate_final_videos(...)` satırından sonra geldiğinden emin ol. `audio_file` değişkeni zaten `audio.mp3` mutlak yolunu tutuyorsa `audio_key_src` yerine onu kullan.

- [ ] **Step 5: Test'i çalıştır, geçmeli**

Run: `python -m pytest test/services/test_task.py::TestTaskService::test_start_uploads_outputs_to_storage -v`
Expected: PASS.

- [ ] **Step 6: Regresyon — tüm task testleri**

Run: `python -m pytest test/services/test_task.py -v`
Expected: Tümü PASS (varsayılan local backend).

- [ ] **Step 7: Commit**

```bash
git add app/services/task.py test/services/test_task.py
git commit -m "feat(worker): render çıktılarını bucket'a yükle"
```

---

### Task 3: Rerender kaynaklarını bucket'tan indir + final'i yükle

**Files:**
- Modify: `app/services/task.py` (`rerender` fonksiyonu)
- Test: `test/services/test_task.py`

**Interfaces:**
- Consumes: `sto.get_storage()`, `Storage.get`, `Storage.put`, `Storage.exists`.
- Produces: `rerender()` başında `combined-1.mp4` ve `audio.mp3` yerelde yoksa bucket'tan indirir; final başarıyla üretilince `tasks/<id>/final-1.mp4` key'ine put eder. Mevcut "kaynak yok → COMPLETE'e dön" ve "hata → COMPLETE'e dön" davranışı korunur.

- [ ] **Step 1: Failing test — rerender kaynakları indirir ve final'i yükler**

`test/services/test_task.py` içine ekle:

```python
    def test_rerender_downloads_sources_and_uploads_final(self):
        params = VideoParams(video_subject="x", video_script="c.")
        got, put = [], []

        class FakeStorage:
            def exists(self, key):
                return True
            def get(self, key, local):
                got.append(key)
                # indirme simülasyonu: hedef dosyayı oluştur
                os.makedirs(os.path.dirname(local), exist_ok=True)
                with open(local, "w") as f:
                    f.write("x")
            def put(self, local, key):
                put.append(key)

        def fake_generate(**kwargs):
            with open(kwargs["output_file"], "w") as f:
                f.write("v")

        with patch.object(tm.sto, "get_storage", return_value=FakeStorage()), \
             patch.object(tm.voice, "get_audio_duration", return_value=3.0), \
             patch.object(tm, "generate_scene_subtitle", return_value="sub.srt"), \
             patch.object(tm.video, "generate_video", side_effect=fake_generate), \
             patch.object(tm.sm.state, "update_task"):
            result = tm.rerender("rid", params)

        self.assertIn("tasks/rid/combined-1.mp4", got)
        self.assertIn("tasks/rid/audio.mp3", got)
        self.assertIn("tasks/rid/final-1.mp4", put)
        self.assertTrue(result["videos"][0].endswith("final-1.mp4"))
```

- [ ] **Step 2: Test'i çalıştır, fail görmeli**

Run: `python -m pytest test/services/test_task.py::TestTaskService::test_rerender_downloads_sources_and_uploads_final -v`
Expected: FAIL — get/put çağrıları boş.

- [ ] **Step 3: rerender()'a indirme + yükleme ekle**

`app/services/task.py` `rerender()` içinde, `combined_path`/`audio_file`/`final_path` tanımlandıktan hemen sonra, mevcut `if not (path.exists(combined_path) and path.exists(audio_file)):` kontrolünden **önce** şu bloğu ekle:

```python
    # Kaynak dosyalar bu worker'ın diskinde olmayabilir (başka makine render etti).
    # Bucket'tan indir. exists+get, LocalStorage'da da güvenli (kaynak==hedef atlanır).
    store = sto.get_storage()
    for name, local in (("combined-1.mp4", combined_path), ("audio.mp3", audio_file)):
        if not path.exists(local) and store.exists(f"tasks/{task_id}/{name}"):
            store.get(f"tasks/{task_id}/{name}", local)
```

Ardından, `os.replace(tmp_path, final_path)` satırından **sonra** (başarı yolunda, `except` bloğundan önce) final'i yükle:

```python
        os.replace(tmp_path, final_path)
        store.put(final_path, f"tasks/{task_id}/final-1.mp4")
```

- [ ] **Step 4: Test'i çalıştır, geçmeli**

Run: `python -m pytest test/services/test_task.py::TestTaskService::test_rerender_downloads_sources_and_uploads_final -v`
Expected: PASS.

- [ ] **Step 5: Regresyon**

Run: `python -m pytest test/services/test_task.py -v`
Expected: Tümü PASS.

- [ ] **Step 6: Commit**

```bash
git add app/services/task.py test/services/test_task.py
git commit -m "feat(worker): rerender kaynaklarını bucket'tan indir, final'i yükle"
```

---

### Task 4: Web storage yardımcısı (presigned URL üretimi)

**Files:**
- Create: `web/src/lib/storage/index.ts`
- Test: `web/src/lib/storage/__tests__/storage.test.ts`

**Interfaces:**
- Consumes: `process.env.STORAGE_BACKEND`, `S3_*` env.
- Produces:
  - `storageBackend(): "s3" | "local"` — env okur, varsayılan `local`.
  - `presignedGetUrl(key: string, opts?: { download?: boolean; filename?: string; ttl?: number }): Promise<string>` — S3 için imzalı URL; `download` true ise `ResponseContentDisposition=attachment; filename="..."` ekler.
  - `deleteTaskPrefix(taskId: string): Promise<void>` — `tasks/<taskId>/` altındaki tüm objeleri siler.

- [ ] **Step 1: AWS SDK bağımlılıklarını ekle**

Proje kökünden değil, `web/` içinden çalıştır:

Run: `cd web && npm install @aws-sdk/client-s3@^3.700.0 @aws-sdk/s3-request-presigner@^3.700.0`
Expected: `package.json` dependencies'e iki paket eklenir, lockfile güncellenir.

- [ ] **Step 2: Failing test yaz**

`web/src/lib/storage/__tests__/storage.test.ts` oluştur:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("storageBackend", () => {
  it("defaults to local when env unset", async () => {
    vi.stubEnv("STORAGE_BACKEND", "");
    const { storageBackend } = await import("../index");
    expect(storageBackend()).toBe("local");
  });

  it("returns s3 when configured", async () => {
    vi.stubEnv("STORAGE_BACKEND", "s3");
    const { storageBackend } = await import("../index");
    expect(storageBackend()).toBe("s3");
  });
});

describe("presignedGetUrl (s3)", () => {
  it("produces a signed url containing the key", async () => {
    vi.stubEnv("STORAGE_BACKEND", "s3");
    vi.stubEnv("S3_ENDPOINT", "https://fsn1.your-objectstorage.com");
    vi.stubEnv("S3_BUCKET", "reelate");
    vi.stubEnv("S3_REGION", "fsn1");
    vi.stubEnv("S3_ACCESS_KEY", "ak");
    vi.stubEnv("S3_SECRET_KEY", "sk");
    const { presignedGetUrl } = await import("../index");
    const url = await presignedGetUrl("tasks/abc/final-1.mp4");
    expect(url).toContain("tasks/abc/final-1.mp4");
    expect(url).toContain("X-Amz-Signature");
  });

  it("adds attachment disposition when download=true", async () => {
    vi.stubEnv("STORAGE_BACKEND", "s3");
    vi.stubEnv("S3_ENDPOINT", "https://fsn1.your-objectstorage.com");
    vi.stubEnv("S3_BUCKET", "reelate");
    vi.stubEnv("S3_REGION", "fsn1");
    vi.stubEnv("S3_ACCESS_KEY", "ak");
    vi.stubEnv("S3_SECRET_KEY", "sk");
    const { presignedGetUrl } = await import("../index");
    const url = await presignedGetUrl("tasks/abc/final-1.mp4", {
      download: true,
      filename: "reelate-abc.mp4",
    });
    expect(url).toContain("response-content-disposition");
  });
});
```

- [ ] **Step 3: Test'i çalıştır, fail görmeli**

Run: `cd web && npx vitest run src/lib/storage/__tests__/storage.test.ts`
Expected: FAIL — `Cannot find module '../index'`.

- [ ] **Step 4: storage yardımcısını yaz**

`web/src/lib/storage/index.ts` oluştur:

```typescript
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function storageBackend(): "s3" | "local" {
  return (process.env.STORAGE_BACKEND ?? "").trim().toLowerCase() === "s3"
    ? "s3"
    : "local";
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "",
      },
    });
  }
  return _client;
}

function bucket(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET is not configured");
  return b;
}

export async function presignedGetUrl(
  key: string,
  opts: { download?: boolean; filename?: string; ttl?: number } = {},
): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ...(opts.download && {
      ResponseContentDisposition: `attachment; filename="${opts.filename ?? "video.mp4"}"`,
    }),
  });
  return getSignedUrl(client(), cmd, { expiresIn: opts.ttl ?? 900 });
}

export async function deleteTaskPrefix(taskId: string): Promise<void> {
  const prefix = `tasks/${taskId}/`;
  const listed = await client().send(
    new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix }),
  );
  const objects = (listed.Contents ?? []).map((o) => ({ Key: o.Key! }));
  if (objects.length === 0) return;
  await client().send(
    new DeleteObjectsCommand({
      Bucket: bucket(),
      Delete: { Objects: objects },
    }),
  );
}
```

- [ ] **Step 5: Test'i çalıştır, geçmeli**

Run: `cd web && npx vitest run src/lib/storage/__tests__/storage.test.ts`
Expected: PASS (4 test).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/storage/index.ts web/src/lib/storage/__tests__/storage.test.ts web/package.json web/package-lock.json
git commit -m "feat(web): S3 storage yardımcısı + presigned URL"
```

---

### Task 5: Video sunumunu presigned redirect'e geçir

**Files:**
- Modify: `web/src/app/api/videos/[id]/route.ts`
- Test: `web/src/app/api/videos/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `storageBackend`, `presignedGetUrl` (Task 4).
- Produces: `STORAGE_BACKEND=s3` iken auth+sahiplik sonrası 307 redirect (Location = presigned URL). `local` iken mevcut dosya-stream davranışı korunur.

- [ ] **Step 1: Failing test yaz**

`web/src/app/api/videos/__tests__/route.test.ts` oluştur:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/storage", () => ({
  storageBackend: vi.fn(() => "s3"),
  presignedGetUrl: vi.fn(async () => "https://signed.example/final-1.mp4?X-Amz-Signature=abc"),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { presignedGetUrl } from "@/lib/storage";
import { GET } from "../[id]/route";

function mockJob(job: unknown) {
  (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    from: () => ({ where: () => Promise.resolve(job ? [job] : []) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/videos/[id] (s3)", () => {
  it("401 when unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/videos/j1"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(res.status).toBe(401);
  });

  it("404 when job belongs to another user", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockJob({ id: "j1", userId: "u2", status: "done", outputPath: "tasks/j1/final-1.mp4" });
    const res = await GET(new Request("http://x/api/videos/j1"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(res.status).toBe(404);
  });

  it("307 redirect to presigned url for owner", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockJob({ id: "j1", userId: "u1", status: "done", outputPath: "tasks/j1/final-1.mp4" });
    const res = await GET(new Request("http://x/api/videos/j1"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("X-Amz-Signature");
    expect(presignedGetUrl).toHaveBeenCalledWith(
      "tasks/j1/final-1.mp4",
      expect.objectContaining({ download: false }),
    );
  });

  it("passes download flag through", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockJob({ id: "j1", userId: "u1", status: "done", outputPath: "tasks/j1/final-1.mp4" });
    await GET(new Request("http://x/api/videos/j1?download=1"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(presignedGetUrl).toHaveBeenCalledWith(
      "tasks/j1/final-1.mp4",
      expect.objectContaining({ download: true }),
    );
  });
});
```

- [ ] **Step 2: Test'i çalıştır, fail görmeli**

Run: `cd web && npx vitest run src/app/api/videos/__tests__/route.test.ts`
Expected: FAIL — route s3 dalını bilmiyor (307 yerine 500/stream).

- [ ] **Step 3: route.ts'i güncelle**

`web/src/app/api/videos/[id]/route.ts` içinde, `if (job.status !== "done" || !job.outputPath)` kontrolünden sonra, `const storageRoot = ...` satırından **önce** S3 dalını ekle:

```typescript
  const download = new URL(request.url).searchParams.get("download") === "1";

  if (storageBackend() === "s3") {
    const url = await presignedGetUrl(job.outputPath, {
      download,
      filename: `reelate-${id}.mp4`,
    });
    return Response.redirect(url, 307);
  }
```

Import bloğuna ekle:
```typescript
import { presignedGetUrl, storageBackend } from "@/lib/storage";
```

Ayrıca aşağıdaki local dalında `const download = ...` satırı zaten yukarı taşındığı için mevcut ikinci tanımı kaldır (tekrar tanımlamayı önle).

- [ ] **Step 4: Test'i çalıştır, geçmeli**

Run: `cd web && npx vitest run src/app/api/videos/__tests__/route.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add web/src/app/api/videos/[id]/route.ts web/src/app/api/videos/__tests__/route.test.ts
git commit -m "feat(web): video sunumunu presigned redirect'e geçir (s3)"
```

---

### Task 6: Job silmede bucket prefix temizliği

**Files:**
- Modify: `web/src/app/api/jobs/[id]/route.ts`
- Test: `web/src/app/api/jobs/__tests__/delete.test.ts`

**Interfaces:**
- Consumes: `storageBackend`, `deleteTaskPrefix` (Task 4).
- Produces: DELETE handler `STORAGE_BACKEND=s3` iken `deleteTaskPrefix(id)` çağırır; local iken mevcut `rm(taskDir)` davranışı korunur.

- [ ] **Step 1: Failing test yaz**

`web/src/app/api/jobs/__tests__/delete.test.ts` oluştur:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/jobs/queue", () => ({
  enqueueSentinelKey: (id: string) => `s:${id}`,
  getRedis: () => ({ del: vi.fn() }),
}));
vi.mock("@/lib/storage", () => ({
  storageBackend: vi.fn(() => "s3"),
  deleteTaskPrefix: vi.fn(async () => {}),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { deleteTaskPrefix } from "@/lib/storage";
import { DELETE } from "../[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: () => ({
      where: () =>
        Promise.resolve([{ id: "j1", userId: "u1", status: "done" }]),
    }),
  });
  (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
    where: () => Promise.resolve(),
  });
});

describe("DELETE /api/jobs/[id] (s3)", () => {
  it("deletes the bucket prefix for the task", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    const res = await DELETE(new Request("http://x/api/jobs/j1"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(res.status).toBe(200);
    expect(deleteTaskPrefix).toHaveBeenCalledWith("j1");
  });
});
```

- [ ] **Step 2: Test'i çalıştır, fail görmeli**

Run: `cd web && npx vitest run src/app/api/jobs/__tests__/delete.test.ts`
Expected: FAIL — `deleteTaskPrefix` çağrılmıyor.

- [ ] **Step 3: route.ts DELETE'i güncelle**

`web/src/app/api/jobs/[id]/route.ts` import bloğuna ekle:
```typescript
import { deleteTaskPrefix, storageBackend } from "@/lib/storage";
```

Mevcut storage temizlik bloğunu (`const storageRoot = process.env.STORAGE_ROOT; if (storageRoot) { ... rm(taskDir) ... }`) şu şekilde sarmala — S3 ise prefix sil, değilse eski davranış:

```typescript
  if (storageBackend() === "s3") {
    try {
      await deleteTaskPrefix(id);
    } catch (e) {
      console.error("bucket prefix silme başarısız", e);
    }
  } else {
    const storageRoot = process.env.STORAGE_ROOT;
    if (storageRoot) {
      const taskDir = path.resolve(storageRoot, "tasks", id);
      if (taskDir.startsWith(path.resolve(storageRoot) + path.sep)) {
        await rm(taskDir, { recursive: true, force: true });
      }
    }
  }
```

- [ ] **Step 4: Test'i çalıştır, geçmeli**

Run: `cd web && npx vitest run src/app/api/jobs/__tests__/delete.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/api/jobs/[id]/route.ts web/src/app/api/jobs/__tests__/delete.test.ts
git commit -m "feat(web): job silmede bucket prefix temizliği (s3)"
```

---

### Task 7: outputPath yorumu + deploy config + docs

**Files:**
- Modify: `web/src/lib/jobs/status.ts:63` (yorum)
- Modify: `deploy/docker-compose.prod.yml`
- Modify: `config.example.toml`
- Modify: `deploy/RUNBOOK.md`
- Create/Modify: `deploy/.env.production.example` (varsa güncelle, yoksa ilgili satırları ekle)

**Interfaces:**
- Consumes: önceki tüm task'ların ürettiği env/config sözleşmesi (Global Constraints).
- Produces: prod stack S3 backend'iyle çalışacak şekilde yapılandırılır; web'in `reelate_storage:ro` mount'u kaldırılır.

- [ ] **Step 1: status.ts yorumunu netleştir**

`web/src/lib/jobs/status.ts` içindeki `const outputPath = \`tasks/${jobId}/final-1.mp4\`;` satırının üstüne yorum ekle:

```typescript
    // outputPath aynı zamanda bucket key'idir (tasks/<id>/final-1.mp4).
    // S3 backend'inde /api/videos bunu presigned URL üretmek için kullanır.
    const outputPath = `tasks/${jobId}/final-1.mp4`;
```

- [ ] **Step 2: config.example.toml'a storage anahtarları ekle**

`config.example.toml` içinde `[app]` bölümüne (uygun bir yere) ekle:

```toml
# Depolama backend'i: "local" (yerel disk) veya "s3" (Hetzner Object Storage / S3 uyumlu)
storage_backend = "local"
# storage_backend = "s3" iken doldurulur:
# s3_endpoint = "https://fsn1.your-objectstorage.com"
# s3_bucket = "reelate"
# s3_region = "fsn1"
# s3_access_key = ""
# s3_secret_key = ""
```

- [ ] **Step 3: prod compose'u güncelle**

`deploy/docker-compose.prod.yml`:

1. `web` servisinden `reelate_storage:/data/storage:ro` volume satırını **kaldır** (web artık dosya okumaz, presigned redirect verir).
2. `web` ve `worker` env zaten `env_file: /opt/reelate/.env.production` ile geliyor — S3 env'leri oraya eklenecek (Step 5). Ek compose değişikliği gerekmez.

- [ ] **Step 4: .env.production.example'a S3 env ekle**

`deploy/.env.production.example` dosyasına ekle (yoksa dosyayı oluştururken mevcut örnek anahtarların yanına):

```
# --- Object Storage (Hetzner) ---
STORAGE_BACKEND=s3
S3_ENDPOINT=https://fsn1.your-objectstorage.com
S3_BUCKET=reelate
S3_REGION=fsn1
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

- [ ] **Step 5: RUNBOOK'u güncelle**

`deploy/RUNBOOK.md`:

1. "İlk kurulum" adım 4'e (config.toml hazırlama) ekle: `storage_backend="s3"` ve `s3_*` anahtarlarını doldur; ayrıca Hetzner Console'dan bucket + S3 credential oluştur.
2. "Elle ölçekleme" bölümündeki `rsync` ile video taşıma adımını (mevcut 52-53) **kaldır** ve yerine not koy: "Videolar object storage'da; worker makineleri arası video taşıma gerekmez."

- [ ] **Step 6: Değişiklikleri doğrula (derleme/lint)**

Run: `cd web && npx vitest run src/lib/jobs/__tests__/status.test.ts`
Expected: PASS (yorum değişikliği davranışı bozmaz).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/jobs/status.ts deploy/docker-compose.prod.yml config.example.toml deploy/.env.production.example deploy/RUNBOOK.md
git commit -m "chore(deploy): S3 storage config + runbook + compose güncellemeleri"
```

---

### Task 8: Tam regresyon ve canlı test hazırlığı

**Files:** (yok — doğrulama task'ı)

- [ ] **Step 1: Python test suite'i tümüyle çalıştır**

Run: `python -m pytest test/ -v`
Expected: Tümü PASS (local backend varsayılan; S3 testleri moto ile).

- [ ] **Step 2: Web test suite'i tümüyle çalıştır**

Not: web testleri Postgres (`DATABASE_URL_TEST`) ve Redis gerektirir; bunlar ayakta olmalı.

Run: `cd web && npm test`
Expected: Tümü PASS.

- [ ] **Step 3: Canlı test için kullanıcıyı çağır**

Otomatik test edilemeyen uçtan uca akış (gerçek Hetzner bucket, gerçek render, tarayıcıda presigned oynatma) kullanıcı doğrulaması gerektirir. Kullanıcıya şu manuel doğrulama listesini sun ve onay bekle:

1. Hetzner Console'da bucket + S3 credential oluşturuldu, `.env.production` + `config.toml` dolduruldu.
2. `docker compose -f deploy/docker-compose.prod.yml up -d --build` ile stack ayağa kalktı.
3. Yeni video oluştur → job "done" olunca library'de oynat → 307 redirect ile bucket'tan aktığını doğrula (DevTools Network'te `your-objectstorage.com` host'u görünmeli).
4. İndir butonu → `attachment` ile iniyor.
5. Rerender (altyazı düzenle) → yeni final bucket'a yazılıp oynatılıyor.
6. Job sil → bucket'ta `tasks/<id>/` prefix'i boşaldı (Hetzner Console'dan kontrol).

- [ ] **Step 4: Commit (varsa son düzeltmeler)**

```bash
git add -A
git commit -m "test: S3 storage tam regresyon geçti"
```

---

## Self-Review Notları

- **Spec coverage:** storage katmanı (T1) ✓, worker upload (T2) ✓, rerender download/upload (T3) ✓, web presigned helper (T4) ✓, video redirect (T5) ✓, silme prefix (T6) ✓, outputPath yorumu + deploy/config/docs (T7) ✓, regresyon + canlı test (T8) ✓.
- **Backend anahtarı** her iki tarafta tutarlı: Python `storage_backend`, web `STORAGE_BACKEND`.
- **Geriye uyum:** varsayılan `local`; mevcut tüm testler dokunulmadan geçer.
- **Rerender güvenliği:** put yalnız başarı yolunda (`os.replace` sonrası); hata yolları COMPLETE'e döner, değişmez.
- **Method adları tutarlı:** `put/get/delete_prefix/presigned_get/exists` (Python) ↔ `presignedGetUrl/deleteTaskPrefix/storageBackend` (web).
