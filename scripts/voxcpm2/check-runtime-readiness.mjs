import { access, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const rootDir = process.cwd();
const runtimeDir = process.env.VOXCPM2_RUNTIME_DIR || path.join(rootDir, 'runtime/voxcpm2');
const pythonBin = process.env.VOXCPM2_PYTHON || path.join(runtimeDir, 'envs/voxcpm-py311/bin/python');
const modelDir = process.env.VOXCPM2_MODEL_DIR || path.join(runtimeDir, 'models/VoxCPM2');
const baseUrl = normalizeBaseUrl(process.env.VOXCPM2_BASE_URL || 'http://127.0.0.1:55000');
const checkEndpoint = process.argv.includes('--endpoint');
const failures = [];
const notes = [];

await checkFiles();
checkPython();
if (checkEndpoint) await checkHealth();

if (failures.length) {
  console.error('[check-voxcpm2-runtime] failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

notes.forEach((note) => console.log(`[check-voxcpm2-runtime] ${note}`));
console.log('[check-voxcpm2-runtime] ok');

async function checkFiles() {
  const required = ['config.json', 'model.safetensors'];
  for (const name of required) {
    const file = path.join(modelDir, name);
    try {
      const info = await stat(file);
      if (!info.isFile() || info.size <= 0) failures.push(`invalid model file: ${file}`);
      else notes.push(`${name}=${formatBytes(info.size)}`);
    } catch {
      failures.push(`missing model file: ${file}`);
    }
  }
  const audioVae = await firstExisting(['audiovae.safetensors', 'audiovae.pth']);
  if (!audioVae) failures.push(`missing AudioVAE checkpoint in ${modelDir}`);
  else notes.push(`${path.basename(audioVae.path)}=${formatBytes(audioVae.size)}`);

  try {
    const config = JSON.parse(await readFile(path.join(modelDir, 'config.json'), 'utf8'));
    if (String(config.architecture || '').toLowerCase() !== 'voxcpm2') {
      failures.push(`model architecture must be voxcpm2, got ${config.architecture || 'missing'}`);
    }
  } catch (error) {
    failures.push(`invalid model config: ${error?.message || error}`);
  }
}

function checkPython() {
  const probe = spawnSync(pythonBin, ['-c', `
import json, sys, torch, voxcpm
print(json.dumps({
  'python': sys.version.split()[0],
  'torch': torch.__version__,
  'mpsBuilt': bool(torch.backends.mps.is_built()),
  'mpsAvailable': bool(torch.backends.mps.is_available()),
  'package': getattr(voxcpm, '__version__', 'unknown')
}))
`], { encoding: 'utf8' });
  if (probe.status !== 0) {
    failures.push(`VoxCPM2 Python runtime unavailable: ${(probe.stderr || probe.stdout || '').trim()}`);
    return;
  }
  try {
    const data = JSON.parse(probe.stdout);
    if (!data.mpsBuilt || !data.mpsAvailable) failures.push('PyTorch MPS is not built and available on this Mac.');
    notes.push(`python=${data.python} torch=${data.torch} package=${data.package} mpsAvailable=${data.mpsAvailable}`);
  } catch (error) {
    failures.push(`invalid Python readiness output: ${error?.message || error}`);
  }
}

async function checkHealth() {
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) {
      failures.push(`health endpoint returned HTTP ${response.status}`);
      return;
    }
    const health = await response.json();
    if (health.ready !== true) failures.push('health endpoint did not report ready=true');
    if (health.device !== 'mps') failures.push(`runtime must use MPS on this Mac, got ${health.device || 'unknown'}`);
    if (health.sampleRate !== 48000) failures.push(`VoxCPM2 sampleRate must be 48000, got ${health.sampleRate}`);
    notes.push(`endpoint=${baseUrl} device=${health.device} loadMs=${health.loadMs} peakRssBytes=${health.peakRssBytes}`);
  } catch (error) {
    failures.push(`health endpoint not reachable at ${baseUrl}: ${error?.message || error}`);
  }
}

async function firstExisting(names) {
  for (const name of names) {
    const file = path.join(modelDir, name);
    try {
      await access(file);
      const info = await stat(file);
      if (info.isFile() && info.size > 0) return { path: file, size: info.size };
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
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)}GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(2)}MB`;
  return `${value}B`;
}
