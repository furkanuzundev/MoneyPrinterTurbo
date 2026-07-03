# Landing Refactor — docs/landing.html mockup'ına göre

## Context

Reelate'in mevcut landing'i (`web/src/app/page.tsx`, 166 satır) sadece hero + pricing içeriyor. `docs/landing.html` içinde gömülü (self-extracting bundle) yeni bir tasarım mockup'ı var: daha zengin bölüm yapısı ve yeni bir marka paleti. Amaç: landing'i bu mockup'a göre yeniden inşa etmek ve paleti tüm uygulamaya yaymak (global rebrand).

Mockup'ın asıl HTML'i çıkarıldı: `/private/tmp/claude-501/.../scratchpad/landing_extracted.html` (bundle'ın `__bundler/template` script'inden; implementasyon oturumunda aynı yöntemle yeniden çıkarılabilir: `docs/landing.html` içindeki template JSON'ı base64+gzip decode).

## Kullanıcı kararları

1. **Global rebrand** — yeni palet/fontlar `globals.css` token'larına işlenir; dashboard/signin/use-cases otomatik alır.
2. **Hero gerçek video, showcase placeholder** — hero telefonuna mevcut `hero-demo.mp4`; showcase kartları mockup'taki stilize placeholder.
3. **Testimonial ve "Watch a 30s demo" mockup'taki gibi kalır** (Maya Chen doldurma içeriği dahil).
4. **Bölüm bileşenlerine ayır** — `web/src/components/landing/` altında ayrı bileşenler, Tailwind utility + token'lar (inline style portu değil).

## Yeni tasarım token'ları (globals.css)

Mevcut mavi-siyah → sıcak siyah palet:

| Token | Eski | Yeni |
|---|---|---|
| `--color-ink` (bg) | `#111420` | `#100F0C` |
| `--color-panel` | `#191d2b` | `#17150F` |
| `--color-elevated` | `#202536` | `#1B1912` |
| `--color-line` | `#2a2f42` | `#26231A` (mockup rgba(255,255,255,.06)≈) |
| `--color-bone` (text) | `#edede6` | `#F3EFE6` |
| `--color-muted` | `#9ba0b4` | `#A8A196` |
| `--color-caption` (accent) | `#ffd84d` | `#F4C63A` |

- Aksan üstü metin rengi: `#141208` (butonlarda). Soluk aksan varyantı: `#C9A93B` (eyebrow/kicker metinleri) — gerekirse `--color-caption-dim` olarak eklenir.
- shadcn değişken seti (`--background`, `--primary`, `--card`, sidebar…) aynı dosyada bu yeni değerlere map edilir.

**Fontlar** (`layout.tsx`, next/font/google):
- Display: Bricolage Grotesque (değişmiyor).
- Body: Instrument Sans → **Hanken Grotesk** (`--font-sans`).
- Mono: IBM Plex Mono → **JetBrains Mono** (`--font-mono-data`).
(Mockup'ta Figtree/Space Grotesk/Space Mono da yüklü ama stillerde kullanılmıyor — eklenmeyecek.)

## Dosya yapısı

```
web/src/app/page.tsx                    → incelir: veri çekme + bölüm sıralama
web/src/app/landing.css                 → yeniden yazılır: reFloat/reGlow keyframe'leri + reduced-motion
web/src/app/globals.css                 → token güncellemesi (global rebrand)
web/src/app/layout.tsx                  → font değişimi
web/src/components/landing/header.tsx      (anchor nav: Features/How it works/Pricing/Showcase + Sign in + Start free)
web/src/components/landing/hero.tsx         (rozet, H1, subcopy, 2 CTA, mono microcopy, telefon)
web/src/components/landing/hero-phone.tsx   (float+glow animasyonlu çerçeve, içinde hero-demo.mp4 + "MADE WITH REELATE" + progress overlay)
web/src/components/landing/platform-strip.tsx ("Made for" TikTok/Reels/Shorts/LinkedIn/Facebook)
web/src/components/landing/how-it-works.tsx  (01/02/03 kartları, id="how-it-works")
web/src/components/landing/feature-bento.tsx (script engine büyük kart + HOOK/BODY/CTA mono bloğu; 40+ voices; auto-matched footage; id="features")
web/src/components/landing/showcase.tsx      (3 adet 9:16 placeholder kart, id="showcase")
web/src/components/landing/testimonial.tsx   (Maya Chen alıntısı)
web/src/components/landing/pricing.tsx       (dinamik paketler, id="pricing")
web/src/components/landing/final-cta.tsx     (sarı gradient CTA bloğu)
web/src/components/landing/footer.tsx
```

- Kopyalar (başlıklar, kart metinleri) mockup'tan birebir alınır; hepsi İngilizce.
- CTA hedefleri mevcut davranış korunarak: "Start free" → `/signin`, pricing butonları → mevcut satın alma akışı linki (bugünkü `page.tsx`'teki hedefler neyse o). "Watch a 30s demo" hero videosuna scroll eder + sesi açıp baştan oynatır (küçük client bileşeni).
- `web/src/components/ui.tsx` **dokunulmaz** (use-cases/signin/buy "byte-identical" kuralı). Landing artık ondan bağımsız; diğer ekranlar yeni token'ları CSS üzerinden otomatik alır.

## Dinamik pricing

- `getPackages(db)` + `DEFAULT_PACKAGES` fallback'i (try/catch, commit 08882af) aynen korunur.
- Kart içeriği paket verisinden türetilir: `$amount`, `credits · ~N shorts`, `≈ $X / video`; **save %** en küçük paketin video başı fiyatına göre hesaplanır (Starter'da gösterilmez). Featured paket: `MOST POPULAR` rozeti + sarı border + gradient arka plan.

## Responsive (mockup desktop-only, eklenecek)

- Nav menü linkleri `lg` altı gizlenir (hamburger yok — YAGNI).
- Hero grid `lg` altı tek kolon (telefon altta), H1 `text-5xl → lg:text-7xl` ölçeği.
- How-it-works / bento / showcase / pricing gridleri mobilde tek kolon, `sm` 2'li nerede uygunsa.
- Yatay padding `px-72px` yerine `px-6 md:px-12 lg:px-[72px]` ölçeği; içerik `max-w-[1240px] mx-auto`.

## Animasyonlar

`landing.css` yeniden yazılır: `reFloat` (telefon, 6s translateY), `reGlow` (radial glow opacity), mevcut `prefers-reduced-motion` bloğu korunur (animasyonlar kapanır, video `autoplay` yine `muted` olduğundan kalabilir; mevcut dosyadaki reduced-motion video davranışı neyse korunur).

## Değişmeyenler

- `layout.tsx` metadata (title/OG), sitemap/robots, use-cases sayfaları.
- DB/veri katmanı, dashboard shell.

## Doğrulama

1. `cd web && npm run build` (veya projedeki script neyse) — statik prerender'ın DB'siz geçtiğini doğrular (packages fallback).
2. Dev server (`npm run dev`) + Chrome ile `/` görsel kontrol: masaüstü ve ~390px mobil genişlik; anchor nav'ların scroll ettiği; hero videosunun oynadığı; "Watch demo" davranışı.
3. `/use-cases`, `/signin`, `/dashboard` hızlı görsel kontrol — yeni token'ların buralarda kırılma yaratmadığı (kontrast, sarı aksan).
4. Mockup ile yan yana karşılaştırma: `scratchpad/landing_extracted.html` tarayıcıda açılıp bölüm bölüm kıyaslanır.

## Uygulama sonrası

- Spec dosyası `docs/superpowers/specs/2026-07-03-landing-refactor-design.md` olarak bu içerikten yazılıp commit edilir (plan modunda yazılamadı).
- Süreç: superpowers akışına göre TDD uygun değil (görsel iş) — bölüm bölüm implement + görsel doğrulama; sonunda `verification-before-completion`.
