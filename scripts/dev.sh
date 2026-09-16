#!/usr/bin/env bash
# Reelate yerel geliştirme ortamı: Postgres + Redis + render worker + Next dev.
#
# Worker'ı elle başlatmayı unutmak, işlerin kuyrukta sessizce beklemesine ve
# arayüzde sonsuza kadar %0 görünmesine yol açıyordu; bu script dört parçanın
# da ayakta olmasını garanti eder. Idempotent: çalışan bir parçayı tekrar
# başlatmaz, sadece eksikleri tamamlar.
#
# Kullanım: ./scripts/dev.sh   (Ctrl-C hepsini kapatır)

set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
LOG_DIR="$ROOT/storage/dev-logs"
mkdir -p "$LOG_DIR"

STARTED_WORKER=""

cleanup() {
  if [ -n "$STARTED_WORKER" ]; then
    echo ""
    echo "→ worker kapatılıyor (pid $STARTED_WORKER)"
    kill "$STARTED_WORKER" 2>/dev/null
  fi
}
trap cleanup EXIT INT TERM

# 1) Postgres (docker-compose.dev.yml, host portu 5434)
if docker ps --format '{{.Names}}' | grep -qx reelate-postgres; then
  echo "✓ postgres  : reelate-postgres çalışıyor (5434)"
else
  echo "→ postgres  : başlatılıyor…"
  docker compose -f docker-compose.dev.yml up -d postgres >/dev/null || {
    echo "✗ postgres başlatılamadı — Docker açık mı?"; exit 1; }
  echo "✓ postgres  : ayakta (5434)"
fi

# 2) Redis (host'ta brew ile ya da compose 'full' profiliyle)
if redis-cli ping >/dev/null 2>&1; then
  echo "✓ redis     : 6379 yanıt veriyor"
else
  echo "→ redis     : 6379'da yok, compose ile başlatılıyor…"
  docker compose -f docker-compose.dev.yml --profile full up -d redis >/dev/null || {
    echo "✗ redis başlatılamadı"; exit 1; }
  for _ in $(seq 1 20); do
    redis-cli ping >/dev/null 2>&1 && break
    sleep 0.5
  done
  redis-cli ping >/dev/null 2>&1 || { echo "✗ redis hâlâ yanıt vermiyor"; exit 1; }
  echo "✓ redis     : ayakta (6379)"
fi

# 3) Render worker — bu olmadan iş kuyrukta bekler, arayüz %0'da kalır.
if pgrep -f "worker\.main" >/dev/null; then
  echo "✓ worker    : zaten çalışıyor (pid $(pgrep -f 'worker\.main' | tr '\n' ' '))"
else
  echo "→ worker    : başlatılıyor…"
  ( cd "$ROOT" && exec uv run python -m worker.main ) >>"$LOG_DIR/worker.log" 2>&1 &
  STARTED_WORKER=$!
  sleep 3
  if kill -0 "$STARTED_WORKER" 2>/dev/null; then
    echo "✓ worker    : ayakta (pid $STARTED_WORKER) — log: $LOG_DIR/worker.log"
  else
    echo "✗ worker açılamadı, son satırlar:"
    tail -20 "$LOG_DIR/worker.log"
    exit 1
  fi
fi

# 4) Kuyrukta bekleyen iş varsa söyle: worker onları sırayla alacak.
PENDING="$(redis-cli llen reelate:queue:pending 2>/dev/null || echo 0)"
[ "${PENDING:-0}" != "0" ] && echo "ℹ kuyrukta bekleyen $PENDING iş var, worker sırayla alacak"

# 5) Next dev — 3000 zaten doluysa ikinci bir sunucu açma.
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✓ web       : 3000'de bir dev server zaten var, yenisi açılmadı"
  echo ""
  echo "Ortam hazır. Worker'ı bu script başlattıysa burada Ctrl-C ile kapatabilirsin."
  [ -n "$STARTED_WORKER" ] && wait "$STARTED_WORKER"
  exit 0
fi

echo "→ web       : next dev (http://localhost:3000)"
echo ""
cd "$ROOT/web" && npm run dev
