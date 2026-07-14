import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildAliceEnv,
  buildCosyVoiceEnv,
  hasUsableDeepSeekConfig,
  isValidWavBuffer,
  matchesOwnedCommand,
  resolveDemoConfig
} from './demo/demo-manager.mjs';

const failures = [];
const rootDir = process.cwd();
const config = resolveDemoConfig({
  PORT: '',
  COSYVOICE_PORT: '',
  COSYVOICE_BASE_URL: '',
  COSYVOICE_VOICE_ID: ''
}, rootDir);

checkDefaultResolution();
checkRuntimeOverrides();
checkSecretBoundaries();
checkOwnershipFingerprints();
checkWavValidation();
await checkPackageCommands();
await checkGeneratedRuntimeIgnored();

if (failures.length) {
  console.error('[check-demo-lifecycle] failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-demo-lifecycle] ok');

function checkDefaultResolution() {
  assert(config.alicePort === 3000, 'Alice demo port must default to 3000.');
  assert(config.cosyvoicePort === 50000, 'CosyVoice demo port must default to 50000.');
  assert(config.cosyvoiceBaseUrl === 'http://127.0.0.1:50000', 'Empty COSYVOICE_BASE_URL must resolve to the supervised local runtime.');
  assert(config.stateFile === path.join(rootDir, 'runtime/demo/state.json'), 'Demo state must stay under ignored runtime/demo.');
}

function checkRuntimeOverrides() {
  const fakeEnv = {
    COSYVOICE_BASE_URL: '',
    TTS_PROVIDER: 'mock',
    DEEPSEEK_API_KEY: 'fake_deepseek_key_for_test_only',
    CUSTOM_API_KEY: 'replace_with_your_key',
    CUSTOM_BASE_URL: 'https://api.example.com/v1',
    N8N_WEBHOOK_URL: 'https://example.invalid/webhook',
    N8N_WEBHOOK_SECRET: 'replace_with_your_secret'
  };
  const aliceEnv = buildAliceEnv(config, fakeEnv);
  assert(aliceEnv.COSYVOICE_BASE_URL === 'http://127.0.0.1:50000', 'Alice child must override an empty CosyVoice URL.');
  assert(aliceEnv.TTS_PROVIDER === 'cosyvoice', 'Alice demo child must use the real CosyVoice provider.');
  assert(aliceEnv.DEEPSEEK_API_KEY === fakeEnv.DEEPSEEK_API_KEY, 'Alice child must preserve the backend-only DeepSeek credential.');
  assert(aliceEnv.CUSTOM_API_KEY === '' && aliceEnv.CUSTOM_BASE_URL === '', 'Alice demo child must ignore placeholder custom provider configuration.');
  assert(aliceEnv.N8N_WEBHOOK_URL === '' && aliceEnv.N8N_WEBHOOK_SECRET === '', 'Alice demo child must ignore placeholder n8n configuration.');
}

function checkSecretBoundaries() {
  const fakeEnv = {
    PATH: process.env.PATH || '',
    DEEPSEEK_API_KEY: 'fake_deepseek_key_for_test_only',
    API_AUTH_TOKEN: 'fake_demo_auth_token',
    COSYVOICE_API_KEY: 'fake_cosyvoice_key'
  };
  const cosyEnv = buildCosyVoiceEnv(config, fakeEnv);
  assert(!cosyEnv.DEEPSEEK_API_KEY, 'CosyVoice child must not receive the DeepSeek key.');
  assert(!cosyEnv.API_AUTH_TOKEN, 'CosyVoice child must not receive the Alice API auth token.');
  assert(!cosyEnv.COSYVOICE_API_KEY, 'Official local CosyVoice runtime must not receive unused provider credentials.');
  assert(hasUsableDeepSeekConfig(fakeEnv), 'A non-placeholder backend DeepSeek key should pass preflight.');
  assert(!hasUsableDeepSeekConfig({ DEEPSEEK_API_KEY: 'replace_with_your_key' }), 'Placeholder DeepSeek keys must fail preflight.');
}

function checkOwnershipFingerprints() {
  const state = { instanceId: 'demo-instance-test' };
  assert(
    matchesOwnedCommand('supervisor', `${process.execPath} ${config.managerScript} supervise --instance-id=demo-instance-test`, state, config),
    'Supervisor command fingerprint must include script, mode, and instance id.'
  );
  assert(!matchesOwnedCommand('supervisor', `${process.execPath} ${config.managerScript} supervise --instance-id=other`, state, config), 'Supervisor must reject another instance id.');
  assert(matchesOwnedCommand('alice', `${process.execPath} ${config.aliceScript}`, state, config), 'Alice process fingerprint must match backend/server.js.');
  assert(
    matchesOwnedCommand('cosyvoice', `${config.cosyvoicePython} ${config.cosyvoiceServer} --port 50000 --model_dir ${config.cosyvoiceModelDir}`, state, config),
    'CosyVoice process fingerprint must match server, port, and model directory.'
  );
}

function checkWavValidation() {
  const wav = Buffer.alloc(44);
  wav.write('RIFF', 0);
  wav.write('WAVE', 8);
  assert(isValidWavBuffer(wav), 'RIFF/WAVE header must pass validation.');
  assert(!isValidWavBuffer(Buffer.from('not audio')), 'Invalid audio must fail WAV validation.');
}

async function checkPackageCommands() {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  ['demo:start', 'demo:status', 'demo:stop'].forEach((name) => {
    assert(packageJson.scripts?.[name]?.includes('scripts/demo/demo-manager.mjs'), `package.json must define ${name}.`);
  });
  assert(packageJson.scripts?.['check:demo-lifecycle'], 'package.json must define check:demo-lifecycle.');
}

async function checkGeneratedRuntimeIgnored() {
  const gitignore = await readFile('.gitignore', 'utf8');
  assert(gitignore.includes('runtime/demo/'), 'runtime/demo state and logs must be Git-ignored.');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
