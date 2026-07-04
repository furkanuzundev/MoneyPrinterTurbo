# Dil ve Süre Düzeltmeleri — Tasarım

**Tarih:** 2026-07-03
**Kapsam:** Create wizard'da iki belirgin hata (dil + süre/fiyat)

## Sorunlar (Kullanıcı Tarafından Gözlemlenmiş)

1. **Caption/script yanlış dilde:** Kullanıcı "Türkçe" seçiyor ama üretilen
   caption ve voiceover İngilizce çıkıyor. Dropdown 28+ dil gösteriyor.

2. **Süre/fiyat seçilen hedefi yansıtmıyor:** Kullanıcı 60s (1 dakika)
   seçiyor ama Script ve Render ekranları "~0:36" gösteriyor; maliyet de
   üretilen script kelime sayısından hesaplanıyor.

## Kök Nedenler

### Bug A — Dil
- `web/src/app/api/script/route.ts:36`:
  `const language = ["en", "tr"].includes(body.language) ? body.language : "en";`
  UI dil kodu `tr-TR` (options.ts), bu liste sadece `en`/`tr` kısa kodlarını
  kabul ediyor → sessizce `"en"`e düşüyor. Dil listesi 28'e genişletildiğinde
  (commit 4f87da7) bu route güncellenmemiş.
- `web/src/lib/script/generate.ts`: `LANGUAGE_NAMES = { en, tr }` — sadece iki
  dil adı. `tr-TR` gibi tam kodlar burada da "English"e düşer.

### Bug B — Süre/fiyat
Süre ve fiyat, seçilen `targetSeconds` yerine üretilen script'in gerçek
kelime sayısından hesaplanıyor:
- `web/src/app/dashboard/create/script-step.tsx:36-37`
- `web/src/app/dashboard/create/wizard.tsx:38, 175`
LLM hedeften kısa üretince süre "~0:36" ve fiyat düşük görünüyor.

## Çözüm

### Bug A — Tüm locale kodlarını tanı
- `route.ts`: `["en","tr"]` beyaz listesi yerine, `body.language`'ı
  `options.ts`'teki `LANGUAGES` kod listesine göre doğrula; geçerliyse aynen
  geçir, değilse `"en-US"`e düş.
- `generate.ts`: `LANGUAGE_NAMES` haritasını tüm 30 locale kodunu kapsayacak
  şekilde genişlet (kod → İngilizce dil adı, ör. `"tr-TR" → "Turkish"`).
  Prompt'ta dil adı bu haritadan gelir. Bilinmeyen kod → "English" fallback
  korunur (savunmacı).

### Bug B — Seçilen hedef süre esas (gösterim + backend tutarlı)

Kritik: backend `create.ts:59` de krediyi `estimateDurationSeconds(script)`'ten
hesaplıyor ve `jobs/route.ts` client'ın `targetSeconds`'ını backend'e hiç
göndermiyor. Sadece gösterimi düzeltmek, gösterilen kredi ile gerçekte
düşülen krediyi ayrıştırır. Bu yüzden hem gösterim hem backend hedefe hizalanır.

**Gösterim (wizard/script-step):**
- `estimateDurationSeconds(script)` çağrıları süre GÖSTERİMİNDE
  `formatDuration(targetSeconds)` ile değiştirilir.
- Kredi gösterimi `creditsForDuration(targetSeconds)` olur.
- `ScriptStep` yeni bir `targetSeconds: number` prop'u alır; `Wizard` bunu
  `brief.targetSeconds`'tan geçirir.

**Backend (kredi otoritesi):**
- `jobs/route.ts` istek gövdesinden `targetSeconds`'ı okuyup (30/60/90/180
  beyaz listesi, aksi halde 60) `createVideoJob` input'una ekler.
- `wizard.tsx` job POST gövdesine `targetSeconds: brief.targetSeconds` ekler.
- `create.ts` `input.targetSeconds`'ı alır; `estimateDurationSeconds(script)`
  yerine bunu kullanır. Kredi = `creditsForDuration(input.targetSeconds)`.
- `estimateDurationSeconds` fonksiyonu KALIR (başka kullanımı olabilir), ama
  create.ts artık onu kredi için çağırmaz.

Sonuç: kullanıcı 60s seçince gösterim "~1:00" + 2 kredi, ve backend gerçekten
2 kredi düşer — tam tutarlı.

## Test Stratejisi

- **Bug A (generate.ts, saf birim):** `buildScenesPrompt("x","tr-TR",60)`
  çıktısı "Language: Turkish" içermeli, "English" değil. Birkaç locale için
  (es-ES→Spanish, ja-JP→Japanese) parametrik doğrulama.
- **Bug A (route, birim):** dil doğrulama saf fonksiyona çıkarılırsa test
  edilir; aksi halde generate.test kapsamı yeterli + route'ta minimal
  değişiklik.
- **Bug B backend (create.ts, integration):** Mevcut `create.test.ts` DB+Redis
  destekli. Yeni test: verilen `targetSeconds` (ör. 180) ile job oluşturulunca
  enqueue edilen/DB'ye yazılan kredi `creditsForDuration(180)===6` olur —
  script uzunluğundan bağımsız. Kısa script + targetSeconds=180 → 6 kredi
  (eski davranışta script'ten ~1-2 kredi çıkardı). `payload.params` ve dönen
  `credits` doğrulanır.
- **Bug B gösterim (wizard/script-step):** prop-threading değişikliği; component
  testi yoksa `tsc` + manuel doğrulama. `estimateDurationSeconds`'ın artık
  gösterim yolunda import/çağrılmadığı gözle doğrulanır.

## Kapsam Dışı
- Backend create.ts süre/fiyat otoritesinin yeniden düzenlenmesi (ayrı iş).
- LLM'i hedef kelime sayısına zorlama (kullanıcı gösterim-hedef yolunu seçti).
- Dropdown'daki dillerin backend TTS ses eşleşmesi (zaten 30/30 mevcut).
