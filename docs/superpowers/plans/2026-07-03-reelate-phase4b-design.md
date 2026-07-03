# Reelate Faz 4b — Tasarım + Landing + Programatik SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reelate'e ayırt edici bir görsel kimlik: token sistemi + tüm uygulama ekranlarının restyle'ı + dönüşüm odaklı landing + 14 programatik SEO sayfası + sitemap/OG; sonunda üretime deploy.

**Architecture:** Tek kaynak token sistemi (`globals.css` @theme + `web/src/lib/design/tokens.md` referansı). Landing ve SEO sayfaları server component (SSR, hız); animasyonlar saf CSS (JS kütüphanesi yok). SEO içerikleri tek data dosyasından şablonla üretilir.

**Tech Stack:** Tailwind CSS v4 (@theme), Google Fonts (next/font ile self-host edilir — CSP/performans), mevcut Next.js App Router.

## Tasarım Sistemi (bağlayıcı — tüm task'lar buna uyar)

**Konu dünyası:** dikey video, altyazı chip'leri, kurgu zaman çizelgesi, render ilerlemesi. Tasarım bu dünyadan türetilir; jenerik "koyu zemin + tek asit yeşili vurgu" kalıbından bilinçli kaçınılır.

**Renk (hex'ler kesin):**
- `ink` #111420 — zemin (gece kurgu odası; saf siyah değil, maviye çalan mürekkep)
- `panel` #191D2B — yükseltilmiş yüzeyler (kart/panel)
- `line` #2A2F42 — çizgiler/kenarlıklar
- `bone` #EDEDE6 — ana metin (sıcak kırık beyaz)
- `muted` #9BA0B4 — ikincil metin
- `caption` #FFD84D — İMZA vurgu: viral video altyazı sarısı. CTA, aktif durum, fiyat etiketi, altyazı chip'leri. Tek vurgu rengi budur; ikinci bir accent YOK.

**Tipografi (next/font/google):**
- Display: **Bricolage Grotesque** (700/800, `display` rolü — başlıklar, hero; -%2 letter-spacing)
- Body/UI: **Instrument Sans** (400/500/600)
- Data: **IBM Plex Mono** (kredi sayıları, süreler, ETA, progress yüzdesi — "kurgu yazılımı zaman kodu" hissi)

**İmza öğeleri (boldness bütçesi buraya):**
1. **Caption chip:** altyazı görünümlü etiket — `bg-caption text-ink font-bold px-2 py-0.5 rounded-md` küçük rotasyonlu (-1deg). Landing hero'da, fiyat etiketlerinde, "2 free credits" gibi vurgu noktalarında.
2. **Hero'da canlı 9:16 önizleme kartı:** telefon oranlı kart içinde saf CSS animasyonu — üç altyazı chip'i sırayla belirir (`@keyframes` ile typing/fade döngüsü), altta ince ilerleme çubuğu dolar; "render oluyormuş" hissi. JS yok, `prefers-reduced-motion`'da statik ilk kare.
3. **Timeline şeridi ("How it works"):** kurgu zaman çizelgesi metaforu — yatay şerit üzerinde 4 "klip" bloğu (Topic → Script → Footage → Post-ready), aralarında playhead çizgisi. Sıra gerçek bir süreç olduğu için numaralandırma meşru.

**Ton/kopya (İngilizce, aktif fiiller, satış cilası yok):** başlıklar kısa ve somut. Yasak: "unleash", "supercharge", "revolutionize". Hero: `Type a topic.` / `Post a video.` (iki satır, ikinci satırda "video" caption-chip içinde). Alt metin: `Reelate writes the script, voices it, cuts stock footage, and burns in captions — a ready-to-post short in about five minutes.` CTA: `Start free — 2 videos on us`.

**Kısıt disiplinli kalır:** border-radius tutarlı (kartlar 16px, chip 6px), gölge yok (çizgi + zemin farkıyla derinlik), animasyon yalnız hero kartı + hover mikro geçişleri. Erişilebilirlik tabanı: görünür focus ring (caption rengi), reduced-motion, mobil 360px'e kadar akıcı.

**Öz-eleştiri notu (kalıp kontrolü):** "koyu + tek parlak vurgu" AI-default #2'ye komşu; farkı şuradan geliyor: vurgu asit yeşil/vermilyon değil, konuya gömülü altyazı sarısı ve YALNIZ altyazı-chip formunda kullanılıyor (düz renk blokları değil); tipografi çifti (Bricolage + Plex Mono timecode) ve timeline/9:16 motifleri konudan türedi. Cream+serif ve broadsheet kalıpları kullanılmıyor.

## Global Constraints

- Renk/font token'ları yukarıdaki değerlerle birebir; yeni renk eklenmez
- Tüm kullanıcı metinleri İngilizce; kopya bu plandaki metinlerle başlar, implementer küçük iyileştirme yapabilir ama yasak kelimeler giremez
- JS animasyon kütüphanesi eklenmez; fontlar next/font ile (harici <link> yok)
- Mevcut işlevsellik bozulmaz: `cd web && npm test` (73) yeşil kalır, `npm run build` temiz; route/prop imzaları değişmez
- SEO sayfaları SSR + benzersiz title/description/OG; sitemap.ts + robots.ts
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Token sistemi + font kurulumu + UI primitifleri + app shell restyle

**Files:**
- Modify: `web/src/app/globals.css` (@theme token'ları), `web/src/app/layout.tsx` (next/font + gövde sınıfları)
- Create: `web/src/components/ui.tsx` (Button, Card, CaptionChip, MonoStat — küçük, tek dosya), `web/src/lib/design/tokens.md` (referans)
- Modify: `web/src/app/dashboard/layout.tsx` (nav restyle: logo "Reelate" display fontta, caption-chip'li kredi rozeti)

**Interfaces:**
- Produces: Tailwind'de `bg-ink/panel`, `text-bone/muted`, `border-line`, `bg-caption`, `font-display`, `font-mono-data` utility'leri; `<Button variant="primary|ghost">`, `<Card>`, `<CaptionChip>`, `<MonoStat label value>` bileşenleri — sonraki task'lar YALNIZ bunları kullanır

- [ ] **Step 1:** globals.css @theme: yukarıdaki 6 renk + font değişkenleri; body varsayılanı `bg-ink text-bone font-sans`. layout.tsx: `Bricolage_Grotesque`, `Instrument_Sans`, `IBM_Plex_Mono` next/font/google ile değişken olarak; metadata mevcut kalır.
- [ ] **Step 2:** `ui.tsx` primitifleri (≤120 satır): Button primary = caption zemin/ink metin/hover'da hafif parlaklık; ghost = line kenarlık. CaptionChip = imza stil (rotate-[-1deg]). MonoStat = mono fontta değer + muted etiket.
- [ ] **Step 3:** dashboard layout: header'ı token'lara geçir; sağda `<CaptionChip>{balance} credits</CaptionChip>` (layout server component — balance'ı layout zaten çekebilir; getBalance çağrısı ekle).
- [ ] **Step 4:** `npm test` + `npm run build` yeşil; commit `feat(web): add design token system and ui primitives`

### Task 2: Landing page

**Files:**
- Rewrite: `web/src/app/page.tsx` (+ `web/src/app/landing.css` yalnız hero animasyon keyframe'leri için gerekiyorsa)

**Yapı (bağlayıcı):**
1. **Nav:** sol "Reelate" (display), sağ ghost "Sign in" + primary CTA
2. **Hero (imza):** sol — display 64-88px iki satır `Type a topic.` / `Post a <chip>video</chip>.`, alt metin (yukarıdaki kopya), CTA + altında mono küçük satır `~5 min per video · no camera, no editing`; sağ — 9:16 animasyonlu önizleme kartı (CSS keyframes: 3 caption chip'i 1.2s arayla fade+rise, progress bar 8s'de dolar, sonsuz döngü; reduced-motion'da statik)
3. **Timeline şeridi:** `From idea to posted in four cuts` başlığı; 4 klip bloğu: Topic (`you type one sentence`) → Script (`AI writes 30–180s of voiceover`) → Footage (`stock clips matched to every line`) → Post-ready (`captions burned in, MP4 download`). Playhead çizgisi caption renginde.
4. **Proof bar:** mono üç istatistik: `~5 min render` · `720p vertical` · `2 free credits`
5. **Pricing:** `getPackages(db)`'den üç kart (Creator featured: caption kenarlık + chip "Most popular"); fiyat mono, altında `≈ $0.38 per video` hesabı; CTA'lar signin'e
6. **Footer:** minimal — logo, `© Reelate`, `/use-cases` linki (Task 4 sonrası eklenir; şimdilik placeholder değil, koşullu bırakma — direkt ekle, sayfa 404 olursa Task 4'te dolacak; kabul edilebilir çünkü aynı faz içinde)

- [ ] Uygula, mobilde (360px) hero kartı başlığın altına insin; `npm test`+build; commit `feat(web): add designed landing page`

### Task 3: Uygulama ekranları restyle

**Files:**
- Modify: `signin/page.tsx`, `dashboard/page.tsx`, `dashboard/create/wizard.tsx` + `create/page.tsx`, `dashboard/jobs/[id]/progress.tsx` + `page.tsx`, `dashboard/library/page.tsx`, `dashboard/buy/page.tsx` + `buy-button.tsx`, `buy/success/page.tsx`

**Kurallar:** yalnız Task 1 primitifleri + token utility'leri; İŞLEVSEL koda (fetch/state/props) dokunulmaz — sadece görünüm katmanı. Belirli dokunuşlar: dashboard'da bakiye `MonoStat`; wizard'da fiyat etiketi caption-chip (`3 credits` mono); progress bar caption renginde + yüzde mono + stage display fontta; library durum rozetleri (Ready=caption chip, Failed=kırmızı metin, diğerleri muted); buy kartları landing pricing ile aynı dil.

- [ ] Uygula; `npm test` (73 yeşil — davranış değişmedi kanıtı) + build; commit `feat(web): restyle app screens with design system`

### Task 4: Programatik SEO sayfaları + sitemap/OG

**Files:**
- Create: `web/src/lib/seo/use-cases.ts` (data), `web/src/app/use-cases/[slug]/page.tsx` (şablon), `web/src/app/use-cases/page.tsx` (indeks), `web/src/app/sitemap.ts`, `web/src/app/robots.ts`
- Modify: `web/src/app/layout.tsx` (metadataBase, OG defaults)

**Data (14 slug — her biri: slug, title, h1, intro ~2 cümle, 3 bullet'lık "why Reelate works for this", örnek konu önerileri 3 adet):** `ai-tiktok-video-generator`, `faceless-youtube-shorts-maker`, `instagram-reels-generator`, `ai-video-from-text`, `motivational-video-maker`, `educational-shorts-generator`, `product-promo-video-maker`, `real-estate-short-video`, `fitness-content-generator`, `finance-tips-video-maker`, `travel-shorts-generator`, `ai-voiceover-video-maker`, `history-facts-video-generator`, `recipe-shorts-maker`. İçerik metinlerini implementer yazar (İngilizce, ton kurallarına uygun, her sayfa benzersiz — kopyala-yapıştır şablon cümle YOK; her intro sluga özgü).

**Şablon:** h1 (display) + intro + timeline şeridinin kompakt hâli + 3 bullet + örnek konular caption-chip'lerle + CTA + diğer use-case'lere 4 link (iç linkleme). `generateMetadata` slug'dan title/description; `generateStaticParams` ile SSG.

**sitemap.ts:** `/`, `/signin`, `/use-cases`, tüm slug'lar. **robots.ts:** `/dashboard`, `/api` disallow. metadataBase `https://reelate.co`.

- [ ] Uygula; build çıktısında 14 sayfa SSG (`●` işaretli) doğrula; commit `feat(web): add programmatic seo pages and sitemap`

### Task 5: Görsel doğrulama + üretime deploy

- [ ] Lokal: dev server'da `/`, `/signin`, `/dashboard`, `/dashboard/create`, `/use-cases/ai-tiktok-video-generator` sayfalarına curl ile HTML smoke (title/h1 içerik kontrolü); ayrıca Playwright YOKSA ekran görüntüsü alınmaz — operatör (kullanıcı) lokalde gözle onaylar, rapor "operatör görsel onayı bekleniyor" der
- [ ] Kullanıcı onayı SONRASI (kontrolör bekletir): rsync + `docker compose ... up -d --build web` (yalnız web; Task 4a-5'teki güvenlik kuralları aynen) + host-header title smoke
- [ ] Rapor

---

## Self-Review Notları

- **Kalıp kontrolü** yukarıda tasarım sisteminin içinde (öz-eleştiri notu). **Kapsam:** spec Bölüm 8'in teknik SEO + programatik sayfalar + marka yönü maddeleri Task 1-4'te; blog bilinçli Faz-2 sonrası (spec'te zaten öyle).
- **Bilinçli sapma (no-placeholder kuralı):** tasarım task'larında tam JSX plana gömülmedi — bağlayıcı olan token değerleri, yapı, kopya metinleri ve primitif sözleşmesi plandadır; yaratıcı uygulama implementer'a bırakıldı (tasarım işinin doğası). SEO içerikleri de aynı şekilde: format sözleşmesi kesin, metinler implementer'ın.
- **Task 5 gate:** deploy, kullanıcının lokal görsel onayından sonra — tasarım beğenilmezse üretime çıkmadan revize edilir.
