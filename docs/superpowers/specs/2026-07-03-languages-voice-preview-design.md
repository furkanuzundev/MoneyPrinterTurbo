# Diller + Ses Önizleme Tasarımı

**Tarih:** 2026-07-03
**Kapsam:** Yeni Next.js panelinde (`web/`) create-wizard'ın brief adımı

## Sorun

1. **Diller:** Yeni panelde yalnızca 2 dil (İngilizce + Türkçe) hardcoded
   (`web/src/lib/jobs/options.ts`). Backend (`app/services/data/azure_voices.json`)
   137 locale / 331 ses destekliyor. Asıl Streamlit panelinde (`webui/Main.py`)
   10 dil vardı.
2. **Ses önizleme yok:** Asıl Streamlit panelinde her sesin yanında "Play Voice"
   butonu vardı (`webui/Main.py:1166-1222`), tıklayınca canlı örnek üretip
   çalıyordu. Yeni panelde bu yok.

## Kararlar

- **Dil kapsamı:** ~28 popüler dil, her birinde 2-3 ses. Hepsi
  `azure_voices.json`'da mevcut olduğu doğrulandı.
- **Önizleme kaynağı:** Asıl projedeki gibi **canlı TTS** — tıklayınca backend
  `voice.tts()` ile kısa bir örnek üretir. Önceden dosya/URL yok.
- **TTS köprüsü:** Python FastAPI backend'e senkron bir preview endpoint eklenir;
  Next.js API route bunu proxy'ler.

## Bölüm 1 — Dil & Ses Listesi

**Diller (28):**
`en-US, en-GB, tr-TR, es-ES, es-MX, de-DE, fr-FR, pt-BR, it-IT, ru-RU, ar-SA,
zh-CN, ja-JP, ko-KR, hi-IN, nl-NL, pl-PL, sv-SE, id-ID, vi-VN, th-TH, uk-UA,
ro-RO, el-GR, cs-CZ, he-IL, da-DK, fi-FI, nb-NO, fa-IR`

**Veri modeli (`web/src/lib/jobs/options.ts`):**
- Mevcut düz yapı korunur, genişletilir.
- Ses id formatı mevcut kodla uyumlu kalır: `<locale>-<Name>Neural-<Gender>`
  (ör. `tr-TR-EmelNeural-Female`). `brief-step.tsx`'teki `voiceDisplay()` ve
  dil-değiştirme mantığı bu formatla zaten çalışıyor.
- `LANGUAGES` girişleri `{ code, label }`; `label` yerel ad + bölge
  (ör. "Español (España)", "Português (Brasil)").
- Her ses: `{ id, label, language }`; `language`, `LANGUAGES[].code` ile eşleşir.

**Arayüz uyarlaması (`brief-step.tsx`):**
- **Dil seçimi:** 28 dil için yuvarlak butonlar kalabalık olur → tek bir
  **dropdown/select**. Dil değişince o dilin ilk sesi otomatik seçilir
  (mevcut davranış korunur).
- **Ses seçimi:** Mevcut kart-grid korunur (dil başına 2-3 ses).

## Bölüm 2 — Ses Önizleme (Play butonu)

**Backend — yeni senkron endpoint:**
- `POST /api/v1/voice/preview` (`app/controllers/` altında, mevcut router deseni).
- Body: `{ voice_name, text? }`. `text` yoksa locale → örnek-cümle haritasından
  seçilir; haritada yoksa İngilizce fallback.
- İçeride `voice.tts(voice_name=..., text=..., voice_file=<temp mp3>)` çağrılır
  (asıl `webui/Main.py:1193` ile aynı). `audio/mpeg` döner, temp dosya silinir.
- Sentez başarısızsa asıl projedeki gibi bir kez daha basit İngilizce metinle
  denenir; yine olmazsa 502.
- Küçük bir `locale → örnek cümle` haritası (TR, EN, ES, DE, FR, PT, IT, RU, AR,
  ZH, JA, KO, ... ; kalanlar EN fallback).

**Next.js köprüsü:**
- `web/src/app/api/voice/preview/route.ts` — Python backend'e proxy
  (backend URL env değişkeni, diğer route'lardaki desenle uyumlu).
- Auth zorunlu (giriş yapmış kullanıcı).
- Basit rate-limit (spam sentezi engeller; `rerender` route'undaki Redis
  desenine benzer).
- Backend erişilemezse temiz hata döner; panel çalışmaya devam eder.

**Frontend (`brief-step.tsx`):**
- Her ses kartının sağ üstünde, seçim-noktasının yanında küçük **▶ play butonu**.
- **Play, kartı seçmez** — sadece önizlemeyi çalar (`stopPropagation`). Seçim ve
  önizleme ayrı eylemler.
- Durumlar: idle ▶ → yükleniyor (spinner) → çalıyor (⏸/dalga) → bitince ▶.
- Tek bir paylaşılan `<audio>` elemanı; yeni önizleme öncekini durdurur.
- Hata (backend kapalı vb.): buton kısa süre hata durumu gösterir, panel çökmez.

## Etkilenen dosyalar

- `web/src/lib/jobs/options.ts` — genişletilmiş `LANGUAGES` + `VOICES`.
- `web/src/app/dashboard/create/brief-step.tsx` — dil dropdown, ses kartına
  play butonu, önizleme oynatma mantığı.
- `web/src/app/api/voice/preview/route.ts` — yeni proxy route.
- `app/controllers/...` — yeni `POST /api/v1/voice/preview` endpoint.
- (Muhtemel) `app/services/voice.py` yardımcı örnek-cümle haritası veya
  endpoint içinde inline.

## Kapsam dışı (YAGNI)

- Tüm 137 locale / 331 ses (aranabilir dev liste) — sonraya bırakıldı.
- i18n framework / UI çevirisi (buradaki "dil" yalnızca çıktı/TTS dilidir).
- Önizleme ses dosyalarının önbelleğe alınması — her tık taze sentez (asıl
  proje davranışı).
