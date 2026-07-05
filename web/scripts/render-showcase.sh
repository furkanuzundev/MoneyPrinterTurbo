#!/usr/bin/env bash
#
# Landing "Made with Reelate" bölümü için 3 örnek video üretir.
#
# Python motoru (cli.py) ile üç 9:16 video render eder, çıktıları
# web/public/showcase/ altına showcase-{1,2,3}.mp4 olarak kopyalar ve her biri
# için bir poster karesi (.jpg) çıkarır. Kartların başlıkları showcase.tsx'teki
# metinlerle eşleşir; konu/başlık değiştirirsen ikisini birlikte güncelle.
#
# Gereksinimler:
#   - Repo kökünde config.toml: bir LLM sağlayıcı anahtarı + pexels_api_keys
#     (script'i --video-script ile verirsen LLM anahtarı gerekmez).
#   - config.toml storage_backend = "local"  (bu script yerel çıktı bekler).
#   - ffmpeg (poster çıkarımı için).
#   - `uv` (veya cli.py'yi çalıştıracak bir Python ortamı).
#
# Kullanım:
#   web/ dizininden:   bash scripts/render-showcase.sh
#
set -euo pipefail

# web/ -> repo kökü
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/web/public/showcase"
STORAGE="$ROOT/storage/tasks"

mkdir -p "$OUT"

# Konular showcase.tsx kart başlıklarıyla eşleşir. Betiği doğrudan veriyoruz ki
# çıktı deterministik olsun ve LLM anahtarı zorunlu olmasın; istersen script
# alanlarını boşaltıp yalnızca subject bırakarak LLM'e yazdırabilirsin.
render() {
  local idx="$1" subject="$2" script="$3"
  local task_id="showcase-${idx}"
  echo "=== [$idx/3] Rendering: $subject ==="

  ( cd "$ROOT" && uv run python cli.py \
      --video-subject "$subject" \
      --video-script "$script" \
      --video-aspect "9:16" \
      --video-source "pexels" \
      --voice-name "en-US-JennyNeural-Female" \
      --video-count 1 \
      --task-id "$task_id" )

  local src="$STORAGE/$task_id/final-1.mp4"
  if [[ ! -f "$src" ]]; then
    echo "!! Beklenen çıktı bulunamadı: $src" >&2
    exit 1
  fi

  cp "$src" "$OUT/showcase-${idx}.mp4"
  # Poster: 1. saniyeden tek kare (video henüz başlamadan gösterilir).
  ffmpeg -y -loglevel error -ss 00:00:01 -i "$src" -frames:v 1 -q:v 3 \
    "$OUT/showcase-${idx}.jpg"
  echo "   -> web/public/showcase/showcase-${idx}.mp4 (+ .jpg)"
}

render 1 \
  "3 ChatGPT prompts that save hours" \
  "Prompt one: ask ChatGPT to rewrite your email in a friendlier tone before you send it. Prompt two: paste any long article and ask for the three key takeaways. Prompt three: describe your week and let it draft a prioritized plan. Small prompts, hours saved."

render 2 \
  "Why you feel tired at 3pm" \
  "That afternoon crash is real. After lunch, blood sugar spikes and dips, and your body's natural alertness rhythm dips too. The fix is not more coffee. Try a ten minute walk, a glass of water, and daylight. Your energy comes back without the jitters."

render 3 \
  "5 books that rewired how I think" \
  "First, Thinking Fast and Slow, on the two systems behind every decision. Second, Atomic Habits, on tiny changes that compound. Third, Sapiens, on the stories that built our world. Fourth, Deep Work, on focus as a superpower. Fifth, Meditations, on what you actually control."

echo
echo "Bitti. 3 video web/public/showcase/ altında. Landing sayfasını yenile."
