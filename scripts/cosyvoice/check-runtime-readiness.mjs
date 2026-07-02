import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const RUNTIME_DIR = process.env.COSYVOICE_RUNTIME_DIR || path.join(ROOT_DIR, 'runtime/cosyvoice');
const MODEL_DIR = process.env.COSYVOICE_MODEL_DIR || path.join(RUNTIME_DIR, 'pretrained_models/CosyVoice2-0.5B-hf');
const PYTHON_BIN = process.env.COSYVOICE_PYTHON || path.join(RUNTIME_DIR, 'envs/cosyvoice-py310/bin/python');
const BASE_URL = normalizeBaseUrl(process.env.COSYVOICE_BASE_URL || 'http://127.0.0.1:50000');
const API_MODE = String(process.env.COSYVOICE_API_MODE || 'sft').trim().toLowerCase();
const VOICE_ID = String(process.env.COSYVOICE_VOICE_ID || process.env.COSYVOICE_SPEAKER_ID || '中文女').trim();
const EXPECTED_SAMPLE_RATE = Number(process.env.COSYVOICE_SAMPLE_RATE || 24000);
const CHECK_ENDPOINT = process.argv.includes('--endpoint');
const NO_ENDPOINT = process.argv.includes('--no-endpoint');

const failures = [];
const notes = [];

await checkModelFiles();
await checkSampleRate();
await checkSpeaker();
if (CHECK_ENDPOINT && !NO_ENDPOINT) await checkEndpoint();

if (failures.length) {
  console.error('[check-cosyvoice-runtime] failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

notes.forEach((note) => console.log(`[check-cosyvoice-runtime] ${note}`));
console.log('[check-cosyvoice-runtime] ok');

async function checkModelFiles() {
  const required = ['llm.pt', 'flow.pt', 'hift.pt'];
  const config = await findConfigFile();
  if (!config) {
    failures.push(`model config missing in ${MODEL_DIR}. Expected cosyvoice2.yaml/cosyvoice.yaml/config.yaml.`);
  } else {
    notes.push(`model config=${path.relative(ROOT_DIR, config)}`);
  }

  for (const file of required) {
    const absolute = path.join(MODEL_DIR, file);
    try {
      const info = await stat(absolute);
      if (!info.isFile() || info.size <= 0) {
        failures.push(`model file is empty or not a file: ${absolute}`);
      } else {
        notes.push(`${file}=${formatBytes(info.size)}`);
      }
    } catch {
      failures.push(`missing model file: ${absolute}`);
    }
  }
}

async function checkSampleRate() {
  const config = await findConfigFile();
  if (!config) return;
  const source = await readFile(config, 'utf8');
  const match = source.match(/^\s*sample_rate:\s*([0-9]+)/m);
  if (!match) {
    failures.push(`sample_rate not found in ${config}`);
    return;
  }
  const modelSampleRate = Number(match[1]);
  if (modelSampleRate !== EXPECTED_SAMPLE_RATE) {
    failures.push(`COSYVOICE_SAMPLE_RATE=${EXPECTED_SAMPLE_RATE} does not match model sample_rate=${modelSampleRate}. Set COSYVOICE_SAMPLE_RATE=${modelSampleRate}.`);
    return;
  }
  notes.push(`sampleRate=${modelSampleRate}`);
}

async function checkSpeaker() {
  if (API_MODE !== 'sft') {
    notes.push(`speaker check skipped for COSYVOICE_API_MODE=${API_MODE}`);
    return;
  }

  const spkPath = path.join(MODEL_DIR, 'spk2info.pt');
  try {
    await access(spkPath);
  } catch {
    failures.push(`missing spk2info.pt for SFT voice "${VOICE_ID}". Run: COSYVOICE_MODEL_DIR="${MODEL_DIR}" COSYVOICE_VOICE_ID="${VOICE_ID}" npm run cosyvoice:init-speaker`);
    return;
  }

  try {
    await access(PYTHON_BIN);
  } catch {
    failures.push(`Python runtime not found for speaker inspection: ${PYTHON_BIN}`);
    return;
  }

  const inspect = spawnSync(PYTHON_BIN, ['-c', `
import json
import sys
import torch
path, speaker_id = sys.argv[1:3]
spk = torch.load(path, map_location='cpu', weights_only=True)
item = spk.get(speaker_id)
print(json.dumps({
    'exists': item is not None,
    'speakers': list(spk.keys()),
    'keys': sorted(list(item.keys())) if item else [],
    'hasEmbedding': bool(item and 'embedding' in item),
    'hasLlmEmbedding': bool(item and 'llm_embedding' in item),
    'hasFlowEmbedding': bool(item and 'flow_embedding' in item)
}, ensure_ascii=False))
`, spkPath, VOICE_ID], {
    encoding: 'utf8'
  });

  if (inspect.status !== 0) {
    failures.push(`failed to inspect spk2info.pt: ${inspect.stderr || inspect.stdout || 'unknown error'}`);
    return;
  }

  const data = JSON.parse(inspect.stdout);
  if (!data.exists) {
    failures.push(`speaker "${VOICE_ID}" missing from spk2info.pt. Run: COSYVOICE_MODEL_DIR="${MODEL_DIR}" COSYVOICE_VOICE_ID="${VOICE_ID}" npm run cosyvoice:init-speaker`);
    return;
  }
  const missing = [];
  if (!data.hasEmbedding) missing.push('embedding');
  if (!data.hasLlmEmbedding) missing.push('llm_embedding');
  if (!data.hasFlowEmbedding) missing.push('flow_embedding');
  if (missing.length) {
    failures.push(`speaker "${VOICE_ID}" is missing ${missing.join(', ')}. Run: COSYVOICE_MODEL_DIR="${MODEL_DIR}" COSYVOICE_VOICE_ID="${VOICE_ID}" npm run cosyvoice:init-speaker`);
    return;
  }
  notes.push(`speaker=${VOICE_ID}`);
}

async function checkEndpoint() {
  const endpoint = `${BASE_URL}/inference_${API_MODE}`;
  if (API_MODE !== 'sft') {
    failures.push(`endpoint check currently expects COSYVOICE_API_MODE=sft, got ${API_MODE}`);
    return;
  }
  const body = new URLSearchParams();
  body.set('tts_text', '你好。');
  body.set('spk_id', VOICE_ID);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      failures.push(`FastAPI endpoint ${endpoint} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
      return;
    }
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) {
      failures.push(`FastAPI endpoint ${endpoint} returned empty audio for speaker "${VOICE_ID}".`);
      return;
    }
    notes.push(`endpoint=${endpoint} rawPcmBytes=${audio.length}`);
  } catch (error) {
    failures.push(`FastAPI endpoint not reachable at ${endpoint}: ${error?.message || error}`);
  }
}

async function findConfigFile() {
  for (const name of ['cosyvoice2.yaml', 'cosyvoice.yaml', 'config.yaml']) {
    const file = path.join(MODEL_DIR, name);
    try {
      await access(file);
      return file;
    } catch {
      // continue
    }
  }
  return null;
}

function normalizeBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

function formatBytes(value) {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)}GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(2)}KB`;
  return `${value}B`;
}
