# Diller + Ses Önizleme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yeni Next.js panelinde create-wizard'ın brief adımına ~28 dil + her sesin yanında canlı TTS önizleme ("Play") butonu eklemek.

**Architecture:** Backend'e senkron bir `POST /api/v1/voice/preview` endpoint'i eklenir (`voice.tts()` ile kısa mp3 üretir). Next.js `POST /api/voice/preview` route'u bunu proxy'ler (auth + rate-limit). Frontend `brief-step.tsx` dilleri dropdown'a çevirir ve her ses kartına önizleme butonu ekler. Dil/ses verisi `options.ts`'te genişletilir.

**Tech Stack:** Next.js App Router + React + TypeScript + Tailwind (web), Vitest (web testleri), FastAPI + Python + edge-tts (backend), pytest (backend testleri).

## Global Constraints

- Ses id formatı: `<locale>-<Name>Neural-<Gender>` (ör. `tr-TR-EmelNeural-Female`). Mevcut `voiceDisplay()` ve `voice.tts()` bu formatla çalışır — bozma.
- Backend endpoint prefix'i `/api/v1` (`new_router()` üzerinden, `app/controllers/v1/base.py`).
- Backend hataları `HttpException` ile fırlatılır (`app/models/exception`).
- Web auth: `import { auth } from "@/auth"`; giriş yoksa 401.
- Web rate-limit: Redis `incr` + `expire`, key deseni `reelate:ratelimit:<scope>:<userId>:<hour>` (bkz. `rerender/route.ts`).
- Python backend URL'i web tarafında `PYTHON_API_URL` env değişkeninden okunur, fallback `http://localhost:8080`.
- `voice.tts(text, voice_name, voice_rate, voice_file, voice_volume)` — `voice_rate` zorunlu (default yok); önizlemede `voice_rate=1.0`, `voice_volume=1.0` kullan.
- Play butonu kartı SEÇMEZ (`stopPropagation`) — seçim ve önizleme ayrı eylemler.
- Backend erişilemezse panel çökmez; önizleme sessizce hata durumu gösterir.

---

### Task 1: Genişletilmiş dil & ses verisi (`options.ts`)

**Files:**
- Modify: `web/src/lib/jobs/options.ts`
- Test: `web/src/lib/jobs/__tests__/options.test.ts` (create)

**Interfaces:**
- Consumes: yok.
- Produces:
  - `LANGUAGES: readonly { code: string; label: string }[]` — 28 giriş.
  - `VOICES: readonly { id: string; label: string; language: string }[]` — her `language`, bir `LANGUAGES[].code` ile eşleşir; her dilde ≥1 ses.
  - `code`, ilgili sesin locale prefix'iyle uyumlu (ör. `code: "es-ES"` → id `es-ES-...`).

- [ ] **Step 1: Testi yaz (fail eder)**

`web/src/lib/jobs/__tests__/options.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LANGUAGES, VOICES } from "@/lib/jobs/options";

describe("options language/voice data", () => {
  it("exposes ~28 languages", () => {
    expect(LANGUAGES.length).toBeGreaterThanOrEqual(28);
  });

  it("every voice maps to a known language", () => {
    const codes = new Set(LANGUAGES.map((l) => l.code));
    for (const v of VOICES) {
      expect(codes.has(v.language)).toBe(true);
    }
  });

  it("every language has at least one voice", () => {
    for (const l of LANGUAGES) {
      expect(VOICES.some((v) => v.language === l.code)).toBe(true);
    }
  });

  it("voice id starts with its language locale prefix", () => {
    for (const v of VOICES) {
      expect(v.id.startsWith(v.language + "-")).toBe(true);
    }
  });

  it("keeps the engine voice id suffix format", () => {
    for (const v of VOICES) {
      expect(v.id).toMatch(/Neural-(Male|Female)$/);
    }
  });
});
```

- [ ] **Step 2: Testi çalıştır, fail ettiğini gör**

Run: `cd web && npx vitest run src/lib/jobs/__tests__/options.test.ts`
Expected: FAIL (length 2 < 28 ve/veya format uyuşmazlığı).

- [ ] **Step 3: `options.ts`'i genişlet**

`web/src/lib/jobs/options.ts` içinde `LANGUAGES` ve `VOICES`'ı aşağıdakiyle değiştir. Ses adları `app/services/data/azure_voices.json`'da doğrulandı. `code` olarak locale kullanılır (dropdown'da benzersiz olması için; ör. es-ES vs es-MX ayrı diller).

```ts
export const LANGUAGES = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "tr-TR", label: "Türkçe" },
  { code: "es-ES", label: "Español (España)" },
  { code: "es-MX", label: "Español (México)" },
  { code: "de-DE", label: "Deutsch" },
  { code: "fr-FR", label: "Français" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "it-IT", label: "Italiano" },
  { code: "ru-RU", label: "Русский" },
  { code: "ar-SA", label: "العربية" },
  { code: "zh-CN", label: "中文 (简体)" },
  { code: "ja-JP", label: "日本語" },
  { code: "ko-KR", label: "한국어" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "nl-NL", label: "Nederlands" },
  { code: "pl-PL", label: "Polski" },
  { code: "sv-SE", label: "Svenska" },
  { code: "id-ID", label: "Bahasa Indonesia" },
  { code: "vi-VN", label: "Tiếng Việt" },
  { code: "th-TH", label: "ไทย" },
  { code: "uk-UA", label: "Українська" },
  { code: "ro-RO", label: "Română" },
  { code: "el-GR", label: "Ελληνικά" },
  { code: "cs-CZ", label: "Čeština" },
  { code: "he-IL", label: "עברית" },
  { code: "da-DK", label: "Dansk" },
  { code: "fi-FI", label: "Suomi" },
  { code: "nb-NO", label: "Norsk" },
  { code: "fa-IR", label: "فارسی" },
] as const;

// Motor ses adı formatı: <locale>-<Name>Neural-<Gender> (app/services/voice.py)
export const VOICES = [
  { id: "en-US-JennyNeural-Female", label: "Jenny (US, Female)", language: "en-US" },
  { id: "en-US-GuyNeural-Male", label: "Guy (US, Male)", language: "en-US" },
  { id: "en-US-AriaNeural-Female", label: "Aria (US, Female)", language: "en-US" },
  { id: "en-GB-SoniaNeural-Female", label: "Sonia (UK, Female)", language: "en-GB" },
  { id: "en-GB-RyanNeural-Male", label: "Ryan (UK, Male)", language: "en-GB" },
  { id: "tr-TR-EmelNeural-Female", label: "Emel (TR, Female)", language: "tr-TR" },
  { id: "tr-TR-AhmetNeural-Male", label: "Ahmet (TR, Male)", language: "tr-TR" },
  { id: "es-ES-ElviraNeural-Female", label: "Elvira (ES, Female)", language: "es-ES" },
  { id: "es-ES-AlvaroNeural-Male", label: "Álvaro (ES, Male)", language: "es-ES" },
  { id: "es-MX-DaliaNeural-Female", label: "Dalia (MX, Female)", language: "es-MX" },
  { id: "es-MX-JorgeNeural-Male", label: "Jorge (MX, Male)", language: "es-MX" },
  { id: "de-DE-KatjaNeural-Female", label: "Katja (DE, Female)", language: "de-DE" },
  { id: "de-DE-ConradNeural-Male", label: "Conrad (DE, Male)", language: "de-DE" },
  { id: "fr-FR-DeniseNeural-Female", label: "Denise (FR, Female)", language: "fr-FR" },
  { id: "fr-FR-HenriNeural-Male", label: "Henri (FR, Male)", language: "fr-FR" },
  { id: "pt-BR-FranciscaNeural-Female", label: "Francisca (BR, Female)", language: "pt-BR" },
  { id: "pt-BR-AntonioNeural-Male", label: "Antônio (BR, Male)", language: "pt-BR" },
  { id: "it-IT-ElsaNeural-Female", label: "Elsa (IT, Female)", language: "it-IT" },
  { id: "it-IT-DiegoNeural-Male", label: "Diego (IT, Male)", language: "it-IT" },
  { id: "ru-RU-SvetlanaNeural-Female", label: "Svetlana (RU, Female)", language: "ru-RU" },
  { id: "ru-RU-DmitryNeural-Male", label: "Dmitry (RU, Male)", language: "ru-RU" },
  { id: "ar-SA-ZariyahNeural-Female", label: "Zariyah (SA, Female)", language: "ar-SA" },
  { id: "ar-SA-HamedNeural-Male", label: "Hamed (SA, Male)", language: "ar-SA" },
  { id: "zh-CN-XiaoxiaoNeural-Female", label: "Xiaoxiao (CN, Female)", language: "zh-CN" },
  { id: "zh-CN-YunjianNeural-Male", label: "Yunjian (CN, Male)", language: "zh-CN" },
  { id: "ja-JP-NanamiNeural-Female", label: "Nanami (JP, Female)", language: "ja-JP" },
  { id: "ja-JP-KeitaNeural-Male", label: "Keita (JP, Male)", language: "ja-JP" },
  { id: "ko-KR-SunHiNeural-Female", label: "SunHi (KR, Female)", language: "ko-KR" },
  { id: "ko-KR-InJoonNeural-Male", label: "InJoon (KR, Male)", language: "ko-KR" },
  { id: "hi-IN-SwaraNeural-Female", label: "Swara (IN, Female)", language: "hi-IN" },
  { id: "hi-IN-MadhurNeural-Male", label: "Madhur (IN, Male)", language: "hi-IN" },
  { id: "nl-NL-ColetteNeural-Female", label: "Colette (NL, Female)", language: "nl-NL" },
  { id: "nl-NL-MaartenNeural-Male", label: "Maarten (NL, Male)", language: "nl-NL" },
  { id: "pl-PL-ZofiaNeural-Female", label: "Zofia (PL, Female)", language: "pl-PL" },
  { id: "pl-PL-MarekNeural-Male", label: "Marek (PL, Male)", language: "pl-PL" },
  { id: "sv-SE-SofieNeural-Female", label: "Sofie (SE, Female)", language: "sv-SE" },
  { id: "sv-SE-MattiasNeural-Male", label: "Mattias (SE, Male)", language: "sv-SE" },
  { id: "id-ID-GadisNeural-Female", label: "Gadis (ID, Female)", language: "id-ID" },
  { id: "id-ID-ArdiNeural-Male", label: "Ardi (ID, Male)", language: "id-ID" },
  { id: "vi-VN-HoaiMyNeural-Female", label: "HoaiMy (VN, Female)", language: "vi-VN" },
  { id: "vi-VN-NamMinhNeural-Male", label: "NamMinh (VN, Male)", language: "vi-VN" },
  { id: "th-TH-PremwadeeNeural-Female", label: "Premwadee (TH, Female)", language: "th-TH" },
  { id: "th-TH-NiwatNeural-Male", label: "Niwat (TH, Male)", language: "th-TH" },
  { id: "uk-UA-PolinaNeural-Female", label: "Polina (UA, Female)", language: "uk-UA" },
  { id: "uk-UA-OstapNeural-Male", label: "Ostap (UA, Male)", language: "uk-UA" },
  { id: "ro-RO-AlinaNeural-Female", label: "Alina (RO, Female)", language: "ro-RO" },
  { id: "ro-RO-EmilNeural-Male", label: "Emil (RO, Male)", language: "ro-RO" },
  { id: "el-GR-AthinaNeural-Female", label: "Athina (GR, Female)", language: "el-GR" },
  { id: "el-GR-NestorasNeural-Male", label: "Nestoras (GR, Male)", language: "el-GR" },
  { id: "cs-CZ-VlastaNeural-Female", label: "Vlasta (CZ, Female)", language: "cs-CZ" },
  { id: "cs-CZ-AntoninNeural-Male", label: "Antonin (CZ, Male)", language: "cs-CZ" },
  { id: "he-IL-HilaNeural-Female", label: "Hila (IL, Female)", language: "he-IL" },
  { id: "he-IL-AvriNeural-Male", label: "Avri (IL, Male)", language: "he-IL" },
  { id: "da-DK-ChristelNeural-Female", label: "Christel (DK, Female)", language: "da-DK" },
  { id: "da-DK-JeppeNeural-Male", label: "Jeppe (DK, Male)", language: "da-DK" },
  { id: "fi-FI-NooraNeural-Female", label: "Noora (FI, Female)", language: "fi-FI" },
  { id: "fi-FI-HarriNeural-Male", label: "Harri (FI, Male)", language: "fi-FI" },
  { id: "nb-NO-PernilleNeural-Female", label: "Pernille (NO, Female)", language: "nb-NO" },
  { id: "nb-NO-FinnNeural-Male", label: "Finn (NO, Male)", language: "nb-NO" },
  { id: "fa-IR-DilaraNeural-Female", label: "Dilara (IR, Female)", language: "fa-IR" },
  { id: "fa-IR-FaridNeural-Male", label: "Farid (IR, Male)", language: "fa-IR" },
] as const;
```

`ASPECTS`, `DURATION_OPTIONS`, `MAX_SCRIPT_WORDS` satırlarına dokunma.

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `cd web && npx vitest run src/lib/jobs/__tests__/options.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Wizard default'unu doğrula**

`web/src/app/dashboard/create/wizard.tsx:23-24` — `language: "en"` artık geçersiz (`en-US` oldu). Şu satırları güncelle:

```ts
language: "en-US",
voice: VOICES[0].id,
```

`script-step.tsx:39-40` dil label'ı `LANGUAGES.find((l) => l.code === ...)?.label` üzerinden çözülüyorsa değişiklik gerekmez; sabit `"en"`/`"tr"` karşılaştırması varsa `en-US`/`tr-TR`'ye güncelle. Dosyayı aç, `"en"` veya `"tr"` string literal'i ara, varsa düzelt.

- [ ] **Step 6: Web tüm testleri + typecheck**

Run: `cd web && npx vitest run src/lib && npx tsc --noEmit`
Expected: PASS, tip hatası yok.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/jobs/options.ts web/src/lib/jobs/__tests__/options.test.ts web/src/app/dashboard/create/wizard.tsx web/src/app/dashboard/create/script-step.tsx
git commit -m "feat(web): expand languages to 28 with per-locale voices"
```

---

### Task 2: Backend voice-preview endpoint (`POST /api/v1/voice/preview`)

**Files:**
- Create: `app/controllers/v1/voice.py`
- Modify: `app/router.py`
- Modify: `app/models/schema.py` (VoicePreviewRequest ekle)
- Test: `test/services/test_voice_preview.py` (create)

**Interfaces:**
- Consumes: `app.services.voice.tts(text, voice_name, voice_rate, voice_file, voice_volume)`.
- Produces:
  - `sample_text_for_voice(voice_name: str) -> str` (voice.py'de veya voice.py yanında helper) — locale prefix'ine göre örnek cümle döner, bilinmeyen locale için İngilizce fallback.
  - HTTP: `POST /api/v1/voice/preview`, body `{ "voice_name": str, "text": str | null }`, başarıda `audio/mpeg` (`FileResponse`), başarısızlıkta `HttpException`.

- [ ] **Step 1: `sample_text_for_voice` testini yaz (fail eder)**

`test/services/test_voice_preview.py`:

```python
from app.services.voice import sample_text_for_voice


def test_sample_text_turkish():
    assert sample_text_for_voice("tr-TR-EmelNeural-Female").startswith("Merhaba")


def test_sample_text_known_locale_english():
    assert sample_text_for_voice("en-US-JennyNeural-Female") == (
        "Hello, this is a sample of my voice."
    )


def test_sample_text_unknown_locale_falls_back_to_english():
    assert sample_text_for_voice("xx-XX-FooNeural-Female") == (
        "Hello, this is a sample of my voice."
    )
```

- [ ] **Step 2: Testi çalıştır, fail ettiğini gör**

Run: `python -m pytest test/services/test_voice_preview.py -v`
Expected: FAIL (`ImportError: cannot import name 'sample_text_for_voice'`).

- [ ] **Step 3: `sample_text_for_voice` helper'ını ekle**

`app/services/voice.py` sonuna ekle:

```python
_PREVIEW_SAMPLE_TEXTS = {
    "tr": "Merhaba, bu benim sesimden bir örnektir.",
    "en": "Hello, this is a sample of my voice.",
    "es": "Hola, esta es una muestra de mi voz.",
    "de": "Hallo, das ist eine Kostprobe meiner Stimme.",
    "fr": "Bonjour, ceci est un échantillon de ma voix.",
    "pt": "Olá, esta é uma amostra da minha voz.",
    "it": "Ciao, questo è un campione della mia voce.",
    "ru": "Здравствуйте, это образец моего голоса.",
    "ar": "مرحبًا، هذه عينة من صوتي.",
    "zh": "你好，这是我的声音示例。",
    "ja": "こんにちは、これは私の声のサンプルです。",
    "ko": "안녕하세요, 이것은 제 목소리 샘플입니다.",
    "hi": "नमस्ते, यह मेरी आवाज़ का एक नमूना है।",
    "nl": "Hallo, dit is een voorbeeld van mijn stem.",
    "pl": "Cześć, to próbka mojego głosu.",
    "sv": "Hej, det här är ett prov på min röst.",
    "id": "Halo, ini adalah contoh suara saya.",
    "vi": "Xin chào, đây là một mẫu giọng nói của tôi.",
    "th": "สวัสดี นี่คือตัวอย่างเสียงของฉัน",
    "uk": "Привіт, це зразок мого голосу.",
    "ro": "Bună, aceasta este o mostră a vocii mele.",
    "el": "Γεια σας, αυτό είναι ένα δείγμα της φωνής μου.",
    "cs": "Ahoj, toto je ukázka mého hlasu.",
    "he": "שלום, זוהי דוגמה של הקול שלי.",
    "da": "Hej, dette er en prøve på min stemme.",
    "fi": "Hei, tämä on näyte äänestäni.",
    "nb": "Hei, dette er en prøve av stemmen min.",
    "fa": "سلام، این نمونه‌ای از صدای من است.",
}


def sample_text_for_voice(voice_name: str) -> str:
    """Ses adının dil kodundan (ilk segment) örnek cümle seçer; bilinmiyorsa İngilizce."""
    lang = voice_name.split("-")[0].lower() if voice_name else "en"
    return _PREVIEW_SAMPLE_TEXTS.get(lang, _PREVIEW_SAMPLE_TEXTS["en"])
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `python -m pytest test/services/test_voice_preview.py -v`
Expected: PASS (3 test).

- [ ] **Step 5: `VoicePreviewRequest` şemasını ekle**

`app/models/schema.py` içinde diğer `BaseModel` request'lerinin yanına ekle:

```python
class VoicePreviewRequest(BaseModel):
    voice_name: str
    text: str | None = None
```

(Dosyanın başında `from pydantic import BaseModel` zaten var; yoksa ekle.)

- [ ] **Step 6: Endpoint'i oluştur**

`app/controllers/v1/voice.py`:

```python
import os
from uuid import uuid4

from fastapi import BackgroundTasks
from fastapi.responses import FileResponse
from loguru import logger

from app.controllers.v1.base import new_router
from app.models.exception import HttpException
from app.models.schema import VoicePreviewRequest
from app.services import voice as voice_service
from app.utils import utils

router = new_router()

_FALLBACK_TEXT = "This is a sample voice."


@router.post("/voice/preview")
def voice_preview(request: VoicePreviewRequest, background_tasks: BackgroundTasks):
    voice_name = request.voice_name
    if not voice_name:
        raise HttpException(task_id="", status_code=400, message="voice_name is required")

    text = request.text or voice_service.sample_text_for_voice(voice_name)
    temp_dir = utils.storage_dir("temp", create=True)
    audio_file = os.path.join(temp_dir, f"preview-{uuid4()}.mp3")

    sub_maker = voice_service.tts(
        text=text,
        voice_name=voice_name,
        voice_rate=1.0,
        voice_file=audio_file,
        voice_volume=1.0,
    )
    if not sub_maker or not os.path.exists(audio_file):
        # Orijinal içerikle başarısızsa asıl projedeki gibi tek sefer daha dene.
        sub_maker = voice_service.tts(
            text=_FALLBACK_TEXT,
            voice_name=voice_name,
            voice_rate=1.0,
            voice_file=audio_file,
            voice_volume=1.0,
        )

    if not sub_maker or not os.path.exists(audio_file):
        logger.error(f"voice preview synthesis failed for {voice_name}")
        raise HttpException(task_id="", status_code=502, message="voice synthesis failed")

    background_tasks.add_task(_safe_remove, audio_file)
    return FileResponse(audio_file, media_type="audio/mpeg", filename="preview.mp3")


def _safe_remove(path: str) -> None:
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError as e:
        logger.warning(f"could not remove preview file {path}: {e}")
```

- [ ] **Step 7: Router'a kaydet**

`app/router.py`:

```python
from app.controllers.v1 import llm, video, voice

root_api_router = APIRouter()
# v1
root_api_router.include_router(video.router)
root_api_router.include_router(llm.router)
root_api_router.include_router(voice.router)
```

- [ ] **Step 8: Endpoint'i manuel doğrula**

Backend'i başlat (`python main.py` veya mevcut başlatma komutu), sonra:

Run:
```bash
curl -s -X POST http://localhost:8080/api/v1/voice/preview \
  -H "Content-Type: application/json" \
  -d '{"voice_name":"tr-TR-EmelNeural-Female"}' \
  -o /tmp/preview.mp3 -w "%{http_code} %{content_type}\n"
```
Expected: `200 audio/mpeg`, `/tmp/preview.mp3` boyutu > 0.

- [ ] **Step 9: Backend testleri**

Run: `python -m pytest test/services/test_voice_preview.py -v`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add app/controllers/v1/voice.py app/router.py app/models/schema.py test/services/test_voice_preview.py app/services/voice.py
git commit -m "feat(api): add synchronous /api/v1/voice/preview endpoint"
```

---

### Task 3: Next.js proxy route (`POST /api/voice/preview`)

**Files:**
- Create: `web/src/app/api/voice/preview/route.ts`
- Test: `web/src/app/api/voice/__tests__/preview.test.ts` (create)

**Interfaces:**
- Consumes: `auth()` (`@/auth`), `getRedis()` (`@/lib/jobs/queue`), env `PYTHON_API_URL`.
- Produces: `POST /api/voice/preview`, body `{ voiceName: string }`. Başarıda `audio/mpeg` stream; 401 (auth yok) / 429 (rate limit) / 502 (backend hata) / 400 (voiceName yok).

- [ ] **Step 1: Testi yaz (fail eder)**

`web/src/app/api/voice/__tests__/preview.test.ts`. Not: bu route auth ve fetch'e bağlı; testte `@/auth` ve global `fetch` mock'lanır.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/jobs/queue", () => ({
  getRedis: () => ({
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  }),
}));

import { auth } from "@/auth";
import { POST } from "@/app/api/voice/preview/route";

function req(body: unknown) {
  return new Request("http://test/api/voice/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
});

describe("POST /api/voice/preview", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(req({ voiceName: "tr-TR-EmelNeural-Female" }));
    expect(res.status).toBe(401);
  });

  it("400 when voiceName missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("streams audio on backend success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        }),
      ),
    );
    const res = await POST(req({ voiceName: "tr-TR-EmelNeural-Female" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("audio/mpeg");
  });

  it("502 when backend fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 502 })),
    );
    const res = await POST(req({ voiceName: "tr-TR-EmelNeural-Female" }));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Testi çalıştır, fail ettiğini gör**

Run: `cd web && npx vitest run src/app/api/voice/__tests__/preview.test.ts`
Expected: FAIL (route modülü yok).

- [ ] **Step 3: Route'u oluştur**

`web/src/app/api/voice/preview/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRedis } from "@/lib/jobs/queue";

const HOURLY_LIMIT = 60;
const BACKEND_URL = process.env.PYTHON_API_URL ?? "http://localhost:8080";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  const hour = Math.floor(Date.now() / 3_600_000);
  const rateKey = `reelate:ratelimit:voicepreview:${userId}:${hour}`;
  try {
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 3600);
    if (count > HOURLY_LIMIT) {
      return NextResponse.json(
        { error: "Too many previews. Please try again later." },
        { status: 429 },
      );
    }
  } catch (e) {
    console.error("voice preview rate limiter unavailable", e);
    // Önizleme kritik değil: limiter yoksa devam et.
  }

  const body = await request.json().catch(() => ({}));
  const voiceName = String(body.voiceName ?? "").trim();
  if (!voiceName) {
    return NextResponse.json({ error: "voiceName is required" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/api/v1/voice/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice_name: voiceName }),
    });
  } catch (e) {
    console.error("voice preview backend unreachable", e);
    return NextResponse.json(
      { error: "Preview is temporarily unavailable" },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "Preview failed" }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `cd web && npx vitest run src/app/api/voice/__tests__/preview.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/api/voice/preview/route.ts web/src/app/api/voice/__tests__/preview.test.ts
git commit -m "feat(web): add /api/voice/preview proxy route"
```

---

### Task 4: Dil dropdown + ses önizleme butonu (`brief-step.tsx`)

**Files:**
- Modify: `web/src/app/dashboard/create/brief-step.tsx`

**Interfaces:**
- Consumes: `LANGUAGES`, `VOICES` (Task 1), `POST /api/voice/preview` (Task 3).
- Produces: kullanıcıya görünür UI; dışa tip export'u yok. Mevcut `BriefValues` tipi ve `onChange`/`onGenerate`/`busy` prop'ları değişmez.

Bu görev UI davranışıdır; birim test yerine adım sonunda manuel doğrulama + typecheck kullanılır (mevcut `create/` dizininde component testi yok, deseni bozmuyoruz).

- [ ] **Step 1: React state import'u ve önizleme hook'u ekle**

`brief-step.tsx` en üstünde `"use client";` zaten var. İlk import satırından sonra ekle:

```ts
import { useRef, useState } from "react";
```

`BriefStep` fonksiyonunun gövdesinin başına (mevcut `const voices = ...` satırının hemen üstüne) ekle:

```ts
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Hangi ses için önizleme durumu: null | { id, state }
  const [preview, setPreview] = useState<{ id: string; state: "loading" | "playing" | "error" } | null>(null);

  async function playPreview(voiceId: string) {
    // Çalan varsa durdur.
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPreview({ id: voiceId, state: "loading" });
    try {
      const res = await fetch("/api/voice/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceName: voiceId }),
      });
      if (!res.ok) throw new Error(`preview ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPreview((p) => (p?.id === voiceId ? null : p));
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setPreview({ id: voiceId, state: "error" });
      };
      await audio.play();
      setPreview({ id: voiceId, state: "playing" });
    } catch {
      setPreview({ id: voiceId, state: "error" });
    }
  }
```

- [ ] **Step 2: Dil butonlarını dropdown'a çevir**

`brief-step.tsx` içinde Language `<label>`'ından sonra gelen `<div className="flex flex-wrap gap-[9px]">...{LANGUAGES.map(...)}...</div>` bloğunun TAMAMINI (mevcut satır ~96-122) aşağıdakiyle değiştir:

```tsx
        <select
          value={values.language}
          onChange={(e) => {
            const code = e.target.value;
            const firstVoice = VOICES.find((v) => v.language === code);
            onChange({
              language: code,
              ...(firstVoice ? { voice: firstVoice.id } : {}),
            });
          }}
          className="w-full rounded-xl border border-white/10 bg-[#0E0C08] px-[15px] py-3.5 text-[15px] text-bone outline-none focus:border-caption/50"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code} className="bg-[#0E0C08]">
              {lang.label}
            </option>
          ))}
        </select>
```

- [ ] **Step 3: Ses kartına play butonu ekle**

`brief-step.tsx` içinde ses kartındaki `<div className="flex items-center justify-between">...</div>` bloğunu (mevcut ~142-149, ses adı + seçim noktası) aşağıdakiyle değiştir. Play butonu `<button>` içinde iç içe `<button>` sorununu önlemek için, dış eleman `<button>` kaldığından play'i `<span role="button">` olarak ekliyoruz:

```tsx
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-bone">{d.name}</span>
                  <div className="flex items-center gap-2">
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Play ${d.name} sample`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void playPreview(v.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          void playPreview(v.id);
                        }
                      }}
                      className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] transition-colors ${
                        preview?.id === v.id && preview.state === "error"
                          ? "border-red-500/60 text-red-400"
                          : "border-white/20 text-muted hover:border-caption hover:text-caption"
                      }`}
                    >
                      {preview?.id === v.id && preview.state === "loading"
                        ? "…"
                        : preview?.id === v.id && preview.state === "playing"
                          ? "⏸"
                          : "▶"}
                    </span>
                    <span
                      className={`h-3.5 w-3.5 rounded-full border-2 ${
                        on ? "border-caption bg-caption" : "border-white/20"
                      }`}
                    />
                  </div>
                </div>
```

- [ ] **Step 4: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: PASS (iç içe buton yok, tipler tutuyor).

- [ ] **Step 5: Manuel doğrula (backend + web açık)**

Backend'i (`:8080`) ve web'i (`cd web && npm run dev`) başlat. Tarayıcıda create-wizard'ın brief adımını aç:
1. Language dropdown'ında 28 dil görünüyor.
2. Bir dil seç → ses kartları o dile göre değişiyor, ilk ses seçili.
3. Bir sesin ▶ butonuna tıkla → örnek ses çalıyor, ikon ⏸ oluyor, bitince ▶.
4. ▶'a tıklamak kartı SEÇMİYOR (seçim noktası değişmiyor); karta (butona değil) tıklamak seçiyor.
5. Backend'i durdur, tekrar ▶ → buton kırmızı hata durumuna geçiyor, panel çalışmaya devam ediyor.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/dashboard/create/brief-step.tsx
git commit -m "feat(web): language dropdown and per-voice preview button"
```

---

### Task 5: Env dokümantasyonu + son doğrulama

**Files:**
- Modify: `web/.env.example` (varsa; yoksa create)

- [ ] **Step 1: `PYTHON_API_URL`'i env örneğine ekle**

`web/.env.example` içine ekle (dosya yoksa oluştur, sadece bu satırla):

```
# Python (FastAPI) backend base URL for synchronous calls like voice preview
PYTHON_API_URL=http://localhost:8080
```

- [ ] **Step 2: Tüm web testleri + typecheck**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Backend testleri**

Run: `python -m pytest test/services/test_voice_preview.py -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/.env.example
git commit -m "docs: document PYTHON_API_URL for web voice preview"
```

---

## Self-Review Notları

- **Spec kapsamı:** 28 dil (Task 1) ✓, canlı TTS önizleme (Task 2+3+4) ✓, dropdown (Task 4) ✓, play kartı seçmez (Task 4 Step 3, stopPropagation) ✓, backend kapalıysa panel çökmez (Task 3 catch + Task 4 error state) ✓, rate-limit (Task 3) ✓, örnek-cümle haritası (Task 2) ✓.
- **Placeholder taraması:** Tüm kod blokları tam; TODO/TBD yok.
- **Tip tutarlılığı:** `sample_text_for_voice` (Task 2) ↔ endpoint kullanımı tutarlı; `playPreview`/`preview` state (Task 4) tutarlı; `voiceName` body alanı Task 3 ↔ Task 4 aynı; `voice_name` backend Task 2 ↔ Task 3 proxy aynı.
- **Not:** Task 1 Step 5, `wizard.tsx`/`script-step.tsx`'teki eski `"en"`/`"tr"` literal'lerini `en-US`/`tr-TR`'ye taşır — locale değişiminin kaçağını kapatır.
