# Reelate Faz 4a — Üretim Deploy + 3-lite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reelate'i mevcut Hetzner sunucusuna (paylaşımlı, Traefik önlü) CPU-limitli olarak deploy etmek; kuyruk derinliği uyarısı, kuyruk ETA göstergesi ve elle ölçekleme için worker bootstrap artefaktı eklemek.

**Architecture:** Repo'ya `deploy/` dizini eklenir: web (Next standalone) ve worker (Python+ffmpeg) Dockerfile'ları + `docker-compose.prod.yml` (reelate-web, reelate-worker ×2, reelate-db, reelate-cache; kendi iç ağı + Traefik'in `web` ağı). Web, Traefik'e label ile katılır (`Host(reelate.co)`, mevcut Cloudflare Origin cert düzeni). Worker'lar `cpus: "3.0"` toplam limitle çalışır (mevcut siteleri korur). Sunucuda `/opt/reelate` altında git checkout + `.env.production`. Monitor servisi kuyruk derinliğini izler, eşik aşımında Resend ile e-posta atar. SSE payload'una kuyruk pozisyonu/ETA eklenir.

**Tech Stack:** Docker Compose, Traefik (mevcut, dokunulmaz), Cloudflare (DNS+origin cert), Resend (uyarı e-postası), mevcut Next.js/Python stack.

## Global Constraints

- Sunucudaki MEVCUT servislere (falportal, durudroid, ilkimsuderin, traefik, postgres-prod, redis-prod...) dokunulmaz; Traefik'in yalnızca kendi dynamic/certs dosyalarına EK yapılır, traefik.yml değişmez
- Reelate konteyner adları `reelate-` önekli; portlar host'a AÇILMAZ (yalnızca Traefik `web` ağı üzerinden erişim); kendi Postgres/Redis'i (mevcut postgres-prod/redis-prod KULLANILMAZ)
- Worker toplam CPU limiti 3.0 (8 vCPU'nun %37'si); compose `deploy.resources` yerine doğrudan `cpus:` kullanılır (swarm'sız compose)
- Secrets yalnızca sunucudaki `/opt/reelate/.env.production` içinde; repoya asla girmez; `.env.production.example` commit'lenir
- Operatör girdileri (kullanıcıdan): reelate.co satın alma + Cloudflare'e ekleme + origin cert; Google OAuth prod redirect URI; Resend API key; Stripe canlı anahtarlar (4c'de). Bunlar hazır olana kadar deploy IP/host-header ile doğrulanır
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; web testleri `cd web && npm test`, motor testleri `uv run pytest test/`

---

### Task 1: Üretim imajları + compose

**Files:**
- Create: `deploy/web.Dockerfile`, `deploy/worker.Dockerfile`, `deploy/docker-compose.prod.yml`, `deploy/.env.production.example`
- Modify: `web/next.config.ts` (standalone output)

**Interfaces:**
- Produces: `docker compose -f deploy/docker-compose.prod.yml build` çalışan imajlar; servisler: `reelate-web` (3000, yalnız iç ağ + web ağı), `reelate-worker` (replicas için `worker` servisi), `reelate-db` (postgres:16, volume `reelate_pg`), `reelate-cache` (redis:7, volume `reelate_redis`, AOF açık — kuyruk kalıcı olmalı)

- [ ] **Step 1: next.config standalone**

`web/next.config.ts` içine `output: "standalone"` ekle:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

Doğrula: `cd web && npm run build` → `.next/standalone` üretilir.

- [ ] **Step 2: web.Dockerfile**

`deploy/web.Dockerfile`:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
# Build sırasında DB gerekmez; env runtime'da gelir
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: worker.Dockerfile**

`deploy/worker.Dockerfile`:

```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY app ./app
COPY worker ./worker
COPY resource ./resource
COPY config.example.toml ./
# config.toml sunucuda volume ile bağlanır (API key'ler içerir)
ENV PYTHONPATH=/app
CMD ["uv", "run", "--no-sync", "python", "-m", "worker.main"]
```

- [ ] **Step 4: compose**

`deploy/docker-compose.prod.yml`:

```yaml
# Reelate üretim stack'i. Mevcut Traefik'e dışarıdan katılır (network: web).
# Hiçbir port host'a açılmaz. Worker CPU limiti mevcut siteleri korur.
name: reelate
services:
  web:
    build:
      context: ..
      dockerfile: deploy/web.Dockerfile
    container_name: reelate-web
    env_file: /opt/reelate/.env.production
    volumes:
      - reelate_storage:/data/storage:ro
    networks: [internal, web]
    restart: unless-stopped
    labels:
      traefik.enable: "true"
      traefik.docker.network: "web"
      traefik.http.routers.reelate.rule: "Host(`reelate.co`) || Host(`www.reelate.co`)"
      traefik.http.routers.reelate.entrypoints: "websecure"
      traefik.http.routers.reelate.tls: "true"
      traefik.http.services.reelate.loadbalancer.server.port: "3000"
    depends_on: [db, cache]

  worker:
    build:
      context: ..
      dockerfile: deploy/worker.Dockerfile
    env_file: /opt/reelate/.env.production
    volumes:
      - reelate_storage:/app/storage
      - /opt/reelate/config.toml:/app/config.toml:ro
    networks: [internal]
    restart: unless-stopped
    cpus: "1.5"      # 2 replica x 1.5 = toplam 3 vCPU tavanı
    deploy:
      replicas: 2

  monitor:
    build:
      context: ..
      dockerfile: deploy/worker.Dockerfile
    command: ["uv", "run", "--no-sync", "python", "-m", "worker.monitor"]
    env_file: /opt/reelate/.env.production
    networks: [internal]
    restart: unless-stopped
    cpus: "0.2"

  db:
    image: postgres:16-alpine
    container_name: reelate-db
    environment:
      POSTGRES_USER: reelate
      POSTGRES_PASSWORD: ${REELATE_DB_PASSWORD:?set in .env.production}
      POSTGRES_DB: reelate
    env_file: /opt/reelate/.env.production
    volumes:
      - reelate_pg:/var/lib/postgresql/data
    networks: [internal]
    restart: unless-stopped

  cache:
    image: redis:7-alpine
    container_name: reelate-cache
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - reelate_redis:/data
    networks: [internal]
    restart: unless-stopped

networks:
  internal: {}
  web:
    external: true

volumes:
  reelate_pg: {}
  reelate_redis: {}
  reelate_storage: {}
```

`deploy/.env.production.example` (gerçek değerler sunucuda):

```bash
# --- web ---
DATABASE_URL=postgres://reelate:CHANGE_ME@reelate-db:5432/reelate
REDIS_URL=redis://reelate-cache:6379
AUTH_SECRET=CHANGE_ME_openssl_rand_hex_32
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_TRUST_HOST=true
NEXT_PUBLIC_APP_URL=https://reelate.co
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_TAX_ENABLED=false
STORAGE_ROOT=/data/storage
# --- worker (config.toml ayrıca: pexels key, redis_host=reelate-cache, enable_redis=true) ---
REELATE_DB_PASSWORD=CHANGE_ME
# --- monitor ---
QUEUE_ALERT_THRESHOLD=5
QUEUE_ALERT_EMAIL=
RESEND_API_KEY=
```

Not: worker `config.toml`'u sunucuda ayrı tutulur (`/opt/reelate/config.toml`) — lokaldeki config.toml'dan türetilir ama `redis_host = "reelate-cache"`, `enable_redis = true`, `video_quality = "720p"`, `ffmpeg_preset = "veryfast"` ve Pexels/OpenAI key'leri set edilir.

- [ ] **Step 5: Lokal build doğrulaması + commit**

Run: `docker compose -f deploy/docker-compose.prod.yml build` (lokalde; env_file yoksa build yine çalışır çünkü env_file runtime içindir — compose sürümü env_file'ı build'de zorunlu kılarsa geçici boş dosyayla çalıştır ve raporla)
Expected: iki imaj başarıyla build olur

```bash
git add deploy web/next.config.ts
git commit -m "feat(deploy): add production images and compose stack"
```

---

### Task 2: Kuyruk monitörü (uyarı e-postası)

**Files:**
- Create: `worker/monitor.py`
- Test: `test/worker/test_monitor.py`

**Interfaces:**
- Produces: `python -m worker.monitor` — her `MONITOR_INTERVAL_SECONDS` (varsayılan 60) içinde `LLEN reelate:queue:pending` okur; derinlik `QUEUE_ALERT_THRESHOLD` (varsayılan 5) değerini `MONITOR_STRIKES` (varsayılan 3) ardışık kontrolde aşarsa `send_alert()` çağırır; uyarı sonrası `MONITOR_COOLDOWN_SECONDS` (varsayılan 3600) susar. `send_alert(depth)` Resend HTTP API ile e-posta atar (`RESEND_API_KEY` + `QUEUE_ALERT_EMAIL`); key yoksa yalnızca hata loglar. Saf karar mantığı `should_alert(history: list[int], threshold: int, strikes: int) -> bool` olarak ayrık ve testli.

- [ ] **Step 1: Failing test**

`test/worker/test_monitor.py`:

```python
from worker.monitor import should_alert


def test_alerts_after_consecutive_strikes():
    assert should_alert([6, 7, 8], threshold=5, strikes=3) is True


def test_no_alert_below_threshold():
    assert should_alert([6, 3, 8], threshold=5, strikes=3) is False


def test_no_alert_with_short_history():
    assert should_alert([9, 9], threshold=5, strikes=3) is False


def test_threshold_is_exclusive():
    assert should_alert([5, 5, 5], threshold=5, strikes=3) is False
```

Run: `uv run pytest test/worker/test_monitor.py -v` → FAIL (modül yok)

- [ ] **Step 2: Implementasyon**

`worker/monitor.py`:

```python
"""Kuyruk derinliği monitörü (Faz 3-lite).

Bekleyen iş sayısı eşiği ardışık N kontrolde aşarsa operatöre e-posta atar
(Resend). Autoscaler gelene kadar elle ölçekleme sinyali budur.
Çalıştırma: uv run python -m worker.monitor
"""

import os
import time

import requests
from loguru import logger

from worker import queue
from worker.main import _redis_client

INTERVAL = int(os.getenv("MONITOR_INTERVAL_SECONDS", "60"))
THRESHOLD = int(os.getenv("QUEUE_ALERT_THRESHOLD", "5"))
STRIKES = int(os.getenv("MONITOR_STRIKES", "3"))
COOLDOWN = int(os.getenv("MONITOR_COOLDOWN_SECONDS", "3600"))


def should_alert(history: list[int], threshold: int, strikes: int) -> bool:
    if len(history) < strikes:
        return False
    return all(depth > threshold for depth in history[-strikes:])


def send_alert(depth: int) -> None:
    api_key = os.getenv("RESEND_API_KEY", "")
    to_email = os.getenv("QUEUE_ALERT_EMAIL", "")
    if not api_key or not to_email:
        logger.error(
            f"queue depth {depth} exceeds threshold but RESEND_API_KEY/"
            f"QUEUE_ALERT_EMAIL not configured; cannot send alert"
        )
        return
    response = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "from": "Reelate Monitor <alerts@reelate.co>",
            "to": [to_email],
            "subject": f"Reelate queue backlog: {depth} jobs waiting",
            "text": (
                f"Pending queue depth is {depth} (threshold {THRESHOLD}).\n"
                "Consider adding a worker machine (see deploy/RUNBOOK.md, "
                "'Elle ölçekleme')."
            ),
        },
        timeout=15,
    )
    if response.status_code >= 300:
        logger.error(f"alert email failed: {response.status_code} {response.text}")
    else:
        logger.info(f"alert email sent (depth {depth})")


def run() -> None:
    r = _redis_client()
    history: list[int] = []
    last_alert = 0.0
    logger.info(
        f"queue monitor started (threshold {THRESHOLD}, strikes {STRIKES}, "
        f"interval {INTERVAL}s)"
    )
    while True:
        try:
            depth = int(r.llen(queue.PENDING_KEY))
            history = (history + [depth])[-STRIKES:]
            if (
                should_alert(history, THRESHOLD, STRIKES)
                and time.time() - last_alert > COOLDOWN
            ):
                send_alert(depth)
                last_alert = time.time()
        except Exception as e:
            logger.error(f"monitor loop error: {str(e)}")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    run()
```

- [ ] **Step 3: PASS + commit**

Run: `uv run pytest test/worker/ -v` → tümü PASS

```bash
git add worker/monitor.py test/worker/test_monitor.py
git commit -m "feat(worker): add queue depth monitor with email alerts"
```

---

### Task 3: Kuyruk ETA göstergesi

**Files:**
- Modify: `web/src/lib/jobs/status.ts` (kuyruk pozisyonu/ETA yardımcıları), `web/src/app/api/jobs/[id]/events/route.ts` (payload'a ekle), `web/src/app/dashboard/jobs/[id]/progress.tsx` (queued durumunda göster)
- Test: `web/src/lib/jobs/__tests__/eta.test.ts`

**Interfaces:**
- Produces (`status.ts` ek export'ları):
  - `queueDepth(redis: Redis): Promise<number>` — `LLEN reelate:queue:pending`
  - `estimateEtaSeconds(depth: number, workers?: number): number` — `Math.ceil(depth / workers) * AVG_RENDER_SECONDS + AVG_RENDER_SECONDS`; `workers = Number(process.env.WORKER_COUNT ?? 2)`, `AVG_RENDER_SECONDS = 120`
  - SSE payload'una (yalnız `status === "queued"` iken): `queueDepth`, `etaSeconds`
  - progress.tsx queued iken: "Waiting in queue — about N min" satırı

- [ ] **Step 1: Failing test**

`web/src/lib/jobs/__tests__/eta.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { estimateEtaSeconds } from "../status";

describe("estimateEtaSeconds", () => {
  it("empty queue means one render slot", () => {
    expect(estimateEtaSeconds(0, 2)).toBe(120);
  });
  it("distributes queue across workers", () => {
    expect(estimateEtaSeconds(4, 2)).toBe(360); // ceil(4/2)*120 + 120
    expect(estimateEtaSeconds(5, 2)).toBe(480);
  });
  it("defaults workers from env or 2", () => {
    expect(estimateEtaSeconds(2)).toBe(240);
  });
});
```

Run: `cd web && npm test -- eta` → FAIL

- [ ] **Step 2: Implementasyon**

`status.ts` ekleri:

```typescript
const AVG_RENDER_SECONDS = 120;

export async function queueDepth(redis: Redis): Promise<number> {
  return redis.llen(PENDING_KEY);
}

export function estimateEtaSeconds(
  depth: number,
  workers = Number(process.env.WORKER_COUNT ?? 2),
): number {
  return Math.ceil(depth / Math.max(1, workers)) * AVG_RENDER_SECONDS + AVG_RENDER_SECONDS;
}
```

(`PENDING_KEY`'i `./queue`'dan import et.) SSE route'unda `send({...})` çağrısına, `result.job.status === "queued"` iken ek alanlar:

```typescript
          const extra =
            result.job.status === "queued"
              ? {
                  queueDepth: await queueDepth(redis),
                  etaSeconds: estimateEtaSeconds(await queueDepth(redis)),
                }
              : {};
          send({
            status: result.job.status,
            progress: result.progress,
            stage: stageForProgress(result.progress),
            error: result.job.error,
            ...extra,
          });
```

(İki kez LLEN çağırmamak için depth'i değişkene al: `const depth = await queueDepth(redis); const extra = { queueDepth: depth, etaSeconds: estimateEtaSeconds(depth) }`.)

`progress.tsx`: `JobEvent` tipine `queueDepth?: number; etaSeconds?: number;` ekle; render bölümünde, ilerleme çubuğunun üstünde:

```tsx
      {event.status === "queued" && event.etaSeconds != null && (
        <p className="mb-2 text-sm text-zinc-400">
          Waiting in queue — about {Math.max(1, Math.round(event.etaSeconds / 60))} min
        </p>
      )}
```

- [ ] **Step 3: PASS + build + commit**

Run: `cd web && npm test && npm run build` → yeşil

```bash
git add web
git commit -m "feat(web): show queue position eta while jobs wait"
```

---

### Task 4: Worker bootstrap artefaktı (elle ölçekleme)

**Files:**
- Create: `deploy/worker-cloud-init.yaml`, `deploy/RUNBOOK.md`

**Interfaces:**
- Produces: Hetzner'de yeni makine açarken user-data olarak verilecek cloud-init: docker kurar, repo'yu klonlar, `/opt/reelate/config.toml` + `.env.production`'ı ANA sunucudan kopyalamayı bekler (runbook adımı), worker imajını build edip ana makinedeki Redis/Postgres'e bağlanan 2 worker başlatır. RUNBOOK.md: elle ölçekleme (2 dk), deploy, rollback, log erişimi bölümleri.

- [ ] **Step 1: cloud-init**

`deploy/worker-cloud-init.yaml`:

```yaml
#cloud-config
# Reelate ek worker makinesi (elle ölçekleme).
# Kullanım: Hetzner Cloud -> Add Server -> CPX51 -> User data'ya bu dosya.
# Açıldıktan sonra RUNBOOK.md "Elle ölçekleme" bölümündeki 2 adımı uygula
# (secrets kopyala + compose up).
package_update: true
packages: [docker.io, docker-compose-v2, git]
write_files:
  - path: /opt/reelate-worker/docker-compose.yml
    content: |
      name: reelate-worker
      services:
        worker:
          build:
            context: /opt/reelate-worker/src
            dockerfile: deploy/worker.Dockerfile
          env_file: /opt/reelate-worker/.env.production
          volumes:
            - /opt/reelate-worker/config.toml:/app/config.toml:ro
            - reelate_worker_storage:/app/storage
          restart: unless-stopped
          deploy:
            replicas: 2
      volumes:
        reelate_worker_storage: {}
runcmd:
  - git clone https://github.com/furkanuzun/MoneyPrinterTurbo.git /opt/reelate-worker/src || true
  - systemctl enable --now docker
```

Not — bilinçli sınır: ek makinedeki worker, videoyu KENDİ diskine yazar; ana makinedeki web dosyayı bulamaz. Bu artefakt yalnızca kuyruk eritme içindir ve `config.toml`'da `redis_host` ana makinenin ÖZEL IP'sine bakar; storage senkronu (NFS/rsync) tam autoscaler işiyle birlikte çözülür. RUNBOOK bu sınırı açıkça belirtir: ek makine yalnızca `state/subtitle/audio` üretimini değil TÜM işi yaptığından, geçici çözüm olarak ek makine işleri bitince `rsync` ile ana makineye taşınır (runbook'ta tek satırlık komut). (Final review bu trade-off'u değerlendirsin.)

- [ ] **Step 2: RUNBOOK.md**

`deploy/RUNBOOK.md` — bölümler ve içerik:

```markdown
# Reelate Operasyon Runbook'u

## İlk kurulum (ana sunucu)
1. `ssh root@116.203.145.5`
2. `git clone <repo> /opt/reelate/src && cd /opt/reelate/src`
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
```

(RUNBOOK'u gerçek repo URL'i ve doğru volume yollarıyla yaz — cloud-init'teki repo URL'ini `git remote get-url origin` çıktısıyla doldur.)

- [ ] **Step 3: Commit**

```bash
git add deploy
git commit -m "feat(deploy): add worker bootstrap cloud-init and ops runbook"
```

---

### Task 5: Sunucuya ilk deploy + smoke

**Files:** yok (operasyon görevi; rapor `.superpowers/sdd/` altına). SSH: `root@116.203.145.5`

- [ ] **Step 1: Ön kontroller**

- `web` docker ağının adını doğrula: `docker network ls | grep web`
- Çakışma kontrolü: `docker ps --format '{{.Names}}' | grep -i reelate` → boş olmalı
- Disk: `df -h /` → en az 20 GB boş (imajlar + videolar için)

- [ ] **Step 2: Kurulum (RUNBOOK İlk kurulum 1-6)**

Secrets: `.env.production` değerleri — `AUTH_SECRET` yeni üret; `AUTH_GOOGLE_ID/SECRET` lokal `.env.local`'dan; `OPENAI_API_KEY` lokalden; `REELATE_DB_PASSWORD` yeni üret (`openssl rand -hex 16`); `NEXT_PUBLIC_APP_URL` şimdilik `https://reelate.co`. `config.toml` içine Pexels key lokal config.toml'dan. Hiçbir secret değeri rapora/commit'e yazılmaz.

- [ ] **Step 3: Smoke (DNS öncesi, host-header ile)**

```bash
curl -sk -H 'Host: reelate.co' https://116.203.145.5/ | grep -o '<title>[^<]*</title>'
```

Expected: `<title>Reelate — AI Short Video Generator</title>` (Cloudflare origin cert henüz yoksa traefik default cert ile `-k` gerekir — normal)

- Worker sağlığı: `docker compose -f deploy/docker-compose.prod.yml logs worker | tail -5` → "waiting for jobs"
- Uçtan uca üretim testi: `worker/enqueue.py` kalıbıyla konteyner içinden bir iş at:
  `docker compose -f deploy/docker-compose.prod.yml exec worker uv run --no-sync python -m worker.enqueue --subject "deploy smoke" --script-file test/resources/script-60s.txt --terms "morning,coffee,sunrise"` → 2-3 dk sonra storage volume'unda final-1.mp4
- Mevcut sitelere etki: render sırasında `curl -so /dev/null -w '%{time_total}' https://falportal.com` birkaç kez → belirgin bozulma yoksa CPU limiti işini yapıyor

- [ ] **Step 4: Operatör runbook adımlarını bildir**

DNS/TLS bölümü (domain + Cloudflare + origin cert + Google redirect) operatöre net liste hâlinde raporlanır; yapılana kadar site yalnız IP/host-header ile erişilir.

- [ ] **Step 5: Rapor**

Deploy çıktıları, smoke sonuçları, mevcut sitelerin etkilenme ölçümü rapora.

---

## Self-Review Notları

- **Kapsam:** deploy (Task 1,5), 3-lite'ın üç bileşeni — elle ölçekleme artefaktı (Task 4), kuyruk uyarısı (Task 2), ETA (Task 3). Spec Bölüm 11 revizyonuyla birebir.
- **Bilinçli sınırlar:** (1) Ek worker makinesi storage'ı paylaşmaz — runbook rsync geçici çözümü + tam autoscaler lansman sonrası. (2) Uyarı e-postası Resend key'i yoksa yalnızca log'a düşer (operatör girdisi bekler). (3) `WORKER_COUNT` env ile ETA hesabı statik; autoscaler gelince dinamikleşir.
- **Tip tutarlılığı:** `queueDepth/estimateEtaSeconds` status.ts'te, SSE ve progress.tsx aynı alan adlarını (`queueDepth`, `etaSeconds`) kullanıyor; monitor `queue.PENDING_KEY` sabitini paylaşıyor.
- **Güvenlik:** portlar host'a kapalı; secrets yalnız sunucu dosyasında; Traefik'e yalnız ek (mevcut yapılandırmaya dokunuş yok).
