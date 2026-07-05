# Reelate Admin Panel — admin.reelate.org

## Context

Reelate (reelate.org) prod'da; operatörün temel analitikleri (kayıt, üretim, gelir, kredi), kullanıcıları ve job kuyruğunu görebileceği, gerektiğinde manuel kredi ayarlayabileceği bir admin paneli yok. Bu plan, mevcut Next.js uygulamasının içine `admin.reelate.org` subdomain'inden erişilen, kendi kullanıcı adı/şifre girişine sahip bir admin paneli ekler. Ayrı servis/deploy hattı açılmaz.

## Kararlar (kullanıcıyla netleşti)

- Mevcut `web/` Next.js uygulaması içinde `/admin` route'ları; Traefik host kuralıyla `admin.reelate.org` aynı konteynere gider.
- **Rol kolonu YOK.** Admin, subdomain'de kullanıcı adı + şifre ile girer; ana ürünün Google OAuth/NextAuth akışına dokunulmaz.
- Kapsam: analitik dashboard + kullanıcı listesi/detayı + manuel kredi ayarlama + job izleme.

## Mimari

### 1. Admin auth (NextAuth'tan bağımsız)

- Env: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (bcrypt; hash'i lokalde üretip `.env.production`'a koyarız).
- `web/src/lib/admin/auth.ts`: şifre doğrulama (bcryptjs) + `jose` ile HS256 JWT imzalama/doğrulama (`AUTH_SECRET` kullanılır). Cookie: `admin_session`, httpOnly, secure, sameSite=lax, 7 gün.
- Login: `web/src/app/admin/login/page.tsx` (form) + server action. Basit brute-force koruması: başarısız denemede ~1sn gecikme (bcrypt zaten yavaş) — ekstra altyapı yok.
- Logout: cookie silen server action.

### 2. Host tabanlı routing (`web/src/middleware.ts` güncellemesi)

- `host === admin.reelate.org` (ve dev için `admin.localhost:3000`):
  - İstek `/admin/*` altına **rewrite** edilir (`/` → `/admin`, `/users` → `/admin/users` ...).
  - `admin_session` cookie'si geçersizse `/login`'e redirect (login sayfası hariç).
  - `x-robots-tag: noindex` header.
- Ana domainden gelen `/admin*` istekleri 404'e rewrite edilir (panel sadece subdomain'den erişilir).
- Mevcut `/dashboard` gating'i aynen korunur.

### 3. Sayfalar (`web/src/app/admin/`, server components)

Veri: mevcut Drizzle bağlantısı (`web/src/db`) ve şema (`web/src/db/schema.ts`) doğrudan kullanılır; ayrı API yok, aggregate sorgular server component/server action içinde.

- **`/admin` — Dashboard:** son 30 gün için günlük zaman serileri + özet kartlar:
  - yeni kayıt (`user`), job sayısı ve durum dağılımı + başarı oranı (`video_jobs`),
  - gelir cent toplamı (`purchases`, status=completed), harcanan kredi (`credit_ledger`, kind=spend).
  - Grafikler: hafif çözüm (Recharts). Implementasyonda `dataviz` skill'ine uyulur.
- **`/admin/users` — Kullanıcılar:** e-posta aramalı, sayfalı tablo: e-posta, ad, kayıt tarihi, kredi bakiyesi (`sum(credit_ledger.delta)`), job sayısı, toplam ödeme.
- **`/admin/users/[id]` — Kullanıcı detayı:** profil + kredi geçmişi + job listesi + satın almalar; **kredi ayarlama formu** (miktar ±, not).
- **`/admin/jobs` — Job izleme:** son job'lar (durum, kullanıcı e-postası, subject, süre, hata mesajı, created/updated), durum filtresi (özellikle failed/queued).

### 4. DB değişikliği (tek migration)

- `credit_ledger.kind` enum'ına `admin_adjustment` değeri eklenir (drizzle migration). Kredi ayarlama bu kind ile ledger'a satır ekler — mevcut bakiye hesabı (`web/src/lib/credits/ledger.ts`) otomatik doğru çalışır.

### 5. Deploy

1. Cloudflare: `admin` A kaydı → `116.203.145.5`, proxy açık.
2. `deploy/docker-compose.prod.yml`: `reelate-web` Traefik router kuralı `Host(\`reelate.org\`) || Host(\`www.reelate.org\`) || Host(\`admin.reelate.org\`)` olacak şekilde güncellenir. (Origin cert `*.reelate.org`'u zaten kapsıyor; NextAuth `AUTH_URL` sabit reelate.org kaldığı için OAuth etkilenmez.)
3. `.env.production`'a `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` eklenir.
4. Normal akış: rsync → `docker compose up -d --build` → `npm run db:migrate` (RUNBOOK'taki mevcut prosedür).

## Değişecek/eklenecek dosyalar

- `web/src/middleware.ts` — host tabanlı rewrite + admin cookie kontrolü (mevcut dosya güncellenir)
- `web/src/lib/admin/auth.ts` — yeni: şifre doğrulama + JWT cookie yardımcıları
- `web/src/app/admin/login/page.tsx` + login/logout server action'ları — yeni
- `web/src/app/admin/{page,users/page,users/[id]/page,jobs/page}.tsx` + layout — yeni
- `web/src/lib/admin/queries.ts` — yeni: aggregate sorgular
- `web/src/db/schema.ts` + yeni drizzle migration — `admin_adjustment` kind
- `deploy/docker-compose.prod.yml` — Traefik host kuralı
- `web/package.json` — `bcryptjs` (+ `jose` yoksa) ve Recharts

## Verification

- **Lokal:** `/etc/hosts`'a `127.0.0.1 admin.localhost` gerekmez — middleware `admin.localhost:3000` host'unu tanır; `npm run dev` ile `http://admin.localhost:3000` açılır: login → dashboard/users/jobs gezilir; yanlış şifre reddi, cookie'siz erişimin login'e düşmesi, ana `localhost:3000/admin`'in 404 olması test edilir.
- Kredi ayarlama: bir test kullanıcısına +5 kredi verilip dashboard'daki bakiyenin ve `credit_ledger` satırının doğrulanması.
- Mevcut testler/build: `npm run build` + varsa test suite.
- **Prod sonrası:** `https://admin.reelate.org` login akışı, `https://reelate.org/admin` → 404, Google OAuth girişinin hâlâ çalıştığı smoke test.

## Not (implementasyon süreci)

Onay sonrası superpowers akışı devam eder: spec `docs/superpowers/specs/2026-07-05-admin-panel-design.md` olarak commit edilir, ardından writing-plans → TDD ile implementasyon.
