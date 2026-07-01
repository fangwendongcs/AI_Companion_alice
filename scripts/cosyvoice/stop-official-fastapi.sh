#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${COSYVOICE_RUNTIME_DIR:-"$ROOT_DIR/runtime/cosyvoice"}"
PID_FILE="$RUNTIME_DIR/cosyvoice-fastapi.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "[cosyvoice:stop] no pid file: $PID_FILE"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if ! kill -0 "$PID" 2>/dev/null; then
  echo "[cosyvoice:stop] process already stopped pid=$PID"
  rm -f "$PID_FILE"
  exit 0
fi

kill "$PID"
sleep 1
if kill -0 "$PID" 2>/dev/null; then
  echo "[cosyvoice:stop] process still running after SIGTERM pid=$PID"
  exit 1
fi

rm -f "$PID_FILE"
echo "[cosyvoice:stop] stopped pid=$PID"
