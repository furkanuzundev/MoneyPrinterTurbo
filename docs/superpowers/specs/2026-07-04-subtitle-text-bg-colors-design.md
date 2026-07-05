# Altyazı metin + arka plan renk seçimi (preset + palet)

**Tarih:** 2026-07-04
**Durum:** Onaylandı, uygulamaya hazır
**Önceki iş:** [2026-07-04-brief-subtitle-settings-design.md] üzerine kurulur
(brief accordion + canlı önizleme + uçtan uca bağlama zaten mevcut).

## Amaç

Altyazı stilinden tek-eksenli "Caption style" (yellow/white/none kutu preset'i)
**kaldırılır**; yerine ana MoneyPrinterTurbo sürümündeki gibi iki bağımsız renk
ekseni gelir:

- **Text color** — altyazı metni rengi. 5 preset + serbest palet. Engine
  `text_fore_color`.
- **Background color** — altyazı arka plan (kutu) rengi. 5 preset + serbest
  palet + **"None"** (şeffaf). Engine `text_background_color`
  (`none` → `false`).

Her iki eksen brief accordion'unda ve render-sonrası captions editöründe
gösterilir; canlı önizlemeye yansır; uçtan uca render'a gider.

## Bağlam: engine sözleşmesi (doğrulandı)

`app/models/schema.py` VideoParams:
- `text_fore_color: Optional[str] = "#FFFFFF"` — metin rengi (hex).
- `text_background_color: Union[bool, str] = True` — arka plan; hex string ise
  o renk, `False` ise şeffaf.
- `app/services/video.py:959-961`: bool ise `True→#000000 / False→şeffaf`,
  string ise doğrudan hex. Bizim eşlememiz `none → false`, hex → o renk;
  bu sözleşmeyle birebir uyumlu.

Ana sürüm webUI (`webui/Main.py:1511-1549`): `text_fore_color` bir
`st.color_picker`; arka plan bir "enable" toggle + `color_picker`, kapalıysa
`text_background_color = False`. Biz "enable toggle"ı **background ekseninde
'None' seçeneği** olarak sadeleştiriyoruz (tek karar, daha az UI).

## Veri modeli değişimi

### `web/src/lib/jobs/scenes.ts`

`CaptionStyle`:
```ts
export type CaptionStyle = {
  size: "sm" | "md" | "lg";
  position: "top" | "center" | "bottom";
  textColor: string;          // hex "#RRGGBB" — engine text_fore_color
  bgColor: string | "none";   // hex "#RRGGBB" ya da "none" — engine text_background_color
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  size: "md",
  position: "bottom",
  textColor: "#141208",   // koyu metin (eski yellow preset'inin fore rengi)
  bgColor: "#F4C63A",     // sarı kutu (eski "yellow" varsayılanının görsel eşdeğeri)
};
```

`color` alanı tamamen kalkar.

**`sanitizeCaptionStyle` (doğrulama + geriye uyum, trust boundary):**
- `size` / `position` — mevcut whitelist mantığı korunur.
- `textColor` — `normalizeHex(input)` ile doğrulanır; geçersizse
  `DEFAULT_CAPTION_STYLE.textColor`.
- `bgColor` — `"none"` ise aynen kalır; değilse `normalizeHex`; geçersizse
  `DEFAULT_CAPTION_STYLE.bgColor`.
- **Geriye uyum (Karar A):** girdi eski `color` alanını içeriyorsa
  (`textColor`/`bgColor` yoksa ama `color` varsa) eski→yeni eşlemesi uygulanır:
  - `yellow → { textColor:"#141208", bgColor:"#F4C63A" }`
  - `white  → { textColor:"#141208", bgColor:"#FFFFFF" }`
  - `none   → { textColor:"#FFFFFF", bgColor:"none" }`
  Böylece DB'deki eski jsonb kayıtları (üretimde render edilmiş işler)
  re-render/okuma anında sorunsuz yeni modele çevrilir; DB backfill gerekmez.

**`normalizeHex(input: unknown): string | null` (yeni yardımcı, scenes.ts):**
- String değilse `null`.
- `#` opsiyonel önek kabul, `^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$` eşleşmezse
  `null`.
- 3-hane ise 6-haneye genişlet(`#abc → #aabbcc`).
- Sonuç her zaman büyük harf `#RRGGBB` döner.
- Not: `normalizeHex` çıktısı null olduğunda çağıran tarafta default'a düşülür
  (sanitizeCaptionStyle içinde), null'ı doğrudan modele yazmayız.

**`engineSubtitleParams`:** `colorMap` kaldırılır:
```ts
export function engineSubtitleParams(style: CaptionStyle): {
  subtitle_position: string;
  font_size: number;
  text_fore_color: string;
  text_background_color: boolean | string;
} {
  const font_size = { sm: 44, md: 60, lg: 76 }[style.size];
  return {
    subtitle_position: style.position,
    font_size,
    text_fore_color: style.textColor,
    text_background_color: style.bgColor === "none" ? false : style.bgColor,
  };
}
```

### `web/src/db/schema.ts`

`captionStyle` jsonb `$type` güncellenir:
```ts
captionStyle: jsonb("caption_style").$type<{
  size: "sm" | "md" | "lg";
  position: "top" | "center" | "bottom";
  textColor: string;
  bgColor: string;
}>(),
```
(Yalnızca TS tipi; jsonb şeması esnek olduğundan DB migration gerekmez. Eski
satırlar okuma anında sanitizeCaptionStyle ile çevrilir.)

### `web/src/lib/credits/ledger.ts`

`spendCreditsForJob` içindeki inline captionStyle tipi (satır ~49-53) aynı
şekilde `color` yerine `textColor: string; bgColor: string` olur. Bu fonksiyon
captionStyle'ı DB'ye yazarken tip uyumu için.

## `web/src/lib/jobs/caption-ui.ts` — renk preset'leri + önizleme

`COLORS` (tek eksenli kutu preset'i) ve `COLOR_LABEL` **kaldırılır**. Yerine:

```ts
export const TEXT_COLOR_PRESETS: { label: string; hex: string }[] = [
  { label: "White", hex: "#FFFFFF" },
  { label: "Black", hex: "#141208" },
  { label: "Yellow", hex: "#F4C63A" },
  { label: "Red", hex: "#E5484D" },
  { label: "Cyan", hex: "#33C9D6" },
];

export const BG_COLOR_PRESETS: { label: string; hex: string | "none" }[] = [
  { label: "None", hex: "none" },
  { label: "Yellow", hex: "#F4C63A" },
  { label: "White", hex: "#FFFFFF" },
  { label: "Black", hex: "#141208" },
  { label: "Blue", hex: "#2B6CF4" },
];
```

**`captionPreviewStyles`** artık `style.textColor` / `style.bgColor`'dan türetir:
```ts
export function captionPreviewStyles(style: CaptionStyle): {
  pos: CSSProperties;
  color: CSSProperties;
  sizePx: number;
} {
  const pos = /* mevcut top/center/bottom mantığı, değişmez */;
  const color: CSSProperties =
    style.bgColor === "none"
      ? { color: style.textColor, textShadow: "0 2px 12px rgba(0,0,0,0.65)" }
      : { color: style.textColor, background: style.bgColor };
  const sizePx = SIZES.find((s) => s.id === style.size)?.px ?? 23;
  return { pos, color, sizePx };
}
```
(none → gölgeli metin, arka plansız; aksi halde metin + arka plan kutusu.
`SIZES`/`POSITIONS` değişmez.)

**Yeni yardımcı — özet etiketi için renk adı çözümü:**
```ts
// Bir hex/none değeri için insan-okur kısa etiket; preset ise adı, değilse
// hex'in kendisi (palet seçimi). Özet satırında kullanılır.
export function colorLabel(
  value: string,
  presets: { label: string; hex: string | "none" }[],
): string {
  return presets.find((p) => p.hex.toLowerCase() === value.toLowerCase())?.label ?? value;
}
```

## `web/src/app/dashboard/create/subtitle-settings.tsx` — iki renk ekseni

Mevcut Text size + Position segmentleri korunur. Tek "Caption style" renk çip
bloğu **iki renk eksenine** dönüşür. Her eksen ortak, paylaşılan bir client
bileşeni kullanır: **`web/src/components/subtitle/color-axis.tsx`** (yeni).
Hem bu dosya hem render-sonrası editör buradan import eder — tek doğruluk
kaynağı, çift bakım yok.

**`ColorAxis` (paylaşılan bileşen, `components/subtitle/color-axis.tsx`):**
```ts
function ColorAxis({
  label,          // "Text color" | "Background color"
  presets,        // TEXT_COLOR_PRESETS | BG_COLOR_PRESETS
  value,          // seçili hex | "none"
  onChange,       // (hex|"none") => void
  allowNone,      // bg için true: "None" preset'i şeffaf swatch olarak
}: {...})
```
- Preset'ler yuvarlak swatch düğmeleri (seçili = `border-caption` halka).
  `hex === "none"` → çapraz çizgili/şeffaf swatch.
- Sonda bir **palet düğmesi**: native `<input type="color">` sarmalayan küçük
  bir kare (renk çarkı ikonu). `onChange(e.target.value.toUpperCase())`.
  Palet değeri preset'lerden birine eşitse o preset seçili görünür; değilse
  palet düğmesi "aktif" görünür ve mevcut hex'i swatch olarak gösterir.
- `<input type="color">` "none" veremez; bu yüzden "None" yalnızca bg
  preset'lerinde bir düğme olarak sunulur, palet değil.

`SubtitleSettings` iki `ColorAxis` render eder:
- Text color: `presets={TEXT_COLOR_PRESETS}` `value={value.textColor}`
  `onChange={(hex) => onChange({ textColor: hex })}` `allowNone={false}`.
- Background color: `presets={BG_COLOR_PRESETS}` `value={value.bgColor}`
  `onChange={(v) => onChange({ bgColor: v })}` `allowNone` (None preset dahil).

**Özet satırı** (accordion başlığı, kapalıyken):
`${SIZE_LABEL[size]} · ${POSITION_LABEL[position]} · T:${colorLabel(textColor, TEXT_COLOR_PRESETS)} · BG:${colorLabel(bgColor, BG_COLOR_PRESETS)}`
Örnek: `M · Bottom · T:Black · BG:Yellow`.

## `web/src/app/dashboard/create/brief-step.tsx`

- `COLOR_LABEL` importu kaldırılır; `colorLabel`, `TEXT_COLOR_PRESETS`,
  `BG_COLOR_PRESETS` eklenir.
- Sağ "Your brief" önizleme thumbnail'ı `captionPreviewStyles(captionStyle)`'ı
  zaten kullanıyor; imza aynı kaldığı için otomatik doğru render eder
  (textColor + bgColor). Değişiklik yok.
- Özet satırı (summary row) yeni formata güncellenir:
  `Subtitles` → `${SIZE_LABEL} · ${POSITION_LABEL} · T:${colorLabel(...)} · BG:${colorLabel(...)}`.

## `web/src/app/dashboard/videos/[id]/captions/editor.tsx`

Render-sonrası editör de aynı iki renk eksenini kullanır (tutarlılık).
- `COLORS` importu kaldırılır; editör paylaşılan `ColorAxis`
  (`@/components/subtitle/color-axis`) bileşenini text + bg için iki kez
  render eder — `subtitle-settings.tsx` ile aynı bileşen.
- Editör önizlemesi (`previewColor` = `captionPreviewStyles(style).color`)
  imza değişmediği için otomatik doğru render eder.
- Editörün `setStyle({ ...style, color: c.id })` çağrıları
  `setStyle({ ...style, textColor })` / `setStyle({ ...style, bgColor })` olur.
- Editörün `initialStyle` prop'u DB'den gelen (olası eski formatlı) captionStyle;
  `captions/page.tsx` bunu `sanitizeCaptionStyle` ile geçirmeli (eski→yeni
  migrasyon okuma anında burada da uygulansın). Mevcut
  `job.captionStyle ?? DEFAULT_CAPTION_STYLE` → `sanitizeCaptionStyle(job.captionStyle ?? DEFAULT_CAPTION_STYLE)`.

## Test stratejisi

- **caption-ui.test.ts (güncelle):** eski `COLORS`/`COLOR_LABEL` ve
  `color:"yellow"` içeren `captionPreviewStyles` testleri **yeni modele**
  yazılır:
  - `TEXT_COLOR_PRESETS` / `BG_COLOR_PRESETS` beklenen id/hex listeleri.
  - `captionPreviewStyles` — `bgColor:"none"` → `{color, textShadow}`
    (arka plansız); `bgColor:"#F4C63A"` → `{color, background:"#F4C63A"}`.
    `sizePx` sm/lg. `pos` top/center/bottom (değişmez).
  - `colorLabel` — preset eşleşmesi adı, palet hex'i kendisini döner.
- **scenes.ts için yeni birim test (`scenes.test.ts` yoksa oluştur):**
  `sanitizeCaptionStyle`:
  - Geçerli `{textColor:"#ff0000", bgColor:"none"}` → normalize `#FF0000`,
    `bgColor:"none"` korunur.
  - Geçersiz hex `{textColor:"zzz"}` → `DEFAULT.textColor`.
  - 3-hane `#abc` → `#AABBCC`.
  - **Eski format** `{color:"yellow"}` → `{textColor:"#141208", bgColor:"#F4C63A"}`.
  - `{color:"none"}` → `{textColor:"#FFFFFF", bgColor:"none"}`.
  - `engineSubtitleParams({...bgColor:"none"})` → `text_background_color:false`.
  - `engineSubtitleParams({...bgColor:"#F4C63A", textColor:"#141208"})` →
    `text_fore_color:"#141208", text_background_color:"#F4C63A"`.
- **create.test.ts (güncelle):** mevcut renk beklentileri yeni modele
  taşınır. Bölüm 4 iki testi:
  - Caller `{size:"lg",position:"top",textColor:"#FFFFFF",bgColor:"none"}` →
    payload `subtitle_position:"top"`, `font_size:76`,
    `text_fore_color:"#FFFFFF"`, `text_background_color:false`.
  - captionStyle omitted → default: `font_size:60`, `text_fore_color:"#141208"`,
    `text_background_color:"#F4C63A"`.
- **editor regression:** tsc + lint + tam suite yeşil.
- **Canlı test:** brief'te text + bg renk seç (preset ve palet), önizlemenin
  değiştiğini ve render çıktısında uygulandığını doğrula (kullanıcı).

## Kapsam dışı (YAGNI)

- Stroke (kenar çizgisi) rengi/genişliği — engine destekliyor ama bu iş sadece
  fore + background. Ayrı iş.
- Font ailesi seçimi.
- Gradient / opacity / alpha kanalı — düz hex yeterli.
- `custom_position` (yüzde bazlı konum) — mevcut top/center/bottom korunur.
- DB backfill migration — okuma anında migrasyon (Karar A) ile gereksiz.
- Preset renk sayısını kullanıcının özelleştirmesi — sabit 5 + palet.
