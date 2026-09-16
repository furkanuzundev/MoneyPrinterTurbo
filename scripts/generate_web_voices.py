"""Web UI'daki VOICES listesini ve statik ses önizlemelerini üretir.

web/src/lib/jobs/options.ts içindeki VOICES bloğu elle bakımlı bir alt kümeydi
(dil başına 2-3 ses). Bu script onu app/services/data/azure_voices.json'dan
türeterek her dilin backend'de gerçekten sunduğu tüm seslerin UI'da görünmesini
sağlar.

Kapsam: LANGUAGES listesindeki diller. Yeni dil eklemek bu script'in işi değil —
önce options.ts'teki LANGUAGES güncellenir, sonra bu script yeniden çalıştırılır.

"-V2" sesleri hariç tutulur: bunlar azure_tts_v2() yoluna gidiyor ve
config.azure.speech_key/speech_region istiyor (app/services/voice.py). Bu
anahtarlar boşken seçilirlerse hem önizleme hem video üretimi başarısız olur.

Önizleme klipleri web/public/voice-previews/<voiceId>.mp3 olarak yazılır.
Örnek cümle dile göre sabit (sample_text_for_voice), yani çıktı deterministik —
her tıklamada Microsoft'un TTS ucuna gitmek yerine statik dosya sunulur.

Kullanım:
    .venv/bin/python scripts/generate_web_voices.py            # liste + eksik klipler
    .venv/bin/python scripts/generate_web_voices.py --list-only # sadece liste
    .venv/bin/python scripts/generate_web_voices.py --force     # klipleri yeniden üret
"""

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICES_JSON = os.path.join(ROOT, "app", "services", "data", "azure_voices.json")
OPTIONS_TS = os.path.join(ROOT, "web", "src", "lib", "jobs", "options.ts")
PREVIEW_DIR = os.path.join(ROOT, "web", "public", "voice-previews")

# Bir klibin "gerçekten ses içerdiği" alt sınırı; testler de aynı eşiği kullanıyor.
MIN_CLIP_BYTES = 2000

BLOCK_RE = re.compile(r"export const VOICES = \[.*?\n\] as const;", re.DOTALL)

# Locale kodundan daha okunur bölge etiketleri (elle bakımlı listede de böyleydi).
REGION_LABELS = {"GB": "UK"}


def supported_languages(source: str) -> list[str]:
    """options.ts'teki LANGUAGES bloğundan locale kodlarını okur."""
    block = re.search(r"export const LANGUAGES = \[.*?\n\] as const;", source, re.DOTALL)
    if not block:
        raise SystemExit("LANGUAGES block not found in options.ts")
    return re.findall(r'code: "([^"]+)"', block.group(0))


def split_camel(name: str) -> str:
    """'AvaMultilingual' -> 'Ava Multilingual'."""
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", name)


def display_name(voice_name: str, locale: str) -> str:
    """'zh-CN-liaoning-XiaobeiNeural' -> 'Xiaobei'."""
    rest = voice_name[len(locale) + 1 :]
    rest = rest[: -len("Neural")] if rest.endswith("Neural") else rest
    # Lehçe önekli adlarda (liaoning-Xiaobei) son parça asıl isimdir.
    return split_camel(rest.split("-")[-1])


def build_entries(catalog: list[dict], languages: list[str]) -> list[dict]:
    entries = []
    for locale in languages:
        for item in catalog:
            name = item["name"]
            if not name.startswith(locale + "-"):
                continue
            if name.endswith("-V2"):
                continue
            gender = item["gender"]
            raw_region = locale.split("-")[1]
            region = REGION_LABELS.get(raw_region, raw_region)
            entries.append(
                {
                    "id": f"{name}-{gender}",
                    "label": f"{display_name(name, locale)} ({region}, {gender})",
                    "language": locale,
                }
            )
    return entries


def render(entries: list[dict]) -> str:
    lines = ["export const VOICES = ["]
    for e in entries:
        lines.append(
            f'  {{ id: "{e["id"]}", label: "{e["label"]}", language: "{e["language"]}" }},'
        )
    lines.append("] as const;")
    return "\n".join(lines)


def clip_path(voice_id: str) -> str:
    return os.path.join(PREVIEW_DIR, f"{voice_id}.mp3")


def needs_clip(voice_id: str, force: bool) -> bool:
    path = clip_path(voice_id)
    if force or not os.path.exists(path):
        return True
    # Yarım kalmış/boş dosyayı yeniden üret.
    return os.path.getsize(path) < MIN_CLIP_BYTES


def generate_clips(entries: list[dict], force: bool) -> int:
    """Eksik önizleme kliplerini üretir; üretilen klip sayısını döndürür."""
    # Ağır backend importunu yalnızca klip üretilecekse yap.
    sys.path.insert(0, ROOT)
    from app.services import voice as voice_service

    os.makedirs(PREVIEW_DIR, exist_ok=True)
    pending = [e for e in entries if needs_clip(e["id"], force)]
    if not pending:
        print("all preview clips already present")
        return 0

    print(f"synthesizing {len(pending)} preview clips...")
    written = 0
    failed = []
    for i, entry in enumerate(pending, 1):
        voice_id = entry["id"]
        path = clip_path(voice_id)
        text = voice_service.sample_text_for_voice(voice_id)
        voice_service.tts(
            text=text,
            voice_name=voice_id,
            voice_rate=1.0,
            voice_file=path,
            voice_volume=1.0,
        )
        if os.path.exists(path) and os.path.getsize(path) >= MIN_CLIP_BYTES:
            written += 1
        else:
            # Yarım dosya bırakma: test onu "var ama boş" diye işaretlerdi.
            if os.path.exists(path):
                os.remove(path)
            failed.append(voice_id)
        print(f"  [{i}/{len(pending)}] {voice_id}{'' if voice_id not in failed else '  FAILED'}")

    if failed:
        raise SystemExit(f"failed to synthesize {len(failed)} clips: {failed}")
    return written


def prune_orphans(entries: list[dict]) -> int:
    """Listeden çıkmış seslerin kliplerini siler."""
    if not os.path.isdir(PREVIEW_DIR):
        return 0
    keep = {f"{e['id']}.mp3" for e in entries}
    removed = 0
    for name in os.listdir(PREVIEW_DIR):
        if name.endswith(".mp3") and name not in keep:
            os.remove(os.path.join(PREVIEW_DIR, name))
            removed += 1
    return removed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--list-only", action="store_true", help="klip üretmeden sadece VOICES listesini yaz"
    )
    parser.add_argument(
        "--force", action="store_true", help="mevcut klipleri de yeniden üret"
    )
    args = parser.parse_args()

    with open(VOICES_JSON, encoding="utf-8") as f:
        catalog = json.load(f)
    with open(OPTIONS_TS, encoding="utf-8") as f:
        source = f.read()

    languages = supported_languages(source)
    entries = build_entries(catalog, languages)

    missing = [c for c in languages if not any(e["language"] == c for e in entries)]
    if missing:
        raise SystemExit(f"no voices found for languages: {missing}")

    if not BLOCK_RE.search(source):
        raise SystemExit("VOICES block not found in options.ts")
    updated = BLOCK_RE.sub(lambda _: render(entries), source, count=1)

    with open(OPTIONS_TS, "w", encoding="utf-8") as f:
        f.write(updated)

    print(f"wrote {len(entries)} voices across {len(languages)} languages")

    if args.list_only:
        return

    orphans = prune_orphans(entries)
    if orphans:
        print(f"removed {orphans} orphaned clips")
    written = generate_clips(entries, args.force)
    print(f"preview clips: {written} written, {len(entries)} total")


if __name__ == "__main__":
    main()
