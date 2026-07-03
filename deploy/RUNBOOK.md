# Reelate Operasyon Runbook'u

## İlk kurulum (ana sunucu)

1. `ssh root@116.203.145.5`
2. `git clone https://github.com/furkanuzundev/MoneyPrinterTurbo.git /opt/reelate/src && cd /opt/reelate/src`
3. `cp deploy/.env.production.example /opt/reelate/.env.production` → değerleri doldur
   (AUTH_SECRET: `openssl rand -hex 32`; DATABASE_URL şifresi = REELATE_DB_PASSWORD)
4. `config.toml` hazırla: lokal config.toml'dan kopyala; `enable_redis=true`,
   `redis_host="reelate-cache"`, `video_quality="720p"`, `ffmpeg_preset="veryfast"`
   → `/opt/reelate/config.toml`
5. `docker compose -f deploy/docker-compose.prod.yml up -d --build`
6. Migration: `docker compose -f deploy/docker-compose.prod.yml exec web sh -c "npx drizzle-kit migrate"`
   çalışmazsa (standalone imajda drizzle-kit yok): migration'ı host'tan çalıştır:
   `cd /opt/reelate/src/web && DATABASE_URL=postgres://reelate:...@localhost:5432/reelate npm run db:migrate`
   — ancak reelate-db portu host'a kapalı; bu yüzden tercih edilen yol:
   `docker run --rm --network reelate_internal -v /opt/reelate/src/web:/w -w /w node:22-alpine sh -c "npm ci && DATABASE_URL=postgres://reelate:<pw>@reelate-db:5432/reelate npm run db:migrate"`
7. Smoke: `curl -H 'Host: reelate.co' -k https://127.0.0.1/` → Reelate landing HTML

## DNS + TLS (operatör)

1. reelate.co'yu satın al, Cloudflare'e ekle (ücretsiz plan)
2. DNS: A kaydı `@` ve `www` → 116.203.145.5, Proxy AÇIK (turuncu bulut)
3. Cloudflare SSL/TLS → Full (strict); Origin Server → Create Certificate
   (reelate.co, *.reelate.co) → pem+key'i sunucuda
   `/home/deploy/falportal/traefik/certs/reelate-origin.pem|-key.pem` olarak kaydet
4. `/home/deploy/falportal/traefik/dynamic/tls.yml`'e EK (mevcut girdilere dokunma):
   `- certFile: /certs/reelate-origin.pem` / `keyFile: /certs/reelate-origin-key.pem`
   (dynamic dizini watch'lı; traefik restart gerekmez)
5. Google OAuth client'a prod redirect ekle:
   `https://reelate.co/api/auth/callback/google`

## Güncelleme deploy'u

`cd /opt/reelate/src && git pull && docker compose -f deploy/docker-compose.prod.yml up -d --build`
(migration varsa İlk kurulum 6. adımı tekrar)

## Elle ölçekleme (kuyruk uyarısı gelince, ~2 dk)

1. Hetzner Cloud → Add Server → CPX51 → user-data: `deploy/worker-cloud-init.yaml`
   (aynı private network'e ekle veya public IP kullan)
2. Makine açılınca: ana sunucudan
   `scp /opt/reelate/.env.production /opt/reelate/config.toml root@<yeni-ip>:/opt/reelate-worker/`
   — config.toml'daki `redis_host`'u ana makinenin IP'sine çevir; sonra yeni makinede
   `cd /opt/reelate-worker && docker compose up -d --build`
3. Kuyruk boşalınca: yeni makinede işlerin bittiğini bekle, videoları taşı:
   `rsync -a root@<yeni-ip>:/var/lib/docker/volumes/reelate-worker_reelate_worker_storage/_data/tasks/ <ana>/opt/reelate/storage/tasks/`
   sonra makineyi sil. (Sınır: tam autoscaler + paylaşımlı storage lansman sonrası.)

## Loglar

- Web: `docker logs -f reelate-web`
- Worker: `docker compose -f deploy/docker-compose.prod.yml logs -f worker`
- Monitor: `docker logs -f reelate-monitor` (uyarılar burada da görünür)

## Rollback

`cd /opt/reelate/src && git checkout <önceki-tag/sha> && docker compose -f deploy/docker-compose.prod.yml up -d --build`
