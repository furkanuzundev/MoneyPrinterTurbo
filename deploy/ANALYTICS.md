# Google Analytics 4 — Kurulum Rehberi

Kod hazır ve `GA_MEASUREMENT_ID` boşken **hiçbir şey yüklemez**; bu yüzden
kurulumdan önce deploy etmek güvenli. Tasarım: `docs/superpowers/specs/2026-09-16-google-analytics-design.md`.

## Neler ölçülüyor

| Olay | Nereden | Not |
|---|---|---|
| `page_view` | Otomatik (enhanced measurement) | SPA geçişleri dahil |
| `cta_click` | `/signin`'e giden her link | `cta_text`, `cta_href`, `page_path` |
| `sign_up` | Yeni hesabın ilk dashboard yüklemesi | `method=google` |
| `video_generate` | Video işi başarıyla kuyruğa girdi | `aspect`, `target_seconds`, `voice` |
| `credits_insufficient` | Kredi yetmedi (402) | |
| `video_download` | MP4 indir | `location` = `job_done` / `library` |
| `video_rate` | Yıldız verildi | `rating`, `location` |
| `caption_rerender` | Altyazı yeniden render | |
| `begin_checkout` | Paket satın al butonu | `value`, `currency`, `items` |
| `purchase` | **Sunucu** — Stripe webhook → Measurement Protocol | `transaction_id` = Stripe session id |

Ayrıca: giriş yapmış kullanıcıda `user_id` (dahili UUID, PII değil).
Admin host (`admin.reelate.org`) ve localhost hiç ölçülmez.

**Onay (Consent Mode v2):** Her ziyaretçi "denied" başlar; banner'da Accept →
`analytics_storage=granted`. Reject/yanıtsız → çerez yok, Google'a yalnızca
çerezsiz, tanımlayıcısız sınırlı ping gider (Google bunlarla modelleme yapar; user_id eklenmez). Reklam sinyalleri
(`ad_*`) hep denied. Kullanıcı footer/yasal sayfalardaki "Cookie settings" ile
kararını değiştirebilir; reddedince `_ga` çerezleri silinir.

**purchase yalnızca onay verenler için gider** (onaysız kullanıcının kalıcı
client id'si yok). Bu yüzden GA'daki gelir < gerçek gelir; kesin rakam admin
panelinde.

**purchase `value` vergisizdir** (`amount_total - amount_tax`), vergi ayrı `tax`
parametresinde. `STRIPE_TAX_ENABLED=true` yapılırsa Stripe'ta vergi davranışının
*exclusive* olduğundan emin ol; *inclusive* ise GA'daki purchase değeri
begin_checkout değerinden düşük görünür. Webhook, GA isteğini yanıt döndükten
sonra (`after()`) gönderir; Stripe'ın 200'ü GA'yı beklemez.

---

## 1. GA4 property oluştur (analytics.google.com)

1. Admin → **Create → Property**
   - Property name: `Reelate`
   - Reporting time zone: **Türkiye** (veya tercihin), Currency: **US Dollar (USD)** — Stripe USD tahsil ediyor.
2. Business details / objectives: istediğini seç (etkisi yok).
3. **Data collection → Web** stream:
   - Website URL: `https://reelate.org`, Stream name: `reelate.org`
   - **Enhanced measurement: AÇIK** bırak. Dişli simgesinden:
     - "Page changes based on browser history events" **açık** olmalı (SPA page_view'ları buna bağlı).
     - "Form interactions" → **kapat** (Next.js formlarında gürültü üretir).
4. Oluşan **Measurement ID**'yi (`G-XXXXXXXXXX`) kopyala.

## 2. Measurement ID'yi koda gir

`web/src/lib/analytics/config.ts`:

```ts
const PRODUCTION_MEASUREMENT_ID = "G-XXXXXXXXXX";
```

Commit + push → auto-deploy. (ID herkese açık bir değerdir, sır değil.)
İstersen ID'yi Claude'a ver, o commit'lesin.

## 3. Measurement Protocol API secret (server-side purchase)

1. Admin → Data streams → `reelate.org` → **Measurement Protocol API secrets** → Create
   (önce kullanım şartlarını kabul etmen istenebilir). Nickname: `stripe-webhook`.
2. Sunucuda:

   ```bash
   ssh root@116.203.145.5
   cp /opt/reelate/.env.production /opt/reelate/.env.production.bak-$(date +%Y%m%d%H%M)
   echo 'GA_API_SECRET=<secret>' >> /opt/reelate/.env.production
   cd /opt/reelate/src && docker compose -f deploy/docker-compose.prod.yml up -d --no-deps --no-build web
   ```

   (`--no-deps` önemli: yoksa DB container'ı da yeniden başlatılır.)

## 4. GA admin ayarları (hepsi Admin altında)

1. **Unwanted referrals** — Data streams → `reelate.org` → Configure tag settings →
   Show more → **List unwanted referrals**, "Referral domain contains":
   - `checkout.stripe.com`
   - `stripe.com`
   - `accounts.google.com`

   *Bu yapılmazsa her satın alma "stripe.com referral"a, her kayıt
   "accounts.google.com"a atfedilir ve kanal raporları çöp olur.*
2. **Key events** — Data display → Events (olaylar ilk geldikten sonra listede
   görünür; beklemeden Key events → New key event ile adı yazarak da eklenebilir):
   `sign_up`, `video_generate`, `purchase` (purchase genelde otomatik key event).
3. **Data retention** — Data collection and modification → Data retention →
   Event data retention: **14 months**.
4. **Google signals** — Data collection → **kapalı** bırak (reklam kullanmıyoruz,
   gizlilik metni de böyle söylüyor).
5. **Custom definitions** — Data display → Custom definitions → Create custom dimension
   (Scope: Event), raporlarda parametreleri görmek için:
   | Dimension name | Event parameter |
   |---|---|
   | Aspect | `aspect` |
   | Voice | `voice` |
   | Target seconds | `target_seconds` |
   | Location | `location` |
   | Rating | `rating` |
   | CTA text | `cta_text` |
6. **Internal traffic** — Data streams → Configure tag settings → Define internal
   traffic → kendi IP'n (`traffic_type=internal`). Sonra Data filters →
   "Internal Traffic" filtresini **Testing**'den **Active**'e al (birkaç gün
   Testing'de bekletip doğrulamak iyi pratik).
7. **Data Processing Terms** — Account settings → "Data Processing Amendment"
   kabul et (GDPR/KVKK için gerekli).
8. (Opsiyonel) **Search Console bağlantısı** — Product links → Search Console.

## 5. Doğrulama

1. Deploy sonrası gizli pencerede `https://reelate.org` → banner görünmeli.
2. **Realtime** raporu: Accept'e bas, birkaç sayfa gez → kullanıcı ve `page_view` görünmeli.
3. **Consent kontrolü:** Data streams → `reelate.org` → "Consent settings" bölümünde
   analytics consent sinyali "active" görünmeli (24–48 saat sürebilir).
4. **Tag Assistant** (tagassistant.google.com) → `https://reelate.org` → olay
   parametreleri ve consent durumu adım adım görünür; ayrıca **DebugView** buradan beslenir.
5. **purchase uçtan uca:** Accept verilmiş bir tarayıcıyla küçük bir paket al (veya
   Stripe test modu). Web container logunda hata olmamalı:
   `docker logs reelate-web 2>&1 | grep "ga purchase"` → çıktı **boş** olmalı
   (yalnızca hata loglanır). Birkaç dakika içinde Realtime'da `purchase` görünür;
   Monetization raporlarına düşmesi 24–48 saat sürebilir.
6. **API secret'ı doğrulama (opsiyonel):** debug endpoint'i payload'ı doğrular, veriyi kaydetmez:

   ```bash
   curl -s "https://www.google-analytics.com/debug/mp/collect?measurement_id=G-XXXXXXXXXX&api_secret=<secret>" \
     -H 'Content-Type: application/json' \
     -d '{"client_id":"123.456","events":[{"name":"purchase","params":{"transaction_id":"test","currency":"USD","value":1}}]}'
   ```

   `{"validationMessages":[]}` → payload geçerli.

## Yerel geliştirme

`web/.env.local` içine `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-...` eklersen GA
localhost'ta da yüklenir ve `debug_mode` açılır (DebugView'da görünür). Prod
property'yi kirletmemek için ayrı bir test property'si kullan. Env değişince
dev server'ı yeniden başlat.

## Kod haritası

- `web/src/lib/analytics/config.ts` — ID, host filtresi
- `web/src/lib/analytics/gtag.ts` — bootstrap, consent, `track()`, `getGaIds()`
- `web/src/lib/analytics/measurement-protocol.ts` — server-side purchase
- `web/src/components/analytics/` — `<Analytics />`, banner, cookie settings, dashboard user_id/sign_up
- `web/src/lib/credits/stripe-events.ts` — webhook → purchase (yalnızca ilk teslimatta, asla throw etmez)
