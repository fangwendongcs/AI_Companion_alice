#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${COSYVOICE_RUNTIME_DIR:-"$ROOT_DIR/runtime/cosyvoice"}"
REPO_DIR="${COSYVOICE_REPO_DIR:-"$RUNTIME_DIR/CosyVoice"}"
LOG_DIR="$RUNTIME_DIR/logs"
PID_FILE="$RUNTIME_DIR/cosyvoice-fastapi.pid"
PORT="${COSYVOICE_PORT:-50000}"
DEFAULT_MODEL_DIR="$RUNTIME_DIR/pretrained_models/CosyVoice2-0.5B-hf"
MODEL_DIR="${COSYVOICE_MODEL_DIR:-"$DEFAULT_MODEL_DIR"}"
DEFAULT_PYTHON="$RUNTIME_DIR/envs/cosyvoice-py310/bin/python"
if [ ! -x "$DEFAULT_PYTHON" ]; then
  DEFAULT_PYTHON="python3"
fi
PYTHON_BIN="${COSYVOICE_PYTHON:-"$DEFAULT_PYTHON"}"
MODELSCOPE_CACHE="${MODELSCOPE_CACHE:-"$RUNTIME_DIR/modelscope-cache"}"

if [ ! -f "$REPO_DIR/runtime/python/fastapi/server.py" ]; then
  cat >&2 <<MSG
[cosyvoice:start] CosyVoice repo not found.
Expected: $REPO_DIR/runtime/python/fastapi/server.py

Prepare an isolated runtime outside the Alice Node app:
  mkdir -p "$RUNTIME_DIR"
  git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git "$REPO_DIR"
  cd "$REPO_DIR"
  <create an isolated Python 3.10 environment under $RUNTIME_DIR/envs/cosyvoice-py310>
  "$RUNTIME_DIR/envs/cosyvoice-py310/bin/python" -m pip install -r requirements.txt
  "$RUNTIME_DIR/envs/cosyvoice-py310/bin/python" - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download('FunAudioLLM/CosyVoice2-0.5B', local_dir='$DEFAULT_MODEL_DIR')
PY

Then rerun:
  COSYVOICE_REPO_DIR="$REPO_DIR" COSYVOICE_MODEL_DIR="$DEFAULT_MODEL_DIR" COSYVOICE_PORT=$PORT npm run cosyvoice:start
MSG
  exit 2
fi

mkdir -p "$LOG_DIR"

if [ ! -x "$PYTHON_BIN" ]; then
  echo "[cosyvoice:start] Python runtime not found or not executable: $PYTHON_BIN" >&2
  echo "[cosyvoice:start] Set COSYVOICE_PYTHON to the isolated Python 3.10 binary." >&2
  exit 2
fi

if [ ! -f "$MODEL_DIR/cosyvoice2.yaml" ] && [ ! -f "$MODEL_DIR/cosyvoice.yaml" ] && [ ! -f "$MODEL_DIR/config.yaml" ]; then
  echo "[cosyvoice:start] Local model directory is not ready: $MODEL_DIR" >&2
  echo "[cosyvoice:start] Download FunAudioLLM/CosyVoice2-0.5B into runtime/cosyvoice/pretrained_models/CosyVoice2-0.5B-hf first, or set COSYVOICE_MODEL_DIR explicitly." >&2
  exit 2
fi

for required_model_file in llm.pt flow.pt hift.pt; do
  if [ ! -f "$MODEL_DIR/$required_model_file" ]; then
    echo "[cosyvoice:start] Missing model file: $MODEL_DIR/$required_model_file" >&2
    echo "[cosyvoice:start] The CosyVoice2 model download is incomplete; finish downloading FunAudioLLM/CosyVoice2-0.5B before starting FastAPI." >&2
    exit 2
  fi
done

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "[cosyvoice:start] already running pid=$(cat "$PID_FILE")"
  exit 0
fi

cd "$REPO_DIR/runtime/python/fastapi"
MODELSCOPE_CACHE="$MODELSCOPE_CACHE" nohup "$PYTHON_BIN" server.py --port "$PORT" --model_dir "$MODEL_DIR" > "$LOG_DIR/fastapi.log" 2>&1 &
PID="$!"
echo "$PID" > "$PID_FILE"
echo "[cosyvoice:start] started pid=$PID port=$PORT model_dir=$MODEL_DIR"
echo "[cosyvoice:start] log: $LOG_DIR/fastapi.log"
echo "[cosyvoice:start] Alice env: COSYVOICE_BASE_URL=http://127.0.0.1:$PORT COSYVOICE_API_STYLE=official_fastapi COSYVOICE_API_MODE=sft"
