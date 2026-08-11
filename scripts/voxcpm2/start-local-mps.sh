#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${VOXCPM2_RUNTIME_DIR:-"$ROOT_DIR/runtime/voxcpm2"}"
PYTHON_BIN="${VOXCPM2_PYTHON:-"$RUNTIME_DIR/envs/voxcpm-py311/bin/python"}"
MODEL_DIR="${VOXCPM2_MODEL_DIR:-"$RUNTIME_DIR/models/VoxCPM2"}"
HOST="${VOXCPM2_HOST:-127.0.0.1}"
PORT="${VOXCPM2_PORT:-55000}"
DEVICE="${VOXCPM2_DEVICE:-auto}"
LOG_DIR="$RUNTIME_DIR/logs"
PID_FILE="$RUNTIME_DIR/voxcpm2-local.pid"
READY_ATTEMPTS="${VOXCPM2_STARTUP_READY_ATTEMPTS:-180}"
READY_INTERVAL_SECONDS="${VOXCPM2_STARTUP_READY_INTERVAL_SECONDS:-5}"

mkdir -p "$LOG_DIR" "$RUNTIME_DIR/cache/huggingface" "$RUNTIME_DIR/cache/matplotlib" "$RUNTIME_DIR/cache/modelscope"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "[voxcpm2:start] already running pid=$(cat "$PID_FILE")"
  exit 0
fi

VOXCPM2_PYTHON="$PYTHON_BIN" \
VOXCPM2_MODEL_DIR="$MODEL_DIR" \
VOXCPM2_BASE_URL="http://$HOST:$PORT" \
  node "$ROOT_DIR/scripts/voxcpm2/check-runtime-readiness.mjs" --no-endpoint

HF_HOME="${HF_HOME:-"$RUNTIME_DIR/cache/huggingface"}" \
MPLCONFIGDIR="${MPLCONFIGDIR:-"$RUNTIME_DIR/cache/matplotlib"}" \
MODELSCOPE_CACHE="${MODELSCOPE_CACHE:-"$RUNTIME_DIR/cache/modelscope"}" \
  nohup "$PYTHON_BIN" "$ROOT_DIR/scripts/voxcpm2/server.py" \
    --host "$HOST" \
    --port "$PORT" \
    --model "$MODEL_DIR" \
    --device "$DEVICE" \
    > "$LOG_DIR/server.log" 2>&1 &
PID="$!"
echo "$PID" > "$PID_FILE"

for attempt in $(seq 1 "$READY_ATTEMPTS"); do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "[voxcpm2:start] process exited during model load pid=$PID attempt=$attempt" >&2
    tail -100 "$LOG_DIR/server.log" >&2 || true
    rm -f "$PID_FILE"
    exit 1
  fi
  if VOXCPM2_PYTHON="$PYTHON_BIN" \
    VOXCPM2_MODEL_DIR="$MODEL_DIR" \
    VOXCPM2_BASE_URL="http://$HOST:$PORT" \
    node "$ROOT_DIR/scripts/voxcpm2/check-runtime-readiness.mjs" --endpoint >/dev/null 2>&1; then
    echo "[voxcpm2:start] endpoint ready attempt=$attempt pid=$PID"
    VOXCPM2_PYTHON="$PYTHON_BIN" \
    VOXCPM2_MODEL_DIR="$MODEL_DIR" \
    VOXCPM2_BASE_URL="http://$HOST:$PORT" \
      node "$ROOT_DIR/scripts/voxcpm2/check-runtime-readiness.mjs" --endpoint
    echo "[voxcpm2:start] Alice env: VOXCPM2_BASE_URL=http://$HOST:$PORT TTS_PROVIDER remains cosyvoice until manually switched"
    exit 0
  fi
  sleep "$READY_INTERVAL_SECONDS"
done

echo "[voxcpm2:start] endpoint not ready after $READY_ATTEMPTS attempts" >&2
tail -100 "$LOG_DIR/server.log" >&2 || true
kill "$PID" 2>/dev/null || true
rm -f "$PID_FILE"
exit 1
