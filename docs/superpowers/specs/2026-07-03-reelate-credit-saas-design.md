# Reelate — Kredi Tabanlı AI Kısa Video SaaS Platformu Tasarımı

**Tarih:** 2026-07-03
**Marka:** Reelate — reelate.co (satın alma kullanıcıda)
**Temel:** MoneyPrinterTurbo fork'u (bu repo) video üretim motoru olarak kullanılır.

## 1. Ürün Özeti

İçerik üreticilerinin (B2C) konu girip dakikalar içinde seslendirmeli, altyazılı,
stok görüntülü kısa video (TikTok/Reels/Shorts) aldığı, kredi ile çalışan web
platformu. Global pazar, site dili İngilizce, ödeme Stripe.

**Temel vaat (SLO):** Kullanıcı "Üret" dedikten sonra videosunu — yığılma olsa
bile — 60 sn'lik video için en geç ~4-5 dakikada alır (3 dk'lık videoda ~6-7 dk).

## 2. Mimari

Tek ana makine (mevcut Hetzner CPX42, 8 vCPU/16 GB) + talebe göre açılan worker
makineleri. Ana makinede Docker Compose:

| Bileşen | Görev |
|---|---|
| Next.js (App Router, TypeScript) | Landing, SEO sayfaları, auth, sihirbaz, kütüphane, Stripe |
| Postgres | users, credit_ledger, video_jobs, purchases, config |
| Redis | İş kuyruğu (görünürlük zaman aşımlı), kuyruk metrikleri |
| Render worker ×2 (Python) | Mevcut motordan uyarlanır; kuyruktan iş çeker, video üretir |
| Autoscaler (Python, ~200 satır) | Kuyruk derinliğine göre Hetzner API ile worker makinesi açar/kapatır |
| Caddy | TLS + üretilen videoların imzalı URL ile servisi |

**Worker makineleri:** Hazır Hetzner snapshot'tan CPX51 (16 vCPU = 4 worker
slotu) ~90 sn'de açılır; cloud-init ile ana makinedeki Redis/Postgres'e bağlanır.
Worker'lar durumsuz — her an silinebilir.

**Entegrasyon modeli — iş kuyruğu:** Next.js kredi düşer + `video_jobs` kaydı
yazar (tek transaction) → Redis kuyruğuna job id → worker işler, çıktıyı diske
yazar, durumu Postgres'e işler → arayüz SSE ile canlı durum gösterir.
Gerekçe: worker/makine ölümünde iş kuyruğa döner; kredi düşüp video kaybolması
mimari olarak imkânsız.

## 3. Hız Garantisi (SLO) Tasarımı

Üç bileşen:

1. **Render ≤ ~2 dk:** 9:16 çıktı 720×1280, ffmpeg `veryfast` preset, klip
   indirmeleri paralel. Mevcut ~4-5 dk → hedef ~1,5-2 dk.
   ✓ Ölçüldü (Task 10, Apple Silicon Mac — Hetzner CPX51 değil): render aşaması
   tek başına ~74 sn'ye indi, toplam uçtan uca ~99-105 sn — hedef tutuyor.
   Detay ve sınırlamalar: `docs/superpowers/specs/2026-07-03-phase1-slo-results.md`.
   Faz 3'te production donanımında (Hetzner CPX51) tekrar doğrulanacak.
2. **Gecikmesiz scale-up:** Autoscaler 10 sn'de bir bakar; `bekleyen slot
   ihtiyacı > boş slot` ise farkı kapatacak makineleri anında talep eder
   (scale-up'ta cooldown yok; scale-down'da 10 dk boşta bekleme + drain).
   Kapasite hesabı video adedine değil toplam süre/kredi yüküne göre yapılır.
   100 eşzamanlı istek: 10 sn tespit + 90 sn boot + ~2 dk render ≈ ~4 dk;
   anlık ~25 makine, maliyet ~€3-4. Hetzner proje limiti önceden 30+'a
   yükseltilir. Makine tavanı config'te (varsayılan 30).
3. **Dürüst arayüz:** Adım adım canlı ilerleme (senaryo → klipler → render).
   Tavan aşılırsa ETA gösterilir + video hazır olunca e-posta. SLO aşımı
   sessiz kalmaz.

**Dış kısıtlar ve karşılıkları:**
- **Pexels rate limit (200 istek/saat/key):** key havuzu (config çoklu key
  destekliyor) + **klip önbelleği**: anahtar kelime bazlı disk önbelleği, LRU
  sınırlı. Isınan önbellekte popüler konular indirme yapmadan render'a geçer.
- **edge-tts (ücretsiz, SLA yok):** agresif timeout + retry; başarısızlıkta
  **Azure TTS'e otomatik yedekleme** (motor destekliyor, key eklenecek).
- **Altyazı `edge` modunda sabit** (zamanlama TTS'ten); whisper MVP'de kapalı.
- LLM adımı sihirbazda (üretim öncesi) gerçekleşir; SLO saatine dahil değil.

## 4. Veri Modeli ve Kredi Defteri

- **users** — Auth.js kimliği (e-posta magic link + Google OAuth)
- **credit_ledger** — bakiye değil hareket tutulur: `purchase | spend | refund |
  welcome_bonus`, bakiye = toplam. Kredi düşme + iş kaydı tek transaction.
- **video_jobs** — konu, dil, ses, format, hedef süre, durum
  (`queued → script → downloading → rendering → done | failed`), çıktı yolu,
  ödendiği ledger hareketi
- **purchases** — Stripe checkout oturumları + webhook kayıtları
- **config** — kredi kademeleri, paket fiyatları, autoscaler eşikleri, makine
  tavanı (kod değişikliği olmadan ayarlanabilir)

Kalıcı başarısızlıkta otomatik `refund` + kullanıcı bildirimi.

## 5. Kredi Modeli ve Fiyatlandırma

**1 kredi = 30 sn hedef süre.** Kademeler: 30 sn=1, 60 sn=2, 90 sn=3, 3 dk=6.

Sihirbazda süre seçilir → senaryo o uzunlukta üretilir (kelime hedefi
prompt'a yazılır) → kullanıcı düzenledikçe tahmini süre (~2,5 kelime/sn) ve
kredi tutarı "Üret" butonu üstünde canlı güncellenir; kademe atlarsa görünür
uyarı. Butondaki tutar neyse o düşülür; sunucu aynı formülle doğrular
(istemci rakamına güvenilmez). Bakiye yetersizse satın alma akışına yönlendirme.

**Paketler** (video başına maliyet ~$0.01-0.02; pazar çıpası ~$0.40-0.60/video-dk):

| Paket | Kredi | Fiyat | Kredi başı |
|---|---|---|---|
| Starter | 10 | $5 | $0.50 |
| Creator (öne çıkan) | 50 | $19 | $0.38 |
| Pro | 200 | $59 | $0.295 |

Hoş geldin bonusu: 2 kredi. Fiyat/kademe değerleri config tablosunda.

## 6. Stripe Akışı

- Stripe **Checkout Session** (hazır ödeme sayfası, PCI kapsamı dışı)
- Kredi yükleme yalnızca imza doğrulamalı **webhook**
  (`checkout.session.completed`) ile; başarı sayfası asla kredi yüklemez
- Webhook idempotent (aynı event ikinci kez kredi yüklemez)
- Stripe Tax açık, fiyatlar USD

## 7. Kullanıcı Deneyimi

- Landing → kayıt (2 kredi bonus) → **sihirbaz**: süre + konu + dil + ses
  (önizlemeli) + format → senaryo üret/düzenle (canlı fiyat) → Üret
- **İlerleme sayfası:** SSE ile adım adım durum; bitince oynatıcı + indir
- **Kütüphane:** tüm videolar kalıcı; yeniden indir, aynı ayarlarla yeniden üret,
  kullanıcı isterse kendi videosunu silebilir
- **Saklama: süresiz.** Sistem final videoları silmez. Disk %80 dolulukta
  operatöre e-posta uyarısı; gerekirse Hetzner Volume eklenir (€0.05/GB/ay).
  Depolama erişimi tek modül arkasında (ileride obje depolamaya geçiş kolay).
  Temizlik cron'u yalnızca ara dosyaları ve LRU aşan önbellek kliplerini siler.

## 8. SEO ve Marka

- **Teknik SEO:** SSR landing + fiyatlandırma, otomatik sitemap, meta/OG
  otomasyonu, Core Web Vitals hedefli hız
- **Programatik sayfalar:** şablondan üretilen 10-20 niş landing
  ("AI TikTok video generator", "faceless YouTube video maker" vb.),
  arama niyeti yüksek anahtar kelimeler
- Blog/içerik motoru faz 2
- **Marka yönü:** Reelate — modern, koyu zeminli, creator-tools estetiği,
  canlı vurgu rengi. Detaylı görsel tasarım implementasyonda `frontend-design`
  ile; bu spec yalnızca yönü sabitler.

## 9. Hata Yönetimi

- Redis görünürlük zaman aşımı: worker ölürse iş otomatik kuyruğa döner
- 2 deneme sonrası `failed` → otomatik kredi iadesi + açıklayıcı mesaj
- Adım bazlı checkpoint: senaryo/ses üretildiyse retry kaldığı adımdan sürer
- Autoscaler Hetzner API hatasında mevcut kapasiteyle devam + operatöre e-posta

## 10. Test ve Yayına Alma

- Kredi defteri ve webhook idempotensi: birim test zorunlu
- Uçtan uca: Stripe test modu ile satın alma → üretim → indirme
- Deploy: GitHub Actions → Docker Compose; worker snapshot'ı versiyonlu
- API key'ler (OpenAI, Pexels havuzu, Azure TTS, Hetzner API, Stripe) operatör
  tarafından env/secret olarak sağlanır

## 11. Faz Planı

*(2026-07-03 revizyonu: Faz 3 ile Faz 4'ün yeri değişti; tam autoscaler
lansman sonrasına alındı, yerine "3-lite" Faz 4a'ya gömüldü. Gerekçe: gelir
üretimi deploy'a bağlı; mevcut kapasite — 2 worker, ~40-60 video/saat —
kapalı beta için yeterli; yığılma riski snapshot + kuyruk uyarısı + elle
ölçekleme ile karşılanıyor.)*

1. **Faz 1 — Motor** ✅: render optimizasyonu (720p, veryfast, paralel
   indirme, klip önbelleği), worker'laştırma, SLO ölçümü
2. **Faz 2 — SaaS çekirdeği** ✅ (2a auth+kredi, 2b Stripe, 2c sihirbaz+akış)
3. **Faz 4a — Deploy + 3-lite:** üretim deploy'u (aşağıdaki not) + worker
   bootstrap artefaktı (elle ölçekleme 2 dk) + kuyruk derinliği uyarısı +
   kuyruk ETA göstergesi
4. **Faz 4b — Tasarım + landing:** görsel kimlik, landing, programatik SEO
   sayfaları
5. **Faz 4c — Lansman cilası:** e-posta girişi (magic link), Stripe canlı
   doğrulama, go-live kontrol listesi, kapalı beta
6. **Lansman sonrası ilk iş — tam autoscaler:** kuyruk derinliğine göre
   Hetzner API ile otomatik worker makinesi aç/kapat (Bölüm 3'teki tasarım)

**Deploy gerçeği (Bölüm 2 revizyonu):** Hedef makine (CPX42) Reelate'e
adanmış DEĞİL — üzerinde falportal/durudroid/ilkimsuderin üretimde ve
80/443'ü Traefik (docker network `web`, Cloudflare Origin sertifikaları)
yönetiyor. Reelate stack'i kendi Compose dosyasıyla, kendi postgres/redis
konteynerleriyle, Traefik'e label ile katılır. Render worker'ları
**CPU-limitli** (`cpus: 3` + düşük öncelik) çalışır ki mevcut siteler
etkilenmesin; kuyruk sıkışırsa worker'lar ayrı makineye taşınır (bootstrap
artefaktı hazır olacak).

Her faz kendi implementasyon planını alır (writing-plans); bu spec üst
çerçevedir. Faz 1 sonunda ölçülen render süreleri Bölüm 3'teki varsayımları
günceller.

## 12. Kapsam Dışı (MVP)

- Abonelik modeli, tam stüdyo/editör, blog, çoklu dil arayüzü, takım hesapları,
  API ürünü (mimari engellemez; faz 2+ sonrası değerlendirilir)
