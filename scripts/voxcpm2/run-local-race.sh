#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_DIR="${TTS_LOCAL_RACE_OUTPUT_DIR:-"$ROOT_DIR/runtime/tts/local-race/$STAMP"}"

cleanup() {
  bash "$ROOT_DIR/scripts/voxcpm2/stop-local.sh" >/dev/null 2>&1 || true
  bash "$ROOT_DIR/scripts/cosyvoice/stop-official-fastapi.sh" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p "$OUTPUT_DIR/cosyvoice" "$OUTPUT_DIR/voxcpm2"
cleanup

echo "[tts-local-race] start CosyVoice2 without synthesis prewarm"
COSY_START_MS="$("$ROOT_DIR/runtime/cosyvoice/envs/cosyvoice-py310/bin/python" -c 'import time; print(round(time.time() * 1000))')"
COSYVOICE_STARTUP_WAIT_ENDPOINT=0 bash "$ROOT_DIR/scripts/cosyvoice/start-official-fastapi.sh"
node "$ROOT_DIR/scripts/voxcpm2/wait-http.mjs" --url=http://127.0.0.1:50000/openapi.json --attempts=360 --interval-ms=1000
COSY_READY_MS="$("$ROOT_DIR/runtime/cosyvoice/envs/cosyvoice-py310/bin/python" -c 'import time; print(round(time.time() * 1000))')"
TTS_LOCAL_RACE_RUNTIME_READY_MS="$((COSY_READY_MS - COSY_START_MS))" \
COSYVOICE_BASE_URL=http://127.0.0.1:50000 \
  node "$ROOT_DIR/scripts/voxcpm2/benchmark-local.mjs" \
    --provider=cosyvoice \
    --output-dir="$OUTPUT_DIR/cosyvoice"
bash "$ROOT_DIR/scripts/cosyvoice/stop-official-fastapi.sh"

echo "[tts-local-race] start VoxCPM2 official auto/MPS runtime"
VOX_START_MS="$("$ROOT_DIR/runtime/voxcpm2/envs/voxcpm-py311/bin/python" -c 'import time; print(round(time.time() * 1000))')"
bash "$ROOT_DIR/scripts/voxcpm2/start-local-mps.sh"
VOX_READY_MS="$("$ROOT_DIR/runtime/voxcpm2/envs/voxcpm-py311/bin/python" -c 'import time; print(round(time.time() * 1000))')"
TTS_LOCAL_RACE_RUNTIME_READY_MS="$((VOX_READY_MS - VOX_START_MS))" \
VOXCPM2_BASE_URL=http://127.0.0.1:55000 \
  node "$ROOT_DIR/scripts/voxcpm2/benchmark-local.mjs" \
    --provider=voxcpm2 \
    --output-dir="$OUTPUT_DIR/voxcpm2"
bash "$ROOT_DIR/scripts/voxcpm2/stop-local.sh"

node "$ROOT_DIR/scripts/voxcpm2/merge-local-race.mjs" --output-dir="$OUTPUT_DIR"
echo "[tts-local-race] complete output=$OUTPUT_DIR"
