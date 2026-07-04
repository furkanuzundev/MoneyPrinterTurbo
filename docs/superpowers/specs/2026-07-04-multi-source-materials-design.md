# Çoklu Kaynak Stok Video Harmanı — Tasarım

**Tarih:** 2026-07-04
**Durum:** Onay bekliyor (spec review)

## Amaç

Kullanıcının girdiği topic'e uygun stok videoları tek kaynaktan (Pexels)
değil, yapılandırılmış **tüm** stok kaynaklarından (Pexels + Pixabay + Coverr)
çekmek. Ana hedef **daha fazla seçenek / çeşitlilik**: tek kaynağın konuya
uygun/yeterli klip bulamadığı durumlarda, üç kaynağın havuzunu birleştirip
daha zengin bir aday havuzundan seçmek.

Hedef **değil**: alaka düzeyi skorlaması/rerank (TwelveLabs gibi bir katman bu
tasarımın kapsamı dışında; ileride ayrı iş). Hedef **değil**: sadece fallback
zinciri (çeşitlilik vermez).

## Mevcut durum

- `app/services/material.py → download_videos()` tek bir `source: str = "pexels"`
  alıyor; string→fonksiyon eşlemesiyle `search_videos_pexels/pixabay/coverr`'dan
  birini seçiyor.
- İki indirme yolu var:
  1. **Normal yol** — tüm terimlerin adaylarını tek havuzda birleştirir,
     URL bazında tekilleştirir, concat=random ise `random.shuffle` uygular,
     `_download_candidates_parallel` ile süreye ulaşana dek paralel indirir.
  2. **Sahne-sıralı yol** (`_download_videos_by_script_order`) — Reelate'in
     asıl kullandığı yol (`match_materials_to_script: true`). Her terimin
     aday grubunu ayrı tutar, tur-tur iner (round 1: her terimin 1. adayı,
     round 2: 2. adayı...), böylece klip sırası anlatı sırasına yakın kalır.
     Deterministiktir (shuffle yok).
- Web (`web/src/lib/jobs/create.ts`) job kurarken `video_source` **set etmiyor**;
  worker `VideoParams` default'u `"pexels"`e düşüyor.
- Config'de `pexels_api_keys` dolu; `pixabay_api_keys` ve `coverr_api_keys` boş.
- Her `search_videos_*` çağrısı şu an `try/except` ile sarılı **değil** — tek
  kaynak varken bir sorun yoktu, çoklu kaynakta bir kaynağın çökmesi diğerlerini
  düşürmemeli.

## Yaklaşım

**Seçilen (A):** `download_videos`'u çok-kaynaklı yap. `source: str` yerine
kavramsal olarak "yapılandırılmış kaynaklar listesi" ile çalışsın. Her terim
için üç kaynağı da sorgula, sonuçları kaynaklar-arası round-robin ile harmanla,
URL bazında tekilleştir. Mevcut indirme/süre mantığına dokunma.

Reddedilen: (B) ayrı `aggregate_materials` sarmalayıcı — iki paralel indirme
yolu doğurur, bakımı zor. (C) sadece fallback zinciri — çeşitlilik vermez.

## Mimari & veri akışı

```
video_terms (senaryo/sahne anahtar kelimeleri)
      │
      ▼
her search_term için:
   ├─ search_videos_pexels(term)   → [MaterialInfo...]
   ├─ search_videos_pixabay(term)  → [MaterialInfo...]   ← key varsa
   └─ search_videos_coverr(term)   → [MaterialInfo...]   ← key varsa
      │  (her çağrı ayrı try/except; çöken kaynak atlanır)
      ▼
  round-robin harman: [pexels[0], pixabay[0], coverr[0], pexels[1], ...]
      │  (biten kaynak atlanır)
      ▼
  URL bazında tekilleştir
      │
      ▼
  mevcut indirme yolu (normal: paralel + süre; sahne-sıralı: tur-tur)
```

### İmza değişikliği
`download_videos(..., source: str = "pexels")` →
çok-kaynak kabul eder. Geriye dönük uyum: tek string gelirse listeye sarılır,
böylece `local` yolu ve mevcut testler/`__main__` bloğu kırılmaz.

### Kaynak seçimi
Yeni `_configured_sources()` yardımcısı: yalnızca **API key listesi boş olmayan**
kaynakları döndürür. Key yoksa kaynak sessizce havuza katılmaz (hata değil).
Coverr key'i sonra eklendiğinde kod değişmeden otomatik dahil olur.

Kaynak string→fonksiyon eşlemesi tek bir dict'e çıkarılır:
`{"pexels": search_videos_pexels, "pixabay": search_videos_pixabay,
"coverr": search_videos_coverr}`, `_configured_sources()` ile kesişimi alınır.

## Round-robin harman mantığı

Tek bir yardımcı — `_merge_sources_round_robin(results_by_source)` — **iki yolda
da** kullanılır (DRY):

```
pexels:   [A1, A2, A3, A4]
pixabay:  [B1, B2]
coverr:   [C1]
→ harman: [A1, B1, C1, A2, B2, A3, A4]   (biten kaynak atlanır)
```

Tek kaynağın (Pexels genelde en zengin) havuzun başını domine etmesini engeller.

- **Normal yol:** her `search_videos(term)` çağrısı, üç kaynağı sorgulayıp
  harmanlayan versiyonla değiştirilir. Sonuç tek havuza eklenir; mevcut
  URL-tekilleştirme + `random.shuffle` (concat=random ise) aynen çalışır.
- **Sahne-sıralı yol:** her terimin `term_items` aday listesi, aynı harman
  fonksiyonuyla üç kaynaktan doldurulur. Dış tur-tur indirme döngüsü **hiç
  değişmez**; terim sırası korunur; deterministik kalır (bu yolda shuffle yok).

Yani her iki yol için tek değişiklik: "bir kaynağı sorgula" → "yapılandırılmış
kaynakları sorgula + harmanla". İndirme, süre ve sıralama mantığına dokunulmaz.

## Hata yönetimi

- Bir kaynak sorguda **exception atarsa** (rate-limit, ağ, geçersiz key) →
  o terim için loglanıp atlanır; diğer kaynaklar devam eder. Her
  `search_videos_*` çağrısı ayrı `try/except` ile sarılır (yeni koruma).
- Bir kaynak **boş dönerse** → harmanda o kaynağın sırası atlanır (mevcut
  "biten kaynağı atla" mantığı).
- **Hiçbir kaynak** materyal döndürmezse → mevcut davranış korunur; `task.py`
  boş materyal durumunu zaten yakalayıp anlamlı hata veriyor.

## Web tarafı

Değişiklik **yok**. `create.ts` `video_source` set etmiyor ve etmeyecek;
worker artık yapılandırılmış tüm kaynakları otomatik kullanır. `local` yolu
ayrı kalır (`params.video_source == "local"` kontrolü `task.py`'de korunur).

## Config

Yeni alan yok. Mevcut `pexels_api_keys`, `pixabay_api_keys`, `coverr_api_keys`
listeleri kullanılır. `config.example.toml` zaten üç kaynağı da placeholder
olarak içeriyor; gerekirse çoklu-kaynak davranışını açıklayan bir yorum eklenir.

## Testler (TDD)

1. `_merge_sources_round_robin` — üç kaynak listesi → doğru serpiştirme,
   biten kaynağı atlama, URL tekilleştirme.
2. `_configured_sources()` — sadece key'i dolu kaynakları döndürür.
3. Bir kaynak exception atınca diğerlerinin devam ettiği (mock'lu).
4. Sahne-sıralı yolun harman sonrası hâlâ terim sırasını koruduğu.
5. Geriye dönük uyum: tek string `source="pexels"` hâlâ çalışır; mevcut
   testler ve `local` yolu kırılmaz.

## Kapsam dışı

- Alaka düzeyi skorlaması / TwelveLabs rerank.
- douyin/bilibili/xiaohongshu kaynakları (backend'de karşılığı yok; ayrı iş).
- Web'den açık kaynak seçimi UI'ı (otomatik "key varsa dahil et" yeterli).
