#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${VOXCPM2_RUNTIME_DIR:-"$ROOT_DIR/runtime/voxcpm2"}"
ENV_DIR="${VOXCPM2_ENV_DIR:-"$RUNTIME_DIR/envs/voxcpm-py311"}"
MODEL_DIR="${VOXCPM2_MODEL_DIR:-"$RUNTIME_DIR/models/VoxCPM2"}"
PACKAGE_VERSION="${VOXCPM2_PACKAGE_VERSION:-2.0.3}"
MODEL_ID="${VOXCPM2_MODEL_ID:-openbmb/VoxCPM2}"

if command -v python3.11 >/dev/null 2>&1; then
  BOOTSTRAP_PYTHON="${VOXCPM2_BOOTSTRAP_PYTHON:-$(command -v python3.11)}"
else
  BOOTSTRAP_PYTHON="${VOXCPM2_BOOTSTRAP_PYTHON:-python3}"
fi

"$BOOTSTRAP_PYTHON" - <<'PY'
import sys
if not ((3, 10) <= sys.version_info[:2] < (3, 13)):
    raise SystemExit(f"VoxCPM2 requires Python 3.10-3.12, got {sys.version.split()[0]}")
PY

mkdir -p "$RUNTIME_DIR" "$RUNTIME_DIR/cache" "$RUNTIME_DIR/logs" "$RUNTIME_DIR/output"
if [ ! -x "$ENV_DIR/bin/python" ]; then
  "$BOOTSTRAP_PYTHON" -m venv "$ENV_DIR"
fi

"$ENV_DIR/bin/python" -m pip install --upgrade pip setuptools wheel
"$ENV_DIR/bin/python" -m pip install "voxcpm==$PACKAGE_VERSION"

HF_HOME="${HF_HOME:-"$RUNTIME_DIR/cache/huggingface"}" \
  "$ENV_DIR/bin/python" "$ROOT_DIR/scripts/voxcpm2/download-model.py" \
  --repo-id "$MODEL_ID" \
  --output "$MODEL_DIR"

VOXCPM2_PYTHON="$ENV_DIR/bin/python" \
VOXCPM2_MODEL_DIR="$MODEL_DIR" \
  node "$ROOT_DIR/scripts/voxcpm2/check-runtime-readiness.mjs" --no-endpoint

echo "[voxcpm2:setup] ready package=voxcpm==$PACKAGE_VERSION model=$MODEL_ID"
echo "[voxcpm2:setup] runtime=$RUNTIME_DIR"
