#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${VOXCPM2_RUNTIME_DIR:-"$ROOT_DIR/runtime/voxcpm2"}"
PID_FILE="$RUNTIME_DIR/voxcpm2-local.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "[voxcpm2:stop] no pid file"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if ! kill -0 "$PID" 2>/dev/null; then
  echo "[voxcpm2:stop] process already stopped pid=$PID"
  rm -f "$PID_FILE"
  exit 0
fi

kill "$PID"
for _attempt in $(seq 1 20); do
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "[voxcpm2:stop] stopped pid=$PID"
    exit 0
  fi
  sleep 0.5
done

echo "[voxcpm2:stop] process did not exit after SIGTERM pid=$PID" >&2
exit 1
