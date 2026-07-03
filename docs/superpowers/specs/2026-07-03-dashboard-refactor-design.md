# Dashboard Full Refactor — docs/dashboard.html mockup'ına göre (TAM MOCKUP)

## Context

Landing (041bf2d) ve sign-in (698b0da) yeni tasarıma taşındı. Sırada dashboard'ın tamamı var. `docs/dashboard.html` mockup'ı (aynı bundle formatı; template çıkarma yöntemi aynı) yalnızca görsel değil **işlevsel** yenilikler de içeriyor ve kullanıcı TAM MOCKUP kapsamını seçti:

- Yeni shell (sidebar: logo, menü, Credits kartı + "Buy more", kullanıcı satırı + sign-out; topbar: breadcrumb, kredi pili, "+ Create video")
- Home: welcome başlığı, 3 stat kartı, 4 kolonlu video thumbnail grid'i, boş durum
- Create wizard: 4 adım (Brief → Script → Render → Done), adım göstergesi, kredi-yok uyarı bandı
- **Sahne bazlı script** (HOOK/SCENE/CTA kartları: ekran yazısı + voiceover ayrımı)
- Library: filtre sekmeleri (All/Ready/Processing) + thumbnail grid
- Buy: bakiye banner'ı + özellik listeli paket kartları
- **Video detay modal'ı**: player, Download, Edit captions, Post to, **Delete**
- **Caption editörü**: sahne başına metin + boyut/pozisyon/renk, canlı önizleme, **ücretsiz re-render** (kullanıcı kararı: kredi harcamaz, saatlik rate limit)

## Mevcut durum (keşif özetleri)

**Web:** `web/src/app/dashboard/` — layout.tsx(51) shadcn sidebar shell; page.tsx(146) home; create/wizard.tsx(240) 2-fazlı form; library/page.tsx(73); jobs/[id]/progress.tsx(80) SSE; buy/*. `components/app-sidebar.tsx`(82), `components/job-row.tsx`(53). Token'lar globals.css'te zaten yeni palette.

**Script:** `web/src/app/api/script/route.ts` → `lib/script/generate.ts` (OpenAI gpt-4o-mini; düz prose script + 5 terim; sahne yapısı YOK).

**DB `videoJobs`** (`web/src/db/schema.ts:94-115`): id, userId, subject, script, terms(jsonb), aspect, voice, targetSeconds, credits, status(queued|script|downloading|rendering|done|failed), outputPath, error, timestamps. Sahne/stil kolonu yok.

**Worker:** `worker/main.py` Redis `reelate:queue:pending`'den `{task_id, params}` çekip `app/services/task.py:start` çağırır. Pipeline: TTS→`audio.mp3`, altyazı→`subtitle.srt` (script cümlelere bölünüp süre karakter oranıyla dağıtılır, `app/services/voice.py:493-561`), footage indirme, `combined-{n}.mp4` (altyazısız), `generate_video` ile altyazı yakma→`final-{n}.mp4`. **Tüm ara ürünler `storage/tasks/<id>/` altında saklanıyor** → altyazı-yalnız re-render mümkün: `combined-1.mp4` + yeni SRT → sadece `video.generate_video`.

**Altyazı stil paramları zaten var** (`app/models/schema.py` VideoParams): subtitle_position(top/bottom/center/custom), font_size, text_fore_color, text_background_color, stroke_*. Web bugün hiçbirini göndermiyor (`web/src/lib/jobs/queue.ts` EngineParams).

**Krediler** (`web/src/lib/credits/ledger.ts`): spend tx'i `spendCreditsForJob`; refund idempotent (`refundJob`, partial unique index); kural: önce iade sonra terminal işaret. Re-render kavramı yok → ücretsiz olacak.

**SSE** (`api/jobs/[id]/events`): 2sn poll, `{status, progress, stage, error, queueDepth?, etaSeconds?}`; stage etiketi progress eşiğinden türetiliyor (`lib/jobs/status.ts:27`).

**Delete yok** (web'de). Python FastAPI'de var ama ayrı sistem. Silme: DB satırı + `STORAGE_ROOT/tasks/<id>/` + Redis hash & sentinel; ledger satırları denetim için KALIR (FK yok).

## Kullanıcı kararları

1. **Tam mockup** — sahne bazlı script, caption editörü, re-render, delete, modal, post-to dahil.
2. **Re-render ücretsiz** — kredi harcamaz; Redis saatlik rate limit (10/saat/kullanıcı).

## Faz planı (her faz: uygula → doğrula → commit)

### Faz A — Shell + Home + Library + Buy + Modal + Delete

**Dosyalar:**
```
web/src/app/dashboard/layout.tsx        → topbar yenilenir: "Reelate / {route}" breadcrumb, kredi pili, "+ Create video" butonu
web/src/components/app-sidebar.tsx      → mockup düzeni: logo (R karesi), MENU başlığı, 4 nav, Credits kartı (bakiye + Buy more), kullanıcı satırı (avatar harfi, ad, e-posta, sign-out ikonu). shadcn sidebar primitifleri korunur.
web/src/components/dashboard/video-card.tsx  → YENİ: 9:16 kart — done ise <video preload="metadata" muted> (src /api/videos/[id]) küçük önizleme; processing ise çizgili placeholder + ping. fmt/süre chip'leri, başlık (2 satır clamp), zaman + durum rozeti. Tıklama: done → modal, processing → /dashboard/jobs/[id].
web/src/components/dashboard/video-modal.tsx → YENİ (client): gerçek <video controls>, Download MP4, ✎ Captions (→ /dashboard/videos/[id]/captions, Faz C'de aktif), Post to (TikTok/YouTube/IG upload sayfalarını yeni sekmede açar), 🗑 Delete (confirm + DELETE api + router.refresh)
web/src/app/dashboard/page.tsx          → welcome başlığı (session.user.name), 3 stat kartı (Credits left gradient'li, Videos created, In progress), Recent videos grid'i (son 4, VideoCard), boş durum (dashed kart)
web/src/app/dashboard/library/page.tsx  → başlık + sayaçlar; filtre sekmeleri (client alt bileşen, URL'siz state); VideoCard grid'i; boş durum
web/src/app/dashboard/buy/page.tsx      → bakiye banner'ı (◆ ikon, Current balance); paket kartları mockup düzeninde — özellik satırları GERÇEK özelliklerle (All voices & languages / All formats / Watermark-free; sahte "Brand kit/API access" YAZILMAZ), save % landing'deki hesapla (lib/credits/packages.ts verisi)
web/src/app/api/jobs/[id]/route.ts      → YENİ DELETE: auth+ownership; yalnız terminal (done/failed) silinir; fs.rm(STORAGE_ROOT/tasks/<id>, recursive, force), DB satırı silinir, Redis hash <id> + reelate:queue:seen:<id> silinir; ledger dokunulmaz
web/src/components/job-row.tsx          → kullanım kalmayınca silinir (home+library grid'e geçiyor)
```
Süre gösterimi: `targetSeconds` → `m:ss`. `components/ui.tsx`'e dokunulmaz.

### Faz B — Create wizard (4 adım) + sahne bazlı script

**Script API:**
```
web/src/lib/script/generate.ts   → generateScenesAndTerms: tek LLM çağrısıyla JSON {scenes:[{tag:'HOOK'|'SCENE'|'CTA', caption, voiceover}], terms[]}; toleranslı parse + düz-metin fallback (parse başarısızsa eski davranış: tek sahne). script metni = voiceover'ların birleşimi (süre tahmini `estimateDurationSeconds` aynen çalışır).
web/src/app/api/script/route.ts  → yanıt {scenes, script, terms}
```
**DB:** `videoJobs`'a `scenes` jsonb nullable + `captionStyle` jsonb nullable (drizzle migration: `npm run db:generate && db:migrate`).

**Wizard** (`app/dashboard/create/` altında yeniden yazılır, adım bileşenlerine bölünür):
- Adım göstergesi (Brief/Script/Render/Done) + "costs N credit" (pricing.ts).
- Kredi 0 ise üstte uyarı bandı (mockup'taki gibi; script taslağı serbest, render kilitli).
- **Step 1 Brief:** konu textarea'sı; Length segmented (mevcut DURATION_OPTIONS: 30/60/90/180 — mockup'ın 45s'i YOK, fiyatlama değişmez); Language chip'leri (EN/TR); Voice kartları (mevcut VOICES, dile göre filtre); Format kartları (ASPECTS, oran ikonu). Sağda sticky özet paneli: mini telefon önizleme (konu başlığı), Length/Language/Voice/Format satırları, "Generate script with AI" (ücretsiz notu).
- **Step 2 Script:** sahne kartları (tag rozeti sarı, caption başlık, 🎙 voiceover; her ikisi de düzenlenebilir inline textarea), ↻ Regenerate. Sağda "Ready to render" paneli: Scenes/Voice/Format/Est. duration + "Cost to render N credit" kutusu + "Generate video →" (yetersizse "Need N more credits — Buy" → /dashboard/buy) + "← Back to brief".
- **Step 3 Render:** job `POST /api/jobs` (payload + scenes) sonrası wizard içinde kalır; SSE (`/api/jobs/{id}/events`) ile shimmer telefon (`● RENDERING · %`), progress bar, 5 aşamalı checklist. `lib/jobs/status.ts:stageForProgress` 5 etikete genişletilir (Writing the script / Generating voiceover / Matching stock footage / Burning in captions / Rendering your short — eşikler: <15/<35/<60/<90/≤100).
- **Step 4 Done:** rePop animasyonlu telefonda gerçek video (`/api/videos/{id}`), ✓ RENDER COMPLETE rozeti, başlık, ↓ Download MP4, ✎ Edit captions (Faz C), Post to chip'leri, Format/Duration/Credits-left şeridi, + Create another / Go to library.
- `/dashboard/jobs/[id]` sayfası kalır (library'den processing tıklaması + eski linkler): aynı Render/Done bileşenlerini kullanarak yeniden stillenir.

**Worker (sahne altyazıları):**
```
app/models/schema.py   → VideoParams'a scenes: Optional[list[{caption, voiceover}]]
app/services/task.py   → scenes varsa: video_script = voiceover'ların join'i; generate_subtitle yerine sahne bazlı SRT: her sahneye süre = voiceover karakter payı × audio_duration (voice.py'daki mevcut oransal teknik yeniden kullanılır), satır metni = caption
web/src/lib/jobs/queue.ts → EngineParams'a scenes + caption stil alanları (subtitle_position, font_size, text_fore_color, text_background_color) eklenir; create.ts payload'a geçirir
```

### Faz C — Caption editörü + ücretsiz re-render

```
web/src/app/dashboard/videos/[id]/captions/page.tsx → YENİ route (server: job+ownership) + client editör: solda canlı önizleme telefonu (seçili sahnenin caption'ı, stil uygulanmış), sağda: caption textarea, Text size (sm/md/lg), Position (top/center/bottom), Caption style (yellow/white/none), sahne listesi, "Save & re-render" / Cancel
web/src/app/api/jobs/[id]/rerender/route.ts → YENİ POST: auth+ownership, yalnız status done, Redis saatlik rate limit reelate:ratelimit:rerender:<userId>:<hour> (10/saat, fail-closed), DB'de scenes+captionStyle güncelle, status=rendering + progress sıfırla, kuyruğa {type:'rerender', task_id, params:{scenes, caption_style}} bırak. KREDİ HARCANMAZ.
worker/main.py + app/services/task.py → 'rerender' mesaj tipi: storage/tasks/<id>/combined-1.mp4 + audio.mp3 mevcutsa → yeni SRT üret (sahne oransal timing; audio süresi audio.mp3'ten), video.generate_video ile final-1.mp4 ÜZERİNE yaz (outputPath değişmez), Redis progress/complete güncelle. combined yoksa terminal hata "source expired".
```
Stil eşlemesi: size sm/md/lg → font_size 44/60/76; position → subtitle_position; color yellow → text_fore_color #141208 + text_background_color '#F4C63A', white → bg '#FFFFFF', none → fore #FFFFFF bg False.

Modal ve wizard Step 4'teki "Edit captions" linkleri bu route'a bağlanır (Faz A/B'de disabled/tooltip ile gelir, C'de açılır).

## Değişmeyenler

- Fiyatlama/kredi tarifeleri, paket verisi, Stripe akışı, auth, SSE mimarisi (poll), `components/ui.tsx`.
- Süre seçenekleri 30/60/90/180 kalır (mockup'taki 45s ve sahte dil/ses seçenekleri alınmaz; gerçek EN/TR + 5 ses).

## Doğrulama (her fazda)

1. `npm run build` (dev server KAPALIYKEN — build dev'in .next'ini bozuyor), `npm run lint`, `npm test`.
2. Dev ortam: reelate-postgres(5434) + reelate-redis konteynerleri, `npm run dev`, worker `uv run python -m worker.main`. Faz B/C migration: `npm run db:migrate`.
3. Headless Chrome/CDP: her ekran masaüstü + 390px (scrollWidth kontrolü); Home/Library/Buy/Create adımları/Modal/Caption editörü ekran görüntüleri mockup'la kıyas.
4. Gerçek uçtan uca (Faz B): dev'de 30s'lik job üret (OPENAI key .env'de) → wizard Step 3 SSE ilerleme → Step 4'te video oynat + indir. Faz C: caption düzenle → re-render → yeni final-1.mp4'te değişikliği gör; kredi bakiyesinin DEĞİŞMEDİĞİNİ doğrula. Faz A: delete → satır + storage klasörü gitti, ledger duruyor.
5. Spec `docs/superpowers/specs/2026-07-03-dashboard-refactor-design.md` olarak commit edilir; her faz ayrı commit.
