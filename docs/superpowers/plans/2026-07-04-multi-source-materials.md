# Çoklu Kaynak Stok Video Harmanı — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kullanıcının topic'ine uygun stok videoları tek kaynak (Pexels) yerine yapılandırılmış tüm kaynaklardan (Pexels + Pixabay + Coverr) round-robin harmanla çekmek.

**Architecture:** `app/services/material.py` içindeki `download_videos` ve `_download_videos_by_script_order`, "tek kaynağı sorgula" yerine "yapılandırılmış tüm kaynakları sorgula + round-robin harmanla" yapacak. Tek bir `_merge_sources_round_robin` yardımcısı iki yolu da besler. Kaynaklar API key'i yapılandırılmışsa otomatik dahil edilir; her kaynak sorgusu ayrı try/except ile korunur.

**Tech Stack:** Python 3, pytest/unittest, mevcut `search_videos_pexels/pixabay/coverr` fonksiyonları, `config.app` (TOML).

## Global Constraints

- Geriye dönük uyum: `download_videos(source="pexels")` (tek string) ve `source` hiç verilmeden çağrı ÇALIŞMAYA devam etmeli. Mevcut testler (`test/services/test_material.py`) kırılmamalı.
- `local` yolu (`params.video_source == "local"`, `app/services/task.py:340`) DEĞİŞMEZ.
- Bir kaynağın çökmesi (exception) veya boş dönmesi diğer kaynakları veya üretimi DÜŞÜRMEZ.
- Yeni config alanı YOK — mevcut `pexels_api_keys` / `pixabay_api_keys` / `coverr_api_keys` kullanılır.
- Testler proje kökünden `python -m pytest test/services/test_material.py -v` ile çalışır.
- Sahne-sıralı yol DETERMİNİSTİK kalır (bu yolda `random.shuffle` yok).
- **KRİTİK (mevcut test uyumu):** Mevcut `test_download_videos_can_round_robin_terms_in_script_order` testi (a) Pexels key'ini set ETMEDEN `source="pexels"` çağırıyor, (b) `search_videos_pexels`'i `patch.object(material, "search_videos_pexels")` ile yamalıyor. Bunun için: (1) `_configured_sources`, hiçbir kaynak yapılandırılmamışsa `preferred`'ı (varsayılan `"pexels"`) tek eleman döndürmeli — böylece key'siz test Pexels-only kalır; (2) kaynak arama fonksiyonları çağrı anında `getattr(material_module, name)` ile İSİMLE çözülmeli, statik dict referansı DEĞİL — aksi halde `patch.object` yaması görünmez.

---

### Task 1: `_configured_sources()` — key'i olan kaynakları belirle

**Files:**
- Modify: `app/services/material.py` (yeni fonksiyon + `_SOURCE_SEARCH_FUNCS` dict, `download_videos`'un üstüne)
- Test: `test/services/test_material.py`

**Interfaces:**
- Consumes: `config.app` (dict), mevcut `search_videos_pexels`, `search_videos_pixabay`, `search_videos_coverr`.
- Produces:
  - `_SOURCE_SEARCH_FUNC_NAMES: dict[str, str]` — `{"pexels": "search_videos_pexels", "pixabay": "search_videos_pixabay", "coverr": "search_videos_coverr"}`. İSİM tutar (statik fonksiyon referansı değil) — böylece testlerin `patch.object(material, "search_videos_pexels")` yaması çağrı anında görünür.
  - `_configured_sources(preferred: str | None = None) -> list[str]` — key listesi boş olmayan kaynakları döndürür; `preferred` verilmişse ve yapılandırılmışsa listenin başına konur (kaynak sırasını stabilize eder). Hiçbiri yapılandırılmamışsa `preferred`'ı (veya `"pexels"`) tek elemanlı liste olarak döndürür (mevcut "key yoksa hata" davranışı download anında `get_api_key` tarafından üretilsin diye).

- [ ] **Step 1: Write the failing test**

`test/services/test_material.py` içine (dosyanın sonundaki test sınıfına veya yeni bir sınıfa) ekle. Dosyanın başındaki importlara `from unittest import mock` zaten var; `material` zaten import edilmiş.

```python
class ConfiguredSourcesTest(unittest.TestCase):
    def test_returns_only_sources_with_nonempty_keys(self):
        fake_cfg = {
            "pexels_api_keys": ["k1"],
            "pixabay_api_keys": [],
            "coverr_api_keys": ["k3"],
        }
        with mock.patch.object(material.config, "app", fake_cfg):
            self.assertEqual(
                material._configured_sources(), ["pexels", "coverr"]
            )

    def test_preferred_source_is_moved_to_front(self):
        fake_cfg = {
            "pexels_api_keys": ["k1"],
            "pixabay_api_keys": ["k2"],
            "coverr_api_keys": [],
        }
        with mock.patch.object(material.config, "app", fake_cfg):
            self.assertEqual(
                material._configured_sources(preferred="pixabay"),
                ["pixabay", "pexels"],
            )

    def test_falls_back_to_preferred_when_none_configured(self):
        fake_cfg = {
            "pexels_api_keys": [],
            "pixabay_api_keys": [],
            "coverr_api_keys": [],
        }
        with mock.patch.object(material.config, "app", fake_cfg):
            self.assertEqual(
                material._configured_sources(preferred="pexels"), ["pexels"]
            )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest test/services/test_material.py::ConfiguredSourcesTest -v`
Expected: FAIL — `AttributeError: module 'app.services.material' has no attribute '_configured_sources'`

- [ ] **Step 3: Write minimal implementation**

`download_videos` tanımının (satır ~404) hemen ÜSTÜNE ekle:

Önce dosyanın en üstündeki import bloğuna `import sys` ekle (satır ~1-8 arası, mevcut `import os` yanına). Sonra `download_videos`'un üstüne:

```python
# Fonksiyon İSİMLERİ tutulur; çağrı anında bu modülden getattr ile çözülür.
# Böylece testlerin patch.object(material, "search_videos_pexels") yaması
# arama sırasında görünür kalır (statik referans yaması kaçırırdı).
_SOURCE_SEARCH_FUNC_NAMES = {
    "pexels": "search_videos_pexels",
    "pixabay": "search_videos_pixabay",
    "coverr": "search_videos_coverr",
}


def _resolve_search_func(source: str):
    name = _SOURCE_SEARCH_FUNC_NAMES.get(source)
    if name is None:
        return None
    return getattr(sys.modules[__name__], name, None)


_SOURCE_KEY_NAMES = {
    "pexels": "pexels_api_keys",
    "pixabay": "pixabay_api_keys",
    "coverr": "coverr_api_keys",
}


def _configured_sources(preferred: str | None = None) -> List[str]:
    """API key'i yapılandırılmış kaynakları döndürür.

    preferred verilmişse ve yapılandırılmışsa listenin başına alınır.
    Hiçbir kaynak yapılandırılmamışsa preferred'ı (yoksa 'pexels')
    tek elemanlı liste olarak döndürür; gerçek 'key yok' hatası indirme
    anında get_api_key tarafından üretilir.
    """
    ordered = ["pexels", "pixabay", "coverr"]
    if preferred in ordered:
        ordered = [preferred] + [s for s in ordered if s != preferred]

    configured = []
    for src in ordered:
        keys = config.app.get(_SOURCE_KEY_NAMES[src])
        if keys:
            configured.append(src)

    if configured:
        return configured
    return [preferred or "pexels"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest test/services/test_material.py::ConfiguredSourcesTest -v`
Expected: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add app/services/material.py test/services/test_material.py
git commit -m "feat(material): add _configured_sources helper for key-gated source selection"
```

---

### Task 2: `_merge_sources_round_robin()` — kaynaklar arası harman

**Files:**
- Modify: `app/services/material.py` (yeni fonksiyon, Task 1 kodunun altına)
- Test: `test/services/test_material.py`

**Interfaces:**
- Consumes: `MaterialInfo` (mevcut model; `.url` alanı var).
- Produces:
  - `_merge_sources_round_robin(results_by_source: dict[str, list]) -> list` — her kaynağın listesinden sırayla eleman alarak serpiştirir (round-robin), `.url` bazında tekilleştirir, biten kaynağı atlar. Girdi dict ekleme sırası kaynak önceliğini belirler.

- [ ] **Step 1: Write the failing test**

```python
class MergeSourcesRoundRobinTest(unittest.TestCase):
    def _item(self, url):
        m = material.MaterialInfo()
        m.url = url
        m.duration = 5
        return m

    def test_interleaves_sources_and_skips_exhausted(self):
        by_source = {
            "pexels": [self._item("A1"), self._item("A2"), self._item("A3")],
            "pixabay": [self._item("B1")],
            "coverr": [self._item("C1"), self._item("C2")],
        }
        merged = material._merge_sources_round_robin(by_source)
        self.assertEqual(
            [m.url for m in merged], ["A1", "B1", "C1", "A2", "C2", "A3"]
        )

    def test_deduplicates_by_url_keeping_first(self):
        by_source = {
            "pexels": [self._item("X"), self._item("Y")],
            "pixabay": [self._item("X"), self._item("Z")],
        }
        merged = material._merge_sources_round_robin(by_source)
        self.assertEqual([m.url for m in merged], ["X", "Y", "Z"])

    def test_empty_input_returns_empty(self):
        self.assertEqual(material._merge_sources_round_robin({}), [])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest test/services/test_material.py::MergeSourcesRoundRobinTest -v`
Expected: FAIL — `AttributeError: ... has no attribute '_merge_sources_round_robin'`

- [ ] **Step 3: Write minimal implementation**

Task 1'de eklenen `_configured_sources` fonksiyonunun altına ekle:

```python
def _merge_sources_round_robin(results_by_source: dict) -> List:
    """Kaynak listelerini round-robin serpiştirir, url bazında tekilleştirir.

    dict ekleme sırası kaynak önceliğini belirler (ör. pexels ilk sırada
    ise her turda önce ondan alınır). Biten kaynak atlanır.
    """
    lists = [items for items in results_by_source.values() if items]
    merged = []
    seen_urls = set()
    index = 0
    while any(index < len(lst) for lst in lists):
        for lst in lists:
            if index >= len(lst):
                continue
            item = lst[index]
            if item.url in seen_urls:
                continue
            seen_urls.add(item.url)
            merged.append(item)
        index += 1
    return merged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest test/services/test_material.py::MergeSourcesRoundRobinTest -v`
Expected: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add app/services/material.py test/services/test_material.py
git commit -m "feat(material): add _merge_sources_round_robin blend helper"
```

---

### Task 3: `_search_all_sources()` — tek terim için çok-kaynak sorgu (try/except korumalı)

**Files:**
- Modify: `app/services/material.py` (yeni fonksiyon, Task 2 kodunun altına)
- Test: `test/services/test_material.py`

**Interfaces:**
- Consumes: `_resolve_search_func` (Task 1), `_merge_sources_round_robin` (Task 2), `VideoAspect`.
- Produces:
  - `_search_all_sources(sources: list[str], search_term: str, minimum_duration: int, video_aspect) -> list` — verilen her kaynağı `_resolve_search_func` ile çözüp sorgular; bir kaynak exception atarsa loglanıp atlanır; sonuçları `_merge_sources_round_robin` ile birleştirip döndürür.

- [ ] **Step 1: Write the failing test**

Kaynak fonksiyonları isimle çözüldüğü için testler `patch.object(material, "search_videos_pexels", ...)` ile yamalar (dict değil).

```python
class SearchAllSourcesTest(unittest.TestCase):
    def _item(self, url):
        m = material.MaterialInfo()
        m.url = url
        m.duration = 5
        return m

    def test_merges_results_from_multiple_sources(self):
        with mock.patch.object(
            material, "search_videos_pexels",
            return_value=[self._item("A1"), self._item("A2")],
        ), mock.patch.object(
            material, "search_videos_pixabay",
            return_value=[self._item("B1")],
        ):
            result = material._search_all_sources(
                sources=["pexels", "pixabay"],
                search_term="coffee",
                minimum_duration=5,
                video_aspect=material.VideoAspect.portrait,
            )
        self.assertEqual([m.url for m in result], ["A1", "B1", "A2"])

    def test_source_exception_is_skipped(self):
        with mock.patch.object(
            material, "search_videos_pexels",
            side_effect=RuntimeError("rate limit"),
        ), mock.patch.object(
            material, "search_videos_pixabay",
            return_value=[self._item("B1")],
        ):
            result = material._search_all_sources(
                sources=["pexels", "pixabay"],
                search_term="coffee",
                minimum_duration=5,
                video_aspect=material.VideoAspect.portrait,
            )
        self.assertEqual([m.url for m in result], ["B1"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest test/services/test_material.py::SearchAllSourcesTest -v`
Expected: FAIL — `AttributeError: ... has no attribute '_search_all_sources'`

- [ ] **Step 3: Write minimal implementation**

`_merge_sources_round_robin` altına ekle:

```python
def _search_all_sources(
    sources: List[str],
    search_term: str,
    minimum_duration: int,
    video_aspect: VideoAspect,
) -> List:
    """Verilen kaynakları tek terim için sorgular, round-robin harmanlar.

    Bir kaynak exception atarsa loglanıp atlanır; diğerleri devam eder.
    """
    results_by_source = {}
    for src in sources:
        search_fn = _resolve_search_func(src)
        if search_fn is None:
            continue
        try:
            items = search_fn(
                search_term=search_term,
                minimum_duration=minimum_duration,
                video_aspect=video_aspect,
            )
        except Exception as e:
            logger.warning(
                f"source '{src}' failed for term '{search_term}': {str(e)}"
            )
            continue
        if items:
            results_by_source[src] = items
    return _merge_sources_round_robin(results_by_source)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest test/services/test_material.py::SearchAllSourcesTest -v`
Expected: PASS (2 test)

- [ ] **Step 5: Commit**

```bash
git add app/services/material.py test/services/test_material.py
git commit -m "feat(material): add _search_all_sources with per-source error isolation"
```

---

### Task 4: `download_videos` normal yolunu çok-kaynağa bağla

**Files:**
- Modify: `app/services/material.py:404-472` (`download_videos` gövdesi — normal yol, satır ~438-472)
- Test: `test/services/test_material.py`

**Interfaces:**
- Consumes: `_configured_sources` (Task 1), `_search_all_sources` (Task 3).
- Produces: `download_videos(..., source="pexels")` imzası KORUNUR; içeride `source` artık "tercih edilen kaynak" olarak `_configured_sources(preferred=source)`'a verilir. Dönüş tipi değişmez (`List[str]`).

**Mevcut normal-yol kodu** (satır ~438-450, referans):
```python
    valid_video_items = []
    valid_video_urls = []
    found_duration = 0.0
    for search_term in search_terms:
        video_items = search_videos(
            search_term=search_term,
            minimum_duration=max_clip_duration,
            video_aspect=video_aspect,
        )
        logger.info(f"found {len(video_items)} videos for '{search_term}'")
        for item in video_items:
            if item.url not in valid_video_urls:
                ...
```
Bunu `search_videos(...)` yerine `_search_all_sources(sources, ...)` kullanacak şekilde değiştireceğiz. `sources`, fonksiyon başında `_configured_sources(preferred=source)` ile hesaplanacak.

- [ ] **Step 1: Write the failing test**

```python
class DownloadVideosMultiSourceTest(unittest.TestCase):
    def _item(self, url):
        m = material.MaterialInfo()
        m.url = url
        m.duration = 5
        return m

    def test_normal_path_blends_configured_sources(self):
        fake_cfg = {
            "pexels_api_keys": ["k1"],
            "pixabay_api_keys": ["k2"],
            "coverr_api_keys": [],
            "material_directory": "",
        }
        saved = []
        def fake_save(video_url, save_dir):
            saved.append(video_url)
            return f"/tmp/{video_url}.mp4"

        with mock.patch.object(material.config, "app", fake_cfg), \
             mock.patch.object(material, "search_videos_pexels",
                               return_value=[self._item("A1")]), \
             mock.patch.object(material, "search_videos_pixabay",
                               return_value=[self._item("B1")]), \
             mock.patch.object(material, "save_video", side_effect=fake_save):
            result = material.download_videos(
                task_id="multi",
                search_terms=["coffee"],
                audio_duration=8,
                max_clip_duration=5,
                video_concat_mode="sequential",
            )
        # Her iki kaynaktan da klip indirilmiş olmalı
        self.assertIn("A1", saved)
        self.assertIn("B1", saved)
        self.assertEqual(len(result), 2)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest test/services/test_material.py::DownloadVideosMultiSourceTest -v`
Expected: FAIL — sadece Pexels indirilir (yalnız "A1" saved), `assertIn("B1", saved)` başarısız.

- [ ] **Step 3: Write minimal implementation**

`download_videos` içinde, `search_videos = search_videos_pexels` ... `elif source == "coverr"` bloğunu (satır ~414-417) KALDIR ve yerine kaynak listesi hesapla. Fonksiyon başında, `material_directory` hesabından ÖNCE:

```python
    sources = _configured_sources(preferred=source)
    logger.info(f"downloading from sources: {sources}")
```

Sonra normal-yol döngüsünde `video_items = search_videos(...)` satırını değiştir:

```python
        video_items = _search_all_sources(
            sources=sources,
            search_term=search_term,
            minimum_duration=max_clip_duration,
            video_aspect=video_aspect,
        )
```

NOT: `match_script_order` dalı Task 5'te ele alınacak; şimdilik ona `sources` geçmek için imzayı da güncelle (Task 5 tamamlayacak). Bu task'ta `_download_videos_by_script_order` çağrısına henüz dokunma — mevcut `search_videos` referansı kaldığı için o dal geçici olarak kırılır; Task 5'in testi + bu task'ın script-order testi bunu yakalar. Geçici kırılmayı önlemek için: `match_script_order` çağrısına `sources=sources` parametresini ekle ve `_download_videos_by_script_order` imzasına `sources` ekleyip şimdilik `sources[0]`'ı eski `search_videos`-benzeri davranışla kullanacak biçimde köprüle:

```python
    if match_script_order:
        return _download_videos_by_script_order(
            task_id=task_id,
            search_terms=search_terms,
            sources=sources,
            video_aspect=video_aspect,
            audio_duration=audio_duration,
            max_clip_duration=max_clip_duration,
            material_directory=material_directory,
        )
```

Ve `_download_videos_by_script_order` imzasındaki `search_videos` parametresini `sources: List[str]` ile değiştir; gövdesinde geçici olarak:
```python
    def _search(term):
        return _search_all_sources(
            sources=sources,
            search_term=term,
            minimum_duration=max_clip_duration,
            video_aspect=video_aspect,
        )
```
ve gövdedeki `search_videos(search_term=..., ...)` çağrısını `_search(search_term)` ile değiştir. (Bu, Task 5'te test edilecek nihai davranışı zaten kurar; Task 5 testi doğrular.)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest test/services/test_material.py::DownloadVideosMultiSourceTest -v`
Expected: PASS

- [ ] **Step 5: Run FULL material suite for regressions**

Run: `python -m pytest test/services/test_material.py -v`
Expected: TÜM testler PASS (mevcut string-concat, coverr branch, script-order round-robin dahil).

- [ ] **Step 6: Commit**

```bash
git add app/services/material.py test/services/test_material.py
git commit -m "feat(material): blend configured sources in download_videos normal path"
```

---

### Task 5: Sahne-sıralı yolun harmanını doğrula

**Files:**
- Modify: `app/services/material.py` (`_download_videos_by_script_order` — Task 4'te köprülendi; burada temizlik + doğrulama)
- Test: `test/services/test_material.py`

**Interfaces:**
- Consumes: `_search_all_sources` (Task 3), Task 4'te güncellenen `_download_videos_by_script_order(sources: List[str], ...)` imzası.
- Produces: Sahne-sıralı yol, her terimin aday listesini çok-kaynak harmanla doldurur; terim sırası ve determinizm korunur.

- [ ] **Step 1: Write the failing test**

```python
class ScriptOrderMultiSourceTest(unittest.TestCase):
    def _item(self, url):
        m = material.MaterialInfo()
        m.url = url
        m.duration = 5
        return m

    def test_script_order_blends_sources_and_keeps_term_order(self):
        fake_cfg = {
            "pexels_api_keys": ["k1"],
            "pixabay_api_keys": ["k2"],
            "coverr_api_keys": [],
            "material_directory": "",
        }
        # term1 -> pexels A1 + pixabay B1 ; term2 -> pexels A2
        def pexels_search(search_term, minimum_duration, video_aspect):
            return {"t1": [self._item("A1")], "t2": [self._item("A2")]}[search_term]
        def pixabay_search(search_term, minimum_duration, video_aspect):
            return {"t1": [self._item("B1")], "t2": []}[search_term]

        saved = []
        def fake_save(video_url, save_dir):
            saved.append(video_url)
            return f"/tmp/{video_url}.mp4"

        with mock.patch.object(material.config, "app", fake_cfg), \
             mock.patch.object(material, "search_videos_pexels",
                               side_effect=pexels_search), \
             mock.patch.object(material, "search_videos_pixabay",
                               side_effect=pixabay_search), \
             mock.patch.object(material, "save_video", side_effect=fake_save):
            result = material.download_videos(
                task_id="order",
                search_terms=["t1", "t2"],
                audio_duration=20,
                max_clip_duration=5,
                match_script_order=True,
            )
        # İlk tur her terimin 1. adayı: t1->A1, t2->A2 ; sonra t1->B1
        self.assertEqual(saved, ["A1", "A2", "B1"])
        self.assertEqual(len(result), 3)
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `python -m pytest test/services/test_material.py::ScriptOrderMultiSourceTest -v`
Expected: Task 4'teki köprüleme doğruysa PASS olabilir. PASS ise Step 3'ü atla, doğrudan Step 4 tam suite'e geç. FAIL ise Step 3'e geç.

- [ ] **Step 3: Fix implementation if needed**

`_download_videos_by_script_order` gövdesinde her terim için `_search(search_term)` çağrıldığından ve dönen liste `term_items` olarak tur-tur işlendiğinden emin ol. Kullanılmayan eski `search_videos` parametresi/atıfları kaldır. Determinizm için bu yolda `random.shuffle` ÇAĞRILMADIĞINI doğrula.

- [ ] **Step 4: Run FULL material suite**

Run: `python -m pytest test/services/test_material.py -v`
Expected: TÜM testler PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/material.py test/services/test_material.py
git commit -m "feat(material): blend sources in script-order path, preserve term order"
```

---

### Task 6: config.example.toml belgeleme + tam regresyon

**Files:**
- Modify: `config.example.toml` (çoklu-kaynak davranışını açıklayan yorum)
- Test: tüm servis suite'i

**Interfaces:**
- Consumes: yok.
- Produces: yok (belgeleme + doğrulama).

- [ ] **Step 1: config.example.toml'a yorum ekle**

`pexels_api_keys` / `pixabay_api_keys` / `coverr_api_keys` satırlarının hemen üstündeki bölüme şu yorumu ekle (mevcut yorum stiliyle uyumlu, uygun satırı `grep -n "pexels_api_keys" config.example.toml` ile bul):

```toml
    # Video materyalleri, API key'i doldurulmuş TÜM kaynaklardan (Pexels,
    # Pixabay, Coverr) round-robin harmanla çekilir; böylece topic'e daha
    # çeşitli klip havuzu oluşur. Bir kaynağın key'i boşsa o kaynak sessizce
    # atlanır. video_source yalnızca tercih edilen (ilk denenecek) kaynağı belirtir.
```

- [ ] **Step 2: Tam servis test suite'i çalıştır**

Run: `python -m pytest test/services/ -v`
Expected: TÜM testler PASS (material, task, twelvelabs, parallel_download dahil).

- [ ] **Step 3: task.py çağrısının hâlâ geçerli olduğunu doğrula (manuel gözden geçirme)**

`app/services/task.py:356` çağrısı `source=params.video_source` gönderiyor. `params.video_source` normalde `"pexels"` (default) veya `"local"`. `"local"` dalı `get_video_materials` içinde ayrı ele alınıyor (satır 340), `download_videos`'a hiç gelmiyor. Dolayısıyla `source="pexels"` → `_configured_sources(preferred="pexels")` → key'i olan tüm kaynaklar. Değişiklik gereksiz; doğrula ve not düş.

- [ ] **Step 4: Commit**

```bash
git add config.example.toml
git commit -m "docs(config): document multi-source material blending behavior"
```

---

## Self-Review Notları

- **Spec coverage:** Round-robin harman (Task 2), key-gated kaynak seçimi (Task 1), per-source hata izolasyonu (Task 3), normal yol (Task 4), sahne-sıralı yol + sıra korunması (Task 5), config belgeleme (Task 6), web değişmez (Task 3+6 doğrulama), geriye uyum (Global Constraints + Task 4 Step 5 tam suite). Tümü kapsanıyor.
- **Kapsam dışı** (spec ile uyumlu): TwelveLabs rerank, douyin/bilibili/xiaohongshu, web UI kaynak seçimi.
- **Tip tutarlılığı:** `_configured_sources → list[str]`, `_search_all_sources(sources, ...) → list[MaterialInfo]`, `_merge_sources_round_robin(dict) → list`, `_download_videos_by_script_order(sources: list[str], ...)`. Tümü tutarlı.
