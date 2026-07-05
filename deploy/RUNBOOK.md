# Reelate Operasyon Runbook'u

## İlk kurulum (ana sunucu)

1. `ssh root@116.203.145.5`
2. `git clone https://github.com/furkanuzundev/MoneyPrinterTurbo.git /opt/reelate/src && cd /opt/reelate/src`
3. `cp deploy/.env.production.example /opt/reelate/.env.production` → değerleri doldur
   (AUTH_SECRET: `openssl rand -hex 32`; DATABASE_URL şifresi = REELATE_DB_PASSWORD)
4. `config.toml` hazırla: lokal config.toml'dan kopyala; `enable_redis=true`,
   `redis_host="reelate-cache"`, `video_quality="720p"`, `ffmpeg_preset="veryfast"`
   → `/opt/reelate/config.toml`
   S3 backend için ayrıca: `storage_backend="s3"` ve `s3_endpoint`, `s3_bucket`,
   `s3_region`, `s3_access_key`, `s3_secret_key` anahtarlarını doldur — önce
   Hetzner Console'da bucket + S3 credential (access/secret key) oluştur.

   > **S3'e geçiş (cutover) notu:** Eğer daha önce local backend'de video üretildiyse,
   > bu dosyalar bucket'ta YOKTUR; s3'e geçtikten sonra eski işlerin videoları
   > oynatılamaz (web var olmayan bucket key'ini presign eder, 404). Geçişten ÖNCE
   > mevcut videoları bucket'a bir kez taşı:
   > `aws s3 sync /opt/reelate/storage/tasks/ s3://<bucket>/tasks/ --endpoint-url <s3_endpoint>`
   > (veya rclone). Bu adım atlanırsa yalnızca geçiş sonrası üretilen videolar oynatılır.
5. `docker compose -f deploy/docker-compose.prod.yml up -d --build`
6. Migration: `docker compose -f deploy/docker-compose.prod.yml exec web sh -c "npx drizzle-kit migrate"`
   çalışmazsa (standalone imajda drizzle-kit yok): migration'ı host'tan çalıştır:
   `cd /opt/reelate/src/web && DATABASE_URL=postgres://reelate:...@localhost:5432/reelate npm run db:migrate`
   — ancak reelate-db portu host'a kapalı; bu yüzden tercih edilen yol:
   `docker run --rm --network reelate_internal -v /opt/reelate/src/web:/w -w /w node:22-alpine sh -c "npm install -g npm@11.6.2 && npm ci && DATABASE_URL=postgres://reelate:<pw>@reelate-db:5432/reelate npm run db:migrate"`
   (npm pin gerekli: bare node:22-alpine'ın bundle npm'i (10.9.8) ve npm>=11.7.0,
   lockfile'daki `@tailwindcss/oxide-wasm32-wasi` optional bundleDependencies'i
   yanlış "Missing from lock file" hatasıyla reddediyor — aynı bug web.Dockerfile'da
   npm@11.6.2 pin'iyle atlatılıyor, migration komutu da aynı pin'i kullanmalı.)
7. Smoke: `curl -H 'Host: reelate.org' -k https://127.0.0.1/` → Reelate landing HTML

## DNS + TLS (operatör)

1. reelate.org'yu satın al, Cloudflare'e ekle (ücretsiz plan)
2. DNS: A kaydı `@` ve `www` → 116.203.145.5, Proxy AÇIK (turuncu bulut)
3. Cloudflare SSL/TLS → Full (strict); Origin Server → Create Certificate
   (reelate.org, *.reelate.org) → pem+key'i sunucuda
   `/home/deploy/falportal/traefik/certs/reelate-origin.pem|-key.pem` olarak kaydet
4. `/home/deploy/falportal/traefik/dynamic/tls.yml`'e EK (mevcut girdilere dokunma):
   `- certFile: /certs/reelate-origin.pem` / `keyFile: /certs/reelate-origin-key.pem`
   (dynamic dizini watch'lı; traefik restart gerekmez)
5. Google OAuth client'a prod redirect ekle:
   `https://reelate.org/api/auth/callback/google`

## Güncelleme deploy'u

`cd /opt/reelate/src && git pull && docker compose -f deploy/docker-compose.prod.yml up -d --build`
(migration varsa İlk kurulum 6. adımı tekrar)

## Elle ölçekleme (kuyruk uyarısı gelince, ~2 dk)

1. Hetzner Cloud → Add Server → CPX51 → user-data: `deploy/worker-cloud-init.yaml`
   (aynı private network'e ekle veya public IP kullan)
2. Cloud-init durumunu doğrula: `ssh root@<yeni-ip> "cloud-init status --wait && test -d /opt/reelate-worker/src/deploy && echo CLONE-OK"`
   — CLONE-OK görünmüyorsa makineyi sil ve adım 1'i tekrarla
3. Makine açılınca: ana sunucudan
   `scp /opt/reelate/.env.production /opt/reelate/config.toml root@<yeni-ip>:/opt/reelate-worker/`
   — config.toml'daki `redis_host`'u ana makinenin IP'sine çevir; sonra yeni makinede
   `cd /opt/reelate-worker && docker compose up -d --build`
3. Kuyruk boşalınca: yeni makinede işlerin bittiğini bekle, sonra makineyi sil.
   Videolar object storage'da (S3/Hetzner bucket) tutulduğu için worker
   makineleri arası video taşıma (rsync vb.) gerekmez. (Sınır: tam autoscaler
   lansman sonrası.)

## Loglar

- Web: `docker logs -f reelate-web`
- Worker: `docker compose -f deploy/docker-compose.prod.yml logs -f worker`
- Monitor: `docker logs -f reelate-monitor` (uyarılar burada da görünür)

## Rollback

`cd /opt/reelate/src && git checkout <önceki-tag/sha> && docker compose -f deploy/docker-compose.prod.yml up -d --build`

## Admin panel (admin.reelate.org)

Admin paneli ayrı bir servis DEĞİLDİR; `reelate-web` konteynerinin içindedir.
Middleware, `admin.reelate.org` host'unu `/admin/*` route'larına yönlendirir.

### İlk kurulum (bir kez)

1. Cloudflare DNS: `admin` A kaydı → `116.203.145.5`, proxy AÇIK.
   (Origin cert `*.reelate.org`'u kapsıyor; Traefik tarafında ek TLS işi yok.)
2. Şifre hash'i üret (lokalde):
   `cd web && node scripts/admin-password-hash.mjs '<güçlü-şifre>'`
3. Sunucuda `/opt/reelate/.env.production` dosyasına ekle:
   ```
   ADMIN_USERNAME=<kullanıcı-adı>
   ADMIN_PASSWORD_HASH=<script çıktısı>
   ```
4. Admin panel kodu `main` branch'ine merge edilince, GitHub Actions workflow otomatik olarak tetiklenir (CI yeşil olunca `/opt/reelate/deploy.sh` çalıştırılır: `cd /opt/reelate/src && git pull && docker compose -f deploy/docker-compose.prod.yml up -d --build`). Migration çalıştırılması gerekiyorsa (0003 migration'ı `user.created_at`, `credit_ledger.note` kolonlarını ekler ve created_at backfill yapar), sunucuda İlk kurulum 6. adımındaki komutun aynısını çalıştır:
   `docker run --rm --network reelate_internal -v /opt/reelate/src/web:/w -w /w node:22-alpine sh -c "npm install -g npm@11.6.2 && npm ci && DATABASE_URL=postgres://reelate:<pw>@reelate-db:5432/reelate npm run db:migrate"`

### Smoke test

- `https://admin.reelate.org` → login sayfası; doğru bilgilerle giriş → dashboard.
- `https://reelate.org/admin` → 404.
- `https://reelate.org` Google girişi etkilenmemiş olmalı.

### Notlar

- Admin oturumu: `admin_session` httpOnly cookie (7 gün, AUTH_SECRET ile imzalı JWT).
- Şifre değişikliği: yeni hash üret, env'i güncelle, `docker compose up -d web`.
- Kredi düzeltmeleri `credit_ledger`'a `kind='admin_adjustment'` satırı olarak yazılır (not alanıyla).
