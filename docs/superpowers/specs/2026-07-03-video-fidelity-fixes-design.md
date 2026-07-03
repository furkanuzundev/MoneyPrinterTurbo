# Video Doğruluğu Düzeltmeleri — Tasarım

**Tarih:** 2026-07-03
**Kapsam:** Yeni video üretiminde iki belirgin hata

## Sorun (Gerçek Veriyle Kanıtlanmış)

Task `a1497ebb` ("puding tarifi veren kadın") çıktısı incelendi:

1. **Görüntü uyuşmuyor:** İstenen "puding yapan kadın", çıktıda "ıstakoz kesen
   kadın". Arama terimleri (`pudding recipe`, `cooking demonstration`, ...)
   aslında doğruydu. Sorun downstream: `match_materials_to_script: false` +
   `video_concat_mode: "random"` → Pexels'ten gelen alakasız stok klipleri
   rastgele diziliyor. Sistem konuşan gerçek kişi ÜRETMİYOR; TTS sesin üstüne
   stok B-roll koyuyor.

2. **Altyazı konuşmayı takip etmiyor:** `subtitle.srt` scene `caption`
   başlıklarından üretiliyor (ör. "Servis zamanı!", hatta "Test"), TTS'in
   gerçekten konuştuğu `voiceover` metninden değil.

## Kök Nedenler

- **Bug 1:** `web/src/lib/jobs/create.ts` `enqueueJob` payload'u
  `match_materials_to_script` göndermiyor → backend `false` default'una düşüyor
  → `random` concat.
- **Bug 2:** `app/services/task.py::generate_scene_subtitle` altyazı metnini
  `scene.caption`'dan üretiyor (satır 261) ve `start()` scene modunda
  `sub_maker`'ı (edge-tts kelime/cümle zaman damgaları) yok sayıyor.

## Çözüm

### Bug 1 — Senaryo-eşleşmeli mod her zaman açık

`create.ts` payload'una `match_materials_to_script: true` eklenir. Backend
mantığı hazır: bu tek bayrak terimleri anlatı sırasına göre üretir, indirmeyi
round-robin yapar ve concat'i `sequential`'a çevirir. Kullanıcıya seçenek
sunulmaz (varsayılan zorunlu).

**Dürüst sınır:** Pexels stok havuzu sınırlı; alaka maksimize edilir ama
"puding yapan kadın" mükemmelliği garanti edilmez. Gerçek talking-person ancak
avatar entegrasyonuyla olur — bu kapsam dışı.

### Bug 2 — Altyazı voiceover'dan, sese senkron

`generate_scene_subtitle` yeniden düzenlenir:

- `sub_maker` mevcutsa → `voice.create_subtitle(text=<voiceover birleşik>,
  sub_maker=sub_maker, ...)` ile senkron SRT üret (normal yolla aynı). Metin
  voiceover, zamanlama edge-tts cümle offset'leri.
- `sub_maker` yoksa (özel ses / rerender) → mevcut oransal scene bölümlemesine
  düş, ama metin `scene.caption` yerine **`scene.voiceover`** olur.

Böylece her durumda altyazı = konuşulan metin; caption asla altyazıya sızmaz.
Caption'lar scene başlığı katmanı olarak ayrı kalır (kullanıcı tercihi).

**Etkilenen çağıranlar:**
- `start()` (task.py:489): scene modunda `sub_maker` geçilmeli.
- `rerender()` (task.py:307): `sub_maker` yok → voiceover-fallback yolu.

## Test Stratejisi

- **Bug 2 (backend, TDD):** `generate_scene_subtitle` için birim testi —
  (a) `sub_maker` verildiğinde çıktı voiceover cümlelerini içerir, caption'ları
  içermez; (b) `sub_maker` None ise fallback yine voiceover metnini yazar,
  caption yazmaz. Regresyon: eski "caption → SRT" davranışı artık geçmemeli.
- **Bug 1 (web):** `create.test.ts`'e assert — enqueue payload'u scene modunda
  `match_materials_to_script: true` içerir.

## Kapsam Dışı

- Talking-avatar (HeyGen/D-ID) entegrasyonu.
- Kelime-kelime (word-level) altyazı animasyonu — cümle-seviyesi senkron yeterli.
- Wizard'a mod toggle'ı (varsayılan zorunlu, UI seçeneği yok).
