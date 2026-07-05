# Reelate — Prod Go-Live Deploy Rehberi (reelate.org)

> Bu doküman, mevcut main'i (3ef15c8: domain reelate.org'a çevrildi, tüm testler
> yeşil: web 123, motor 242) üretime uçtan uca çıkarmak için yazıldı. Yeni bir
> Claude oturumu bunu baştan sona uygulayabilir. Sunucu: `root@116.203.145.5`
> (PAYLAŞIMLI — falportal/durudroid/ilkimsuderin üretimde; yalnız `/opt/reelate/`
> ve `reelate-*` konteynerlerine dokunulur; traefik'in yalnız `dynamic/tls.yml`
> ve `certs/` dizinine EK yapılır; sorun görünce DUR).

## Mevcut durum

- Sunucuda ESKİ sürüm yayında (4b sonu, 08882af): reelate-web/db/cache/worker×2/monitor.
- main'de yeni: S3 storage katmanı, sahne bazlı 4 adımlı wizard (migration 0002),
  caption editörü + ücretsiz altyazı re-render, iş silme, yeni landing/dashboard,
  ses önizleme (Python API'ye proxy — henüz prod'da servisi YOK, adım 1'de ekleniyor),
  hoş geldin bonusu 5, showcase videoları, domain reelate.org.
- Go-live incelemesi YARIM kaldı (oturum kesildi). Tamamlanan kısım temiz çıktı:
  migration 0002 geri-uyumlu, compose'da host portu yok, delta'da secret yok.
  İncelenmemiş kalanlar (gerçek kullanıcı almadan önce koşturulması önerilir):
  hoş geldin bonusu grant noktaları (5 kredi tutarlılığı), caption editörünün
  yalnız altyazı değiştirdiğinin doğrulanması (script/scene değişikliği ücretsiz
  render'a sızmamalı), rerender rate limiter fail-closed mı, presigned URL süresi/kapsamı.

## 1. Kod tarafı: ses önizleme API servisi (tek eksik parça)

`deploy/worker.Dockerfile` — `COPY app ./app` satırından sonra ekle:

```dockerfile
COPY main.py ./
```

`deploy/docker-compose.prod.yml` — `db:` servisinden hemen önce ekle:

```yaml
  api:
    build:
      context: ..
      dockerfile: deploy/worker.Dockerfile
    container_name: reelate-api
    command: ["uv", "run", "--no-sync", "python", "main.py"]
    env_file: /opt/reelate/.env.production
    volumes:
      - /opt/reelate/config.toml:/app/config.toml:ro
    networks: [internal]
    restart: unless-stopped
    cpus: "0.5"
```

`deploy/.env.production.example`'a ekle: `PYTHON_API_URL=http://reelate-api:8080`

Doğrula + commit:
```bash
REELATE_DB_PASSWORD=dummy docker compose -f deploy/docker-compose.prod.yml config --quiet
cd web && npm test && npx tsc --noEmit && cd ..
git add deploy && git commit -m "feat(deploy): add python api service for voice preview"
```

## 2. Kodu sunucuya taşı

> **GÜNCEL (2026-07-06): Deploy artık otomatik.** `main`'e push → CI testleri
> geçerse `.github/workflows/deploy.yml` sunucudaki `/opt/reelate/deploy.sh`'i
> tetikler (git pull + `docker compose up -d --build`). Sunucuda
> `/opt/reelate/src` artık bir git clone'u; SSH deploy anahtarı forced-command
> ile sadece bu script'i çalıştırabilir (GitHub secret: `DEPLOY_SSH_KEY`).
> Migration otomatik DEĞİL — şema değişikliğinde adım 5'teki migration
> komutunu deploy'dan ÖNCE manuel çalıştır. Aşağıdaki rsync yöntemi yalnızca
> acil durum/ilk kurulum referansı olarak duruyor.

### (Eski yöntem) rsync ile

```bash
# NOT: '/storage' (kök-sabitli) — sadece kökteki runtime data dizinini hariç tutar.
# Sabitsiz 'storage' YAZMA: web/src/lib/storage kaynak dizinini de siler → Next build "@/lib/storage" bulamaz.
rsync -a --delete --exclude '.git' --exclude 'web/node_modules' --exclude 'web/.next' \
  --exclude '/storage' --exclude '.superpowers' --exclude '.venv' --exclude 'config.toml' \
  --exclude 'web/.env.local' --exclude 'web/.env' \
  /Users/furkanuzun/Documents/GitHub/MoneyPrinterTurbo/MoneyPrinterTurbo/ \
  root@116.203.145.5:/opt/reelate/src/
ssh root@116.203.145.5 "ls /opt/reelate/src/web/.env.local 2>&1"   # -> No such file olmalı
```

## 3. Sunucu env/config güncelle (secret'ları asla ekrana YAZDIRMA)

`/opt/reelate/.env.production` içinde:
- `NEXT_PUBLIC_APP_URL=https://reelate.org` yap (sed)
- Ekle: `PYTHON_API_URL=http://reelate-api:8080`
- Lokal `web/.env.local`'dan non-printing pipeline ile kopyala/güncelle:
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (şimdilik TEST anahtarları — canlıya
  geçiş operatör listesinde), `STORAGE_BACKEND`, `S3_ENDPOINT`, `S3_BUCKET`,
  `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`. Örnek kalıp:
  ```bash
  grep '^S3_ACCESS_KEY=' web/.env.local | ssh root@116.203.145.5 'cat >> /opt/reelate/.env.production'
  ```
  (Önce sunucudaki eski satırları sed ile sil ki çift olmasın.)
- `chmod 600` kalsın.

`/opt/reelate/config.toml` (worker+api): lokal `config.toml`'u scp ile gönder, sonra
sunucuda sed: `redis_host = "reelate-cache"` yap. Lokal dosyada `storage_backend`
ve `s3_*` anahtarları zaten dolu; `enable_redis=true`, `video_quality="720p"`,
`ffmpeg_preset="veryfast"` değerlerinin durduğunu `grep` ile doğrula. `chmod 600`.

> **Backend eşleşme kuralı:** web `STORAGE_BACKEND` ile worker `storage_backend`
> AYNI olmalı (ikisi de "s3"). Ayrıysa web, worker'ın yazmadığı yerden okur.

## 4. S3 cutover (backend s3'e geçiyorsa ZORUNLU ön adım)

Eski local-backend videoları bucket'ta yok; taşınmazsa eski işler 404 oynatır:
```bash
ssh root@116.203.145.5   # sunucuda, aws cli veya rclone ile:
aws s3 sync /var/lib/docker/volumes/reelate_reelate_storage/_data/tasks/ \
  s3://<bucket>/tasks/ --endpoint-url <s3_endpoint>
```
(Volume yolunu `docker volume inspect reelate_reelate_storage` ile doğrula.
Kimlik bilgilerini env ile ver, komut geçmişine yazma.)

## 5. Migration + build + başlat

```bash
ssh root@116.203.145.5
cd /opt/reelate/src
# Migration 0002 (scenes+captionStyle; geri-uyumlu, nullable):
PW=$(grep '^REELATE_DB_PASSWORD=' /opt/reelate/.env.production | cut -d= -f2)
docker run --rm --network reelate_internal -v /opt/reelate/src/web:/w -w /w node:22-alpine \
  sh -c "npm install -g npm@11.6.2 && npm ci && DATABASE_URL=postgres://reelate:${PW}@reelate-db:5432/reelate npm run db:migrate"
# Tüm servisleri yeni kodla yeniden kur (worker DEĞİŞTİ — web'le birlikte şart):
REELATE_DB_PASSWORD=$PW docker compose -f deploy/docker-compose.prod.yml up -d --build
```

## 6. Smoke (hepsi `-sk -H 'Host: reelate.org'` ile https://116.203.145.5)

- `/` → 200, title "Reelate", `grep -c 'hero'` içerik dolu
- `/signin` 200, `/use-cases/ai-tiktok-video-generator` 200, `/sitemap.xml` reelate.org URL'leri
- `/terms` ve `/privacy` 200
- Worker: `docker compose ... logs worker | tail` → "waiting for jobs"
- API: `docker exec reelate-web sh -c "wget -qO- http://reelate-api:8080/docs | grep -o '<title>[^<]*</title>'"`
  → Swagger UI title döner (uvicorn ayakta). NOT: motorda `/ping` route'u router'a bağlı DEĞİL (404);
  gerçek proxy hedefi `/api/v1/voice/preview` (boş gövdeyle 400 = route var demektir).
- Monitor: `docker logs reelate-monitor --tail 3` → "monitor redis target: reelate-cache", hata yok
- Uçtan uca video: `docker compose -f deploy/docker-compose.prod.yml exec -T worker \
  uv run --no-sync python -m worker.enqueue --subject "go-live smoke" \
  --script-file test/resources/script-60s.txt --terms "morning,coffee,sunrise"`
  → loglarda completed; S3 backend'deyse bucket'ta `tasks/<id>/final-1.mp4` oluşmalı
- Diğer siteler: `docker ps --format '{{.Names}} {{.Status}}' | grep -vE '^reelate'` → uptime'lar eski
- falportal gecikmesi render sırasında: `curl -so /dev/null -w '%{time_total}\n' https://falportal.com` ×5

## 7. Rollback

`cd /opt/reelate/src && git checkout <önceki-sha>` yerine (git yok, rsync'li kurulum):
lokalde `git checkout 08882af` yapıp adım 2'deki rsync + adım 5'teki compose up'ı tekrar
çalıştır. Migration 0002 geri alınmaz (nullable kolonlar eski kodu bozmaz).

## 8. OPERATÖR LİSTESİ (kullanıcının yapacakları — kod dışı her şey)

1. **Cloudflare DNS:** reelate.org'u Cloudflare'e ekle; A kaydı `@` ve `www` →
   `116.203.145.5`, Proxy AÇIK (turuncu bulut).
2. **TLS:** Cloudflare SSL/TLS → **Full (strict)**; Origin Server → Create
   Certificate (`reelate.org`, `*.reelate.org`) → pem+key dosyalarını bana ver
   veya sunucuda `/home/deploy/falportal/traefik/certs/reelate-origin.pem` ve
   `...-key.pem` olarak kaydet; sonra `/home/deploy/falportal/traefik/dynamic/tls.yml`'e
   iki satır EK (mevcutlara dokunma):
   `- certFile: /certs/reelate-origin.pem` / `keyFile: /certs/reelate-origin-key.pem`.
3. **Google OAuth (prod):** client'a redirect URI ekle:
   `https://reelate.org/api/auth/callback/google`; OAuth consent screen'i
   "Testing"den **"In production"a** yayınla (yoksa yalnız test kullanıcıları girebilir).
4. **Stripe canlı mod:** live secret key (tercihen kısıtlı `rk_live_...`) →
   `.env.production` `STRIPE_SECRET_KEY`; Dashboard → Webhooks → endpoint ekle:
   `https://reelate.org/api/stripe/webhook`, event: `checkout.session.completed`
   → çıkan `whsec_...` → `STRIPE_WEBHOOK_SECRET`; istenirse Stripe Tax kaydını yapıp
   `STRIPE_TAX_ENABLED=true`. Değişiklik sonrası: `docker compose ... up -d web`
   (yalnız web restart yeter, build gerekmez).
5. **Resend:** hesap aç, `reelate.org` domain'ini doğrula (DNS kayıtları),
   API key → `.env.production` `RESEND_API_KEY` + `QUEUE_ALERT_EMAIL=<senin mailin>`;
   monitor restart. (Not: monitor `alerts@reelate.org` adresinden gönderir.)
6. **Hetzner Object Storage:** bucket + S3 credential zaten oluşturulduysa (lokal
   .env.local'da dolu) ek iş yok; oluşturulmadıysa Hetzner Console → Object
   Storage → bucket `reelate` (fsn1) + S3 key üret.
7. **(Öneri) Yarım kalan go-live incelemesini tamamlat:** bonus-5 tutarlılığı,
   caption editörünün ücretsiz render kapsamı, rerender limiter fail-closed,
   presigned URL süresi. Bir sonraki oturumda "GO-LIVE.md'deki 8.7'yi koştur" demen yeterli.
8. **(Karar) GitHub repo görünürlüğü:** kod public fork'ta; private istiyorsan taşı.

## Bilinen kabul edilmiş sınırlar

- Landing statik: paket fiyatı değişirse web'i yeniden build/deploy et.
- HTTP Range yok (video seek) — Cloudflare/proxy katmanı telafi edene kadar backlog.
- Elle ölçekleme runbook'u: `deploy/RUNBOOK.md` "Elle ölçekleme" bölümü.
