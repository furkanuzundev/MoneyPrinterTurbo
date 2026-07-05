# Hetzner Object Storage ile Video Depolama — Tasarım

**Tarih:** 2026-07-05
**Durum:** Onaylandı, implementasyon planı bekliyor

## Amaç

Render edilen videoları paylaşımlı Docker volume yerine **Hetzner Object Storage
(S3 uyumlu)** bucket'ta saklamak. Bu, worker'ları çok makineye ölçeklerken elle
`rsync` ihtiyacını kaldırır (bkz. `deploy/RUNBOOK.md` adım 42-54) ve web sunucusunu
video trafiğinden kurtarır.

## Mevcut Durum

- Worker `storage/tasks/<task_id>/final-1.mp4` üretir → paylaşımlı Docker volume
  (`reelate_storage`) üzerinden web dosyayı okuyup stream eder
  (`web/src/app/api/videos/[id]/route.ts`).
- Bu tek-makine varsayımına bağlıdır. Worker başka makineye ölçeklenince videolar
  orada kalır, elle taşınması gerekir.
- `outputPath` şu an web tarafında `tasks/${jobId}/final-1.mp4` diye **tahminle**
  kurulur (`web/src/lib/jobs/status.ts:63`), worker'dan gelen gerçek yol değil.
- Rerender, ara dosyalara (`combined-1.mp4`, `audio.mp3`) bağımlıdır
  (`app/services/task.py` `rerender()`).

## Mimari Kararlar (best-practice, sabitlendi)

| Konu | Karar |
|------|-------|
| Bucket erişimi | **Private.** Public erişim yok. |
| Kullanıcıya sunum | **Presigned URL + 307 redirect.** Web auth'u kontrol eder, 15 dk ömürlü imzalı GET URL üretir, kullanıcıyı doğrudan bucket'a yönlendirir. Video trafiği web'e uğramaz. |
| Yükleme | Worker render bitince S3'e yükler (`boto3`). Yerel dosya başarı sonrası silinir. |
| Ara dosyalar | `combined-1.mp4` + `audio.mp3` da bucket'a yüklenir — rerender bunlara ihtiyaç duyar ve ayrı worker'da çalışabilir. Rerender öncesi bunlar bucket'tan indirilir. |
| Atomiklik | Rerender'da `final-1.mp4` doğrudan üzerine PUT edilir (S3 PUT atomiktir; yerel `tmp→rename` dansına gerek kalmaz). |
| Kimlik/gizlilik | S3 credential'ları config/env'de; bucket anahtarları `tasks/<task_id>/...` prefix'iyle. |
| Geriye dönük uyum | Env ile anahtarlı: `STORAGE_BACKEND=s3` yoksa mevcut yerel-dosya davranışı korunur. |
| Silme | Job silinince web, bucket'taki `tasks/<id>/` prefix'ini toplu siler. |

## Bileşenler

### 1. Python storage soyutlama katmanı — `app/services/storage.py` (yeni)

Tek arayüz, iki implementasyon:

```
put(local_path, key)        # yerel dosyayı bucket'a yükle
get(key, local_path)        # bucket'tan yerel'e indir (rerender için)
delete_prefix(prefix)       # tasks/<id>/ toplu sil
presigned_get(key, ttl)     # imzalı indirme URL'i
exists(key)
```

- `LocalStorage` (mevcut davranış) ve `S3Storage` (`boto3`, Hetzner endpoint).
- Backend seçimi `config.toml`/env'den: `storage_backend`, `s3_endpoint`,
  `s3_bucket`, `s3_region`, `s3_access_key`, `s3_secret_key`.
- **Bağımlılık:** `boto3` → `requirements.txt`.

### 2. Worker/task entegrasyonu — `app/services/task.py`

- `start()`: `final-<i>.mp4`, `combined-1.mp4`, `audio.mp3` render sonrası
  `storage.put(...)` ile yüklenir; başarıda yerel task dizini temizlenir.
- `rerender()`: başında `combined-1.mp4` + `audio.mp3` `storage.get(...)` ile
  indirilir (yoksa mevcut davranış korunur: "kaynak yok → complete'e dön"),
  render sonrası `final-1.mp4` bucket'a `put` edilir. Mevcut "hata → COMPLETE'e
  geri dön, FAILED yazma" güvenlik mantığı **aynen** korunur.

### 3. outputPath'in gerçekleşmesi — `web/src/lib/jobs/status.ts`

- `outputPath` string'i `tasks/${jobId}/final-1.mp4` olarak aynı kalır ama artık
  **bucket key** anlamı taşır (yerel yol değil). Yorumla netleştirilir.

### 4. Video sunumu — `web/src/app/api/videos/[id]/route.ts` (değişir)

- Auth + sahiplik kontrolü **aynen** kalır.
- `STORAGE_BACKEND=s3` ise: okuma/stream yerine → presigned URL üretilip
  **307 redirect** döner. `?download=1` ise imzaya
  `response-content-disposition=attachment` eklenir.
- `STORAGE_BACKEND` local ise: mevcut `createReadStream` yolu korunur.
- **Bağımlılık:** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` →
  `web/package.json`.

### 5. Job silme — `web/src/app/api/jobs/[id]/route.ts` (değişir)

- Yerel `rm(taskDir)` yerine (S3 backend'de) bucket prefix'i `tasks/<id>/`
  toplu silinir.

### 6. Prod compose — `deploy/docker-compose.prod.yml`

- `reelate_storage` volume'u worker'da **ara/geçici alan** olarak kalır (render
  sırasında lokal disk şart), ama artık paylaşımlı kalıcı depo değil.
- Web'in `reelate_storage:ro` mount'una **gerek kalmaz** → kaldırılır.
- Yeni env'ler `.env.production`'a: `STORAGE_BACKEND=s3`, `S3_ENDPOINT`,
  `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`.
- Runbook'taki elle `rsync` adımı (42-54) kaldırılır.

## Veri Akışı

**Render:** Worker → `final-1.mp4`+`combined-1.mp4`+`audio.mp3` üretir →
`storage.put` (bucket) → yerel temizlik → DB `outputPath` = `tasks/<id>/final-1.mp4`.

**İzleme:** Kullanıcı → web `/api/videos/[id]` → auth+sahiplik ✓ → presigned URL →
**307** → tarayıcı doğrudan bucket'tan stream eder.

**Rerender:** web enqueue → worker `combined-1.mp4`+`audio.mp3` indirir → yeni
altyazıyla render → `final-1.mp4` bucket'a PUT (overwrite) → DB sync.

**Silme:** web → `delete_prefix(tasks/<id>/)` bucket + DB row + Redis anahtarları.

## Hata Yönetimi

- S3 `put` başarısız → render FAILED sayılır (mevcut retry mantığı devreye girer);
  yerel dosya **silinmez** (retry kaynağı).
- Rerender `get` başarısız (kaynak yok) → mevcut "kaynak yok → eski video kalsın,
  COMPLETE" davranışı korunur.
- Presigned üretimi başarısız → web 500, video akmaz ama veri güvende.
- Backend env eksik/yanlış → web `/api/videos` 500 "Storage not configured"
  (mevcut kalıp).

## Test

- `app/services/storage.py`: `LocalStorage` ve `S3Storage` birim testleri
  (S3 için `moto` ile mock'lanmış bucket).
- `task.py`: put/get çağrılarının doğru anahtarlarla yapıldığı; rerender
  kaynak-indirme akışı.
- Web: `/api/videos/[id]` presigned-redirect testi (auth reddi, sahiplik reddi,
  307 + imzalı URL), silme prefix testi.
- Mevcut testler local backend'de yeşil kalmalı (regresyon yok).

## Kapsam Dışı (YAGNI)

- CDN/Cloudflare önbellekleme (sonradan presigned yerine imzalı CDN URL'e geçilebilir).
- Multipart upload (tek video dosyaları küçük; gerekmez).
- Otomatik yaşam döngüsü/arşivleme politikaları.
- Tam autoscaler (ayrı iş; bu tasarım onun önünü açar).
