#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${COSYVOICE_RUNTIME_DIR:-"$ROOT_DIR/runtime/cosyvoice"}"
MODEL_DIR="${COSYVOICE_MODEL_DIR:-"$RUNTIME_DIR/pretrained_models/CosyVoice2-0.5B-hf"}"
PORT="${COSYVOICE_PORT:-50000}"
BASE_URL="${COSYVOICE_BASE_URL:-"http://127.0.0.1:$PORT"}"
VOICE_ID="${COSYVOICE_VOICE_ID:-中文女}"
SAMPLE_RATE="${COSYVOICE_SAMPLE_RATE:-24000}"
OUTPUT_WAV="${TTS_LIVE_OUTPUT_WAV:-"$RUNTIME_DIR/output/alice-cosyvoice-regression.wav"}"

export COSYVOICE_MODEL_DIR="$MODEL_DIR"
export COSYVOICE_PORT="$PORT"
export COSYVOICE_BASE_URL="$BASE_URL"
export COSYVOICE_API_STYLE="${COSYVOICE_API_STYLE:-official_fastapi}"
export COSYVOICE_API_MODE="${COSYVOICE_API_MODE:-sft}"
export COSYVOICE_VOICE_ID="$VOICE_ID"
export COSYVOICE_SAMPLE_RATE="$SAMPLE_RATE"

cleanup() {
  npm run cosyvoice:stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[cosyvoice:verify] preflight"
node "$ROOT_DIR/scripts/cosyvoice/check-runtime-readiness.mjs" --no-endpoint

echo "[cosyvoice:verify] start runtime"
npm run cosyvoice:start

echo "[cosyvoice:verify] wait for endpoint"
for attempt in $(seq 1 12); do
  if node "$ROOT_DIR/scripts/cosyvoice/check-runtime-readiness.mjs" --endpoint; then
    break
  fi
  if [ "$attempt" -eq 12 ]; then
    echo "[cosyvoice:verify] endpoint did not become ready after $attempt attempts" >&2
    exit 1
  fi
  sleep 5
done

echo "[cosyvoice:verify] Alice live provider check"
TTS_LIVE_OUTPUT_WAV="$OUTPUT_WAV" npm run check:cosyvoice-live

echo "[cosyvoice:verify] stop runtime"
npm run cosyvoice:stop

echo "[cosyvoice:verify] degradation check"
node "$ROOT_DIR/scripts/cosyvoice/check-degradation.mjs"

trap - EXIT
echo "[cosyvoice:verify] ok"
