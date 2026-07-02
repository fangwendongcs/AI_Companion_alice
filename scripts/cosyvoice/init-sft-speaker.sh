#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${COSYVOICE_RUNTIME_DIR:-"$ROOT_DIR/runtime/cosyvoice"}"
REPO_DIR="${COSYVOICE_REPO_DIR:-"$RUNTIME_DIR/CosyVoice"}"
MODEL_DIR="${COSYVOICE_MODEL_DIR:-"$RUNTIME_DIR/pretrained_models/CosyVoice2-0.5B-hf"}"
PYTHON_BIN="${COSYVOICE_PYTHON:-"$RUNTIME_DIR/envs/cosyvoice-py310/bin/python"}"
SPEAKER_ID="${COSYVOICE_SPEAKER_ID:-"${COSYVOICE_VOICE_ID:-中文女}"}"
PROMPT_WAV="${COSYVOICE_SPEAKER_PROMPT_WAV:-"$REPO_DIR/asset/zero_shot_prompt.wav"}"
PROMPT_TEXT="${COSYVOICE_SPEAKER_PROMPT_TEXT:-希望你以后能够做的比我还好呦。}"
MODELSCOPE_CACHE="${MODELSCOPE_CACHE:-"$RUNTIME_DIR/modelscope-cache"}"
MPLCONFIGDIR="${MPLCONFIGDIR:-"$RUNTIME_DIR/matplotlib-cache"}"
mkdir -p "$MODELSCOPE_CACHE" "$MPLCONFIGDIR"

if [ ! -x "$PYTHON_BIN" ]; then
  echo "[cosyvoice:init-speaker] Python runtime not found: $PYTHON_BIN" >&2
  echo "[cosyvoice:init-speaker] Create runtime/cosyvoice/envs/cosyvoice-py310 first." >&2
  exit 2
fi

if [ ! -f "$REPO_DIR/cosyvoice/cli/cosyvoice.py" ]; then
  echo "[cosyvoice:init-speaker] CosyVoice repo not found: $REPO_DIR" >&2
  echo "[cosyvoice:init-speaker] Clone https://github.com/FunAudioLLM/CosyVoice.git into runtime/cosyvoice/CosyVoice first." >&2
  exit 2
fi

if [ ! -f "$MODEL_DIR/cosyvoice2.yaml" ] && [ ! -f "$MODEL_DIR/cosyvoice.yaml" ] && [ ! -f "$MODEL_DIR/config.yaml" ]; then
  echo "[cosyvoice:init-speaker] Model config not found in $MODEL_DIR" >&2
  echo "[cosyvoice:init-speaker] Download FunAudioLLM/CosyVoice2-0.5B first, or set COSYVOICE_MODEL_DIR." >&2
  exit 2
fi

if [ ! -f "$PROMPT_WAV" ]; then
  echo "[cosyvoice:init-speaker] Prompt wav not found: $PROMPT_WAV" >&2
  echo "[cosyvoice:init-speaker] Set COSYVOICE_SPEAKER_PROMPT_WAV to a local wav file." >&2
  exit 2
fi

MODELSCOPE_CACHE="$MODELSCOPE_CACHE" \
MPLCONFIGDIR="$MPLCONFIGDIR" \
PYTHONPATH="$REPO_DIR:$REPO_DIR/third_party/Matcha-TTS" \
"$PYTHON_BIN" - "$MODEL_DIR" "$PROMPT_WAV" "$PROMPT_TEXT" "$SPEAKER_ID" <<'PY'
import json
import os
import sys

import torch
from cosyvoice.cli.cosyvoice import AutoModel

model_dir, prompt_wav, prompt_text, speaker_id = sys.argv[1:5]
spk_path = os.path.join(model_dir, 'spk2info.pt')

def ensure_embedding_compatibility(spk_info):
    item = spk_info[speaker_id]
    changed = False
    if 'embedding' not in item:
        if 'llm_embedding' in item:
            item['embedding'] = item['llm_embedding']
            changed = True
        elif 'flow_embedding' in item:
            item['embedding'] = item['flow_embedding']
            changed = True
    spk_info[speaker_id] = item
    return changed

def validate_existing():
    if not os.path.exists(spk_path):
        return None
    spk_info = torch.load(spk_path, map_location='cpu', weights_only=True)
    if speaker_id not in spk_info:
        return None
    changed = ensure_embedding_compatibility(spk_info)
    item = spk_info[speaker_id]
    missing = [key for key in ('embedding', 'llm_embedding', 'flow_embedding') if key not in item]
    if missing:
        return None
    if changed:
        torch.save(spk_info, spk_path)
    return {
        'speakerId': speaker_id,
        'spk2info': spk_path,
        'created': False,
        'updatedEmbeddingCompatibility': changed,
        'availableSpeakers': list(spk_info.keys())
    }

existing = validate_existing()
if existing:
    print(json.dumps(existing, ensure_ascii=False, indent=2))
    raise SystemExit(0)

cosyvoice = AutoModel(model_dir=model_dir)
before = set(cosyvoice.list_available_spks())
if speaker_id not in before:
    cosyvoice.add_zero_shot_spk(prompt_text, prompt_wav, speaker_id)
    cosyvoice.save_spkinfo()

if not os.path.exists(spk_path):
    raise SystemExit(f'spk2info.pt was not created: {spk_path}')

spk_info = torch.load(spk_path, map_location='cpu', weights_only=True)
if speaker_id not in spk_info:
    raise SystemExit(f'speaker "{speaker_id}" missing from {spk_path}')

item = spk_info[speaker_id]
changed = ensure_embedding_compatibility(spk_info)

missing = [key for key in ('embedding', 'llm_embedding', 'flow_embedding') if key not in item]
if missing:
    raise SystemExit(f'speaker "{speaker_id}" is missing required fields: {missing}')

if changed:
    spk_info[speaker_id] = item
    torch.save(spk_info, spk_path)

print(json.dumps({
    'speakerId': speaker_id,
    'spk2info': spk_path,
    'created': speaker_id not in before,
    'updatedEmbeddingCompatibility': changed,
    'availableSpeakers': cosyvoice.list_available_spks()
}, ensure_ascii=False, indent=2))
PY

COSYVOICE_MODEL_DIR="$MODEL_DIR" \
COSYVOICE_PYTHON="$PYTHON_BIN" \
COSYVOICE_VOICE_ID="$SPEAKER_ID" \
node "$ROOT_DIR/scripts/cosyvoice/check-runtime-readiness.mjs" --no-endpoint
