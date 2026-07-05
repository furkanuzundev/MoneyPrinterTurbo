# Prod Öncesi Hazırlık — Tasarım Dokümanı

**Tarih:** 2026-07-05
**Kapsam:** Reelate (`web/`) prod'a çıkmadan önce dört hazırlık işi.

Bu doküman, uygulanmış çalışmanın kaydıdır. Dört iş birbirinden bağımsızdır;
her biri ayrı doğrulanmıştır.

---

## 1. Logo — "R" markası temel marka varlığı

**Sorun:** "R" markası yalnızca sidebar'da bir CSS `<span>`'iydi. Standalone bir
ikon, manifest, apple-touch-icon, OG görseli veya PWA ikonu yoktu; `layout.tsx`
hiçbir `icons` tanımlamıyordu.

**Çözüm:** Marka rengi tokenlarıyla (`caption #f4c63a` zemin, `caption-ink
#141208` harf) tek bir SVG master çizildi. "R" harfi, her boyutta (16px favicon
dahil) keskin kalması ve font varlığına bağımlı olmaması için **vektör path**
olarak çizildi. Tüm rasterlar bu master'dan üretilir.

**Üretilen varlıklar** (Next.js App Router dosya-tabanlı metadata ile otomatik
`<head>`'e bağlanır):

- `src/app/icon.svg` — ölçeklenebilir favicon
- `src/app/favicon.ico` — 16/32/48 çok boyutlu
- `src/app/apple-icon.png` — 180×180
- `src/app/opengraph-image.png` + `twitter-image.png` — 1200×630 sosyal kart
- `public/icons/icon-{192,512}.png` + `icon-maskable-{192,512}.png` (PWA)
- `src/app/manifest.ts` → `/manifest.webmanifest` (installable, theme `#f4c63a`)

**Kaynak master'lar:** `public/brand/reelate-mark.svg`,
`reelate-mark-maskable.svg`, `reelate-og.svg`.
**Üreteç:** `scripts/generate-icons.mjs` (sharp; mark değişince yeniden çalıştır).

**Paylaşılan bileşen:** `src/components/logo.tsx` (`LogoMark`, `Logo`). Sidebar,
landing header ve footer artık bu tek kaynağı kullanır — mark her yerde tutarlı.

**Doğrulama:** dev sunucusuna karşı `<head>`'de icon/manifest/theme-color
enjekte edildiği, tüm ikon endpoint'lerinin 200 döndüğü ve manifest JSON'unun
doğru olduğu curl ile teyit edildi. Prod build tüm metadata route'larını üretti.

---

## 2. "Made with Reelate" showcase — gerçek video player'ları

**Sorun:** Showcase bölümü (`showcase.tsx`) placeholder gradient kartlarıydı;
gerçek video yoktu.

**Karar (kullanıcı seçimi):** "Wire it up, I'll render" — kod prod'a hazır olsun,
gerçek üretimi kullanıcı yerelde (anahtarlar + worker orada) yapsın.

**Çözüm:**
- `showcase.tsx` gerçek, lazy (`IntersectionObserver` ile yalnız görünürken
  oynayan) `<video>` player'larına dönüştürüldü. Muted/loop/playsInline,
  `preload="none"`, poster. Video yüklenemezse (`onError`) stilize placeholder'a
  **graceful fallback** — bölüm dosyalar gelmeden de yayınlanabilir.
- Beklenen dosyalar: `public/showcase/showcase-{1,2,3}.mp4` (+ `.jpg` poster).
- **Render script'i:** `scripts/render-showcase.sh` — `cli.py`'yi kart
  başlıklarıyla eşleşen 3 konu için çalıştırır, çıktıları `public/showcase/`'a
  kopyalar, ffmpeg ile poster çıkarır. Kullanıcı çalıştırır; bölüm sıfır-kodla
  devreye girer.

**Doğrulama:** typecheck + lint temiz; landing sayfası video `src`'leri bağlı
şekilde render oluyor, dosyalar yokken placeholder'a düşüyor.

---

## 3. Stripe test ortamı

**Mevcut durum:** Entegrasyon zaten tam ve doğru (hosted Checkout redirect,
imzalı webhook, dinamik `price_data`, publishable key gerektirmez, hardcoded
price ID yok). **Kod değişikliği gerekmedi.**

**Yapılanlar:**
- Test keyleri `web/.env.local`'a (gitignored) yazıldı.
- `apiVersion: "2026-06-24.dahlia"` — SDK `stripe@22.3.0`'ın pinlediği sürümle
  **birebir** eşleştiği doğrulandı.
- **`web/STRIPE_TESTING.md`** runbook'u: `stripe listen`, test kartları,
  fulfillment/idempotency doğrulama SQL'i (gerçek şema kolonlarıyla).
- Keyler canlı test hesabına karşı **çalışır durumda doğrulandı**: uygulamanın
  `buildCheckoutParams` şekliyle bir `cs_test_…` session oluşturuldu
  (`livemode: false`, `amount_total: 1900`, metadata doğru). Hesap: DEHA
  TECHNOLOGY LIMITED (`acct_1Tfe6…`).

**Güvenlik notu:** Secret keyler hiçbir izlenen dosyaya commit'lenmedi;
yalnızca gitignored `.env.local`'da ve bu doküman/runbook'ta yalnızca test-modu
olduğu belirtildi (gerçek key değerleri repoda yer almaz).

---

## 4. Ücretsiz kredi 2 → 5

**Tek doğruluk kaynağı:** `WELCOME_BONUS_CREDITS` (`src/lib/credits/pricing.ts`).

**Değişiklikler:**
- `pricing.ts`: `2 → 5`.
- UI kopyaları: `hero.tsx`, `final-cta.tsx` (×2), `use-cases/[slug]/page.tsx`
  (×2) — "2 videos" → "5 videos". (Son ikisi ilk taramada kaçmıştı; tam sweep
  ile bulundu.)
- Testler: bonus-türevli tüm bakiye assertion'ları literal yerine
  `WELCOME_BONUS_CREDITS`'e bağlandı (gelecekteki değişikliklere dayanıklı).
  `ledger.test.ts` double-spend testi, işi bonusun tamamına mal ederek anlamını
  korudu.

**Doğrulama:** ilgili 41 test + tüm 123 test yeşil.

---

## Nihai doğrulama

- `vitest run`: **123/123** yeşil (20 dosya).
- `tsc --noEmit`: temiz.
- `eslint` (dokunulan dosyalar): temiz.
- `next build`: başarılı; tüm yeni metadata route'ları üretildi.
- Stripe test key'i canlı test hesabına karşı gerçek session ile doğrulandı.

**Kullanıcıya kalan tek manuel iş:** `scripts/render-showcase.sh` çalıştırıp 3
showcase videosunu üretmek (anahtarlar + worker kullanıcı ortamında).
