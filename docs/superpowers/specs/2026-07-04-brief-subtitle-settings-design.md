# Brief adımında altyazı ayarları + canlı önizleme

**Tarih:** 2026-07-04
**Durum:** Onaylandı, uygulamaya hazır

## Amaç

Video oluşturma sihirbazının **brief** adımına, altyazı (caption) stil ayarlarını
açılır/kapanır (accordion) bir bölüm olarak eklemek; seçilen stili sağdaki
"Your brief" önizleme thumbnail'ında canlı yansıtmak; ve seçilen stili ilk
render'a uçtan uca bağlamak.

Başlangıçta mevcut `DEFAULT_CAPTION_STYLE` uygulanır. Accordion kapalıyken bile
başlıkta aktif ayarın özeti (ör. `M · Bottom · Yellow`) görünür.

## Bağlam: hâlihazırda var olan altyazı altyapısı

Bu özellik yeni bir altyazı sistemi kurmaz. `CaptionStyle` altyapısı repoda tam
mevcuttur ve olduğu gibi yeniden kullanılır:

- `web/src/lib/jobs/scenes.ts`
  - `CaptionStyle` tipi: `{ size: "sm"|"md"|"lg"; position: "top"|"center"|"bottom"; color: "yellow"|"white"|"none" }`
  - `DEFAULT_CAPTION_STYLE = { size:"md", position:"bottom", color:"yellow" }`
  - `sanitizeCaptionStyle(input)` — güvenli doğrulama, geçersizde default'a düşer
  - `engineSubtitleParams(style)` — Python motoruna (VideoParams) eşleme
- `web/src/app/dashboard/videos/[id]/captions/editor.tsx`
  - Render **sonrası** düzenleme editörü. Brief'e koyacağımız kontrollerin
    (Text size S/M/L, Position Top/Center/Bottom, Caption style Yellow/White/Plain)
    ve canlı önizleme mantığının (`previewPos`, `previewColor`, `sizePx`) referansı.
- `web/src/app/api/jobs/[id]/rerender/route.ts`
  - Gelen `captionStyle`'ı `sanitizeCaptionStyle` ile doğrulayıp render'a gönderen
    mevcut desen — `create.ts`'te birebir aynı desen uygulanacak.

Değişimden **önce** eksik olan tek şey: ilk render yolunda kullanıcının stili
seçebileceği bir UI yok ve `create.ts` stili hardcode ediyor
(`create.ts:70` → `scenes.length > 0 ? DEFAULT_CAPTION_STYLE : null`).

## Kararlar (onaylandı)

1. Ortak sunum katmanı paylaşılan modüle çıkarılır (kopyalama değil).
2. Accordion başlığı özet satırı gösterir; varsayılan kapalı, varsayılan stil dolu;
   açılınca güncellenebilir.
3. Brief önizleme thumbnail'ı **konu metnini** seçili altyazı stiliyle gösterir.
4. Stil ilk render'a **uçtan uca** bağlanır (wizard → API → create → engine + DB).

## Bölüm 1 — Ortak modül: `web/src/lib/jobs/caption-ui.ts` (YENİ)

`captions/editor.tsx` içinde bugün lokal duran UI sunum verileri buraya taşınır.
Yalnızca sunum katmanı merkezileşir; iş mantığı (`scenes.ts`) yerinde kalır.

Dışa aktarılanlar:

- `SIZES: { id: CaptionStyle["size"]; label: string; px: number }[]`
  → `[{sm,"S",17},{md,"M",23},{lg,"L",30}]`
- `POSITIONS: { id: CaptionStyle["position"]; label: string }[]`
  → `[{top,"Top"},{center,"Center"},{bottom,"Bottom"}]`
- `COLORS: { id: CaptionStyle["color"]; label: string; swatch: string }[]`
  → `[{yellow,"Yellow","#F4C63A"},{white,"White","#FFFFFF"},{none,"Plain","transparent"}]`
- `SIZE_LABEL: Record<CaptionStyle["size"], "S"|"M"|"L">` ve
  `POSITION_LABEL` / `COLOR_LABEL` — accordion özet satırı için insan-okur etiketler
  (ör. `M · Bottom · Yellow`). `COLOR_LABEL.none = "Plain"`.
- `captionPreviewStyles(style: CaptionStyle): { pos: React.CSSProperties; color: React.CSSProperties; sizePx: number }`
  → bugün editörde satır içi duran `previewPos` / `previewColor` / `sizePx` mantığının
    birebir taşınmış hâli:
  - pos: top→`{top:16}`, center→`{top:"50%",transform:"translateY(-50%)"}`, bottom→`{bottom:60}`
  - color: yellow→`{background:"#F4C63A",color:"#141208"}`, white→`{background:"#fff",color:"#141208"}`,
    none→`{color:"#fff",textShadow:"0 2px 12px rgba(0,0,0,0.65)"}`
  - sizePx: `SIZES.find(...).px ?? 23`

  Not: brief thumbnail'ı editörden küçüktür; `captionPreviewStyles` **editör
  ölçekli** değerleri döndürür (davranış korunur), brief bileşeni bu piksel
  değerlerini kendi küçük thumbnail'ına oranlayarak (ör. `sizePx * 0.42`) uygular.
  Oranlama brief bileşeninde kalır, modül nötr kalır.

`captions/editor.tsx` refactor'u: lokal `SIZES`/`POSITIONS`/`COLORS` ve satır içi
`previewPos`/`previewColor`/`sizePx` silinir; `caption-ui.ts`'ten import edilir.
**Görsel/davranışsal çıktı değişmez** — bu, refactor'un doğruluk kriteridir.

## Bölüm 2 — Brief accordion bileşeni: `web/src/app/dashboard/create/subtitle-settings.tsx` (YENİ)

Kendi kendine yeten, kontrollü (controlled) bileşen. Props:

```ts
{
  value: CaptionStyle;
  onChange: (patch: Partial<CaptionStyle>) => void;
}
```

Davranış:

- Katlanır başlık (varsayılan **kapalı**). Sol: "Subtitles". Sağ: özet satırı
  `SIZE_LABEL · POSITION_LABEL · COLOR_LABEL` (ör. `M · Bottom · Yellow`),
  `font-mono-data` küçük stil, `text-muted`. Sol başta `▸`/`▾` disclosure ikonu.
- Açık durum bileşenin kendi `useState`'inde tutulur (wizard state'ini kirletmez).
- Açıkken üç kontrol grubu, `captions/editor.tsx`'teki segment/çip görünümüyle
  birebir aynı sınıflar (aktif = `bg-caption text-caption-ink`):
  - **Text size** — `SIZES` segmenti
  - **Position** — `POSITIONS` segmenti
  - **Caption style** — `COLORS` çipleri (swatch + etiket)
- Her tık `onChange({ ...tekAlan })` çağırır; kaynak `caption-ui.ts` sabitleri.
- Brief kartında **Format** bölümünün altına yerleştirilir (mevcut `my-6 h-px`
  ayraç deseniyle ayrılır).

## Bölüm 3 — Wizard + BriefStep entegrasyonu

`web/src/app/dashboard/create/wizard.tsx`:

- `import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from "@/lib/jobs/scenes"`
- Yeni state: `const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(DEFAULT_CAPTION_STYLE)`
- `createJob()` POST gövdesine `captionStyle` eklenir.
- `BriefStep`'e `captionStyle` ve `onCaptionChange` props geçirilir.

`web/src/app/dashboard/create/brief-step.tsx`:

- `BriefStep` props'una eklenir:
  `captionStyle: CaptionStyle` ve `onCaptionChange: (patch: Partial<CaptionStyle>) => void`.
- Format kartının altına `<SubtitleSettings value={captionStyle} onChange={onCaptionChange} />`.
- Sağ "Your brief" önizleme thumbnail'ı güncellenir:
  - Metin, `values.subject.trim() || "Your topic here"` kalır (konu metni — karar 3A).
  - Konumlanma + renk + boyut `captionPreviewStyles(captionStyle)` ile uygulanır
    (brief thumbnail ölçeğine oranlanmış `sizePx`).
  - `color:"none"` (Plain) → arka plansız, gölgeli beyaz metin (editördeki gibi).
- Özet listesine yeni satır: `Subtitles` → `M · Bottom · Yellow` etiketi
  (Length/Language/Voice/Format satırlarıyla aynı stilde).

`BriefValues` tipi **değişmez** — captionStyle ayrı prop olarak akar (aspect/voice
gibi brief alanlarından ayrı bir endişe; wizard state'inde bağımsız tutulur).

## Bölüm 4 — Backend uçtan uca bağlama

`web/src/app/api/jobs/route.ts`:

- POST gövdesinden `captionStyle: body.captionStyle` okunup `createVideoJob` input'una geçirilir
  (ham; doğrulama create içinde).

`web/src/lib/jobs/create.ts`:

- `import { sanitizeCaptionStyle }` (zaten `scenes` importları var).
- Input tipine `captionStyle?: unknown` eklenir.
- `create.ts:70` değişir:
  ```ts
  const captionStyle =
    scenes.length > 0 ? sanitizeCaptionStyle(input.captionStyle) : null;
  ```
  `sanitizeCaptionStyle` geçersiz/eksik girdide zaten `DEFAULT_CAPTION_STYLE`'a
  düşer, dolayısıyla eski davranış (default) korunur; geçerli girdi artık geçer.
- Aşağıdaki `spendCreditsForJob` (DB'ye `captionStyle` yazar) ve `engineSubtitleParams`
  çağrıları zaten `captionStyle` değişkenini kullanıyor — ek değişiklik gerekmez.

Sonuç: kullanıcının brief'te seçtiği stil hem DB'ye kaydedilir (render sonrası
`captions/editor.tsx` bunu okuyup düzenleyebilir) hem de ilk render'a gider.
Rerender yolu zaten aynı `sanitizeCaptionStyle` desenini kullandığından tutarlıdır.

## Test stratejisi

- **caption-ui.ts:** `captionPreviewStyles` üç renk/üç pozisyon/üç boyut için
  beklenen CSS + px döndürür (birim test).
- **captions/editor.tsx regression:** refactor sonrası aynı sabitler/önizleme;
  mevcut editör davranışı bozulmaz (mevcut testler yeşil kalmalı).
- **create.ts:** geçerli `captionStyle` girdisiyle iş kaydında ve enqueue
  payload'ında (`engineSubtitleParams`) doğru değerlerin göründüğü; geçersiz/eksik
  girdide `DEFAULT_CAPTION_STYLE`'a düştüğü hermetik test.
- **Canlı test:** sihirbazdan altyazı stili seçip önizlemenin değiştiğini ve
  render çıktısında stilin uygulandığını manuel doğrula (kullanıcı yapacak).

## Kapsam dışı (YAGNI)

- Yeni renk/boyut/pozisyon seçenekleri eklemek.
- Font ailesi / stroke / outline gibi yeni altyazı eksenleri.
- Sahne-bazlı per-caption stil (stil tüm videoya uygulanır, mevcut model korunur).
- `scenes.length === 0` (sahnesiz) yolunda altyazı — bu yolda captionStyle `null`
  kalır, mevcut davranış korunur.
