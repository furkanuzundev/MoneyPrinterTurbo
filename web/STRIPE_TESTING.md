# Stripe — Test Ortamı Runbook'u

Bu doküman, Reelate kredi satın-alma akışını **Stripe test modunda** uçtan uca
çalıştırıp doğrulamak içindir. Entegrasyon kodu hazır ve doğrulanmış durumda —
burada yalnızca test ortamını ayağa kaldırıp akışı deniyoruz.

> **Mod:** Bu keyler `sk_test_…` / `whsec_…` (test modu). Gerçek para hareketi
> olmaz. Prod'a çıkarken canlı (`sk_live_…`) keyler ve prod webhook endpoint'i
> ayrı olarak tanımlanmalı.

---

## 1. Ortam değişkenleri

Keyler `web/.env.local` içinde (bu dosya `.gitignore`'da — commit'lenmez):

```
STRIPE_SECRET_KEY=sk_test_…        # test gizli anahtarı
STRIPE_WEBHOOK_SECRET=whsec_…      # aşağıdaki adıma göre seçilir (ÖNEMLİ)
STRIPE_TAX_ENABLED=false           # otomatik vergi kapalı (test için basit)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### `STRIPE_WEBHOOK_SECRET` hangisi?

Webhook imza doğrulaması (`route.ts` → `constructEvent`) için kullanılan secret,
olayı **hangi kaynağın** gönderdiğine göre değişir:

- **Yerel geliştirme (`stripe listen`):** `stripe listen` komutu kendi
  `whsec_…` değerini üretir ve terminale basar. Yerelde test ederken
  `.env.local`'daki `STRIPE_WEBHOOK_SECRET` **o değer** olmalıdır.
- **Dashboard endpoint'i (staging/prod URL):** Stripe Dashboard → Developers →
  Webhooks'ta tanımlı endpoint'in "Signing secret"i. `.env.local`'da hâlihazırda
  duran değer budur.

> İki kaynak farklı secret üretir. Yerelde `stripe listen` ile test edeceksen,
> aşağıdaki adım 3'te terminale basılan `whsec_…`'i `.env.local`'a yaz ve dev
> sunucusunu yeniden başlat. Aksi halde imza doğrulaması `400 Invalid signature`
> döner.

---

## 2. Dev sunucusunu başlat

```bash
cd web
npm run dev          # http://localhost:3000
```

Postgres (5434) ve Redis (6379) ayakta olmalı (kredi defteri + iş kuyruğu için).

---

## 3. Webhook'ları yerele yönlendir (`stripe listen`)

Stripe CLI kuruluysa ([kurulum](https://docs.stripe.com/stripe-cli)):

```bash
stripe login                        # tek seferlik, test hesabına bağlanır
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Komut şuna benzer bir satır basar:

```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxx (^C to quit)
```

Bu `whsec_…` değerini `.env.local`'daki `STRIPE_WEBHOOK_SECRET`'e yaz ve
`npm run dev`'i yeniden başlat. `stripe listen` açık kaldığı sürece, gerçek
test ödemelerinden doğan `checkout.session.completed` olayları yerel endpoint'e
iletilir.

---

## 4. Satın-alma akışını çalıştır

1. `http://localhost:3000` → Google ile giriş yap.
2. Yeni hesap açılışta **5 ücretsiz kredi** ile gelir (welcome bonus).
3. Sidebar → **Buy credits** (`/dashboard/buy`).
4. Bir paket seç → Stripe hosted Checkout'a yönlenirsin.

### Paketler (kod: `src/lib/credits/packages.ts`)

| Key     | Kredi | Fiyat  |
|---------|-------|--------|
| starter | 10    | $5.00  |
| creator | 50    | $19.00 |
| pro     | 200   | $59.00 |

5. Checkout formunu test kartıyla doldur (aşağı bak) → öde.
6. `checkout.session.completed` olayı webhook'a düşer → `fulfillPurchase`
   krediyi ekler → başarı sayfası (`/dashboard/buy/success`).
7. Kredi bakiyesinin arttığını sidebar'da doğrula.

---

## 5. Test kartları

Yalnızca **test modunda** çalışır. Son kullanma: herhangi bir **gelecek** tarih.
CVC: herhangi bir **3 haneli** sayı. ZIP: herhangi 5 hane.

| Kart numarası          | Sonuç |
|------------------------|-------|
| `4242 4242 4242 4242`  | ✓ Başarılı ödeme (varsayılan) |
| `4000 0025 0000 3155`  | ⚠️ 3D Secure kimlik doğrulaması ister |
| `4000 0000 0000 9995`  | ✗ Decline — yetersiz bakiye (`insufficient_funds`) |
| `4000 0000 0000 0002`  | ✗ Decline — genel red |
| `4000 0000 0000 0069`  | ✗ Decline — kartın süresi dolmuş |

Tam liste: <https://docs.stripe.com/testing>

---

## 6. Webhook'u kart olmadan tetikle (opsiyonel, hızlı)

Tüm Checkout formunu doldurmadan fulfillment'ı denemek için:

```bash
stripe trigger checkout.session.completed
```

> Not: `stripe trigger` sentetik bir olay üretir; bizim fulfillment'ımız
> `metadata.{userId,packageKey,credits}` bekler. Sentetik olayda bu metadata
> bulunmadığından handler krediyi ekleyemez ve olayı
> `PAID-BUT-UNFULFILLED` olarak loglar (bkz. `stripe-events.ts`) — bu
> **beklenen** davranıştır ve fırlatmaz. Gerçek metadata'lı uçtan uca test için
> adım 4'teki asıl Checkout akışını kullan.

---

## 7. Fulfillment'ı doğrula

Kredinin gerçekten eklendiğini DB'den kontrol et. Idempotency anahtarı
`purchases.stripe_session_id` (UNIQUE); kredi defterindeki satır ona `purchaseId`
ile bağlanır (bkz. `purchases.ts`, `stripe-events.ts`).

```bash
# purchases: satın-alma kaydı + idempotency anahtarı
psql "$DATABASE_URL" -c \
  "select stripe_session_id, package_key, credits, status, created_at from purchases order by created_at desc limit 5;"

# credit_ledger: kind='purchase' satırı, purchase_id ile eşleşir
psql "$DATABASE_URL" -c \
  "select kind, delta, purchase_id, created_at from credit_ledger order by created_at desc limit 5;"
```

- `purchases`'ta `status = 'completed'`, `credits = paket kredisi` görülmeli.
- `credit_ledger`'da `kind = 'purchase'`, `delta = paket kredisi`.
- Aynı `stripe_session_id` ile `purchases`'ta ikinci satır **olmamalı**
  (`onConflictDoNothing` → duplicate delivery no-op).
- Stripe webhook'u aynı olayı yeniden gönderse bile bakiye artmaz.

---

## Doğrulanmış durum (bu runbook yazılırken)

- Test gizli anahtarı canlı test hesabına karşı çalışıyor: `buildCheckoutParams`
  ile aynı param şeklinde bir `cs_test_…` Checkout Session başarıyla oluşturuldu
  (`livemode: false`, `amount_total: 1900`, metadata doğru).
- SDK `stripe@22.3.0`; kod `apiVersion: "2026-06-24.dahlia"` — SDK'nın pinldiği
  sürümle **birebir** eşleşiyor.
- Hesap: **DEHA TECHNOLOGY LIMITED** (`acct_1Tfe6…`), sağlanan test key
  prefix'iyle uyumlu.
