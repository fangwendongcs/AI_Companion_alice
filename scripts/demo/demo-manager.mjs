import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  appendFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MANAGER_SCRIPT = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(MANAGER_SCRIPT), '../..');
const STATE_VERSION = 1;
const DEFAULT_START_TIMEOUT_MS = 180_000;
const DEFAULT_STOP_TIMEOUT_MS = 20_000;
const DEFAULT_LLM_TIMEOUT_MS = 60_000;
const DEFAULT_TTS_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;
const PLACEHOLDER_PATTERN = /(replace[_-]?with|your[_-]|example|placeholder|changeme|dummy|test[_-]?key)/i;

const command = process.argv[2] || '';

if (isDirectRun()) {
  try {
    await main(command);
  } catch (error) {
    console.error(`[demo:${command || 'unknown'}] ${safeErrorMessage(error)}`);
    process.exitCode = 1;
  }
}

async function main(selectedCommand) {
  if (selectedCommand === 'start') return startDemo();
  if (selectedCommand === 'status') return statusDemo();
  if (selectedCommand === 'stop') return stopDemo();
  if (selectedCommand === 'supervise') return superviseDemo(getArgValue('--instance-id'));
  throw new Error('Usage: demo-manager.mjs start|status|stop');
}

export function resolveDemoConfig(env = process.env, rootDir = ROOT_DIR) {
  const cosyvoiceRuntimeDir = resolvePath(rootDir, env.COSYVOICE_RUNTIME_DIR, 'runtime/cosyvoice');
  const cosyvoiceRepoDir = resolvePath(cosyvoiceRuntimeDir, env.COSYVOICE_REPO_DIR, 'CosyVoice');
  const cosyvoiceModelDir = resolvePath(
    cosyvoiceRuntimeDir,
    env.COSYVOICE_MODEL_DIR,
    'pretrained_models/CosyVoice2-0.5B-hf'
  );
  const defaultPython = path.join(cosyvoiceRuntimeDir, 'envs/cosyvoice-py310/bin/python');
  const cosyvoicePython = String(env.COSYVOICE_PYTHON || '').trim()
    || (existsSync(defaultPython) ? defaultPython : 'python3');
  const alicePort = readPort(env.PORT, 3000);
  const cosyvoicePort = readPort(env.COSYVOICE_PORT, 50000);
  const demoRuntimeDir = path.join(rootDir, 'runtime/demo');
  const logDir = path.join(demoRuntimeDir, 'logs');

  return {
    rootDir,
    managerScript: path.join(rootDir, 'scripts/demo/demo-manager.mjs'),
    stateFile: path.join(demoRuntimeDir, 'state.json'),
    demoRuntimeDir,
    logDir,
    supervisorLog: path.join(logDir, 'supervisor.log'),
    aliceLog: path.join(logDir, 'alice.log'),
    cosyvoiceLog: path.join(logDir, 'cosyvoice.log'),
    aliceScript: path.join(rootDir, 'backend/server.js'),
    alicePort,
    aliceBaseUrl: `http://127.0.0.1:${alicePort}`,
    demoUrl: `http://localhost:${alicePort}`,
    cosyvoicePort,
    cosyvoiceBaseUrl: `http://127.0.0.1:${cosyvoicePort}`,
    cosyvoiceRuntimeDir,
    cosyvoiceRepoDir,
    cosyvoiceServer: path.join(cosyvoiceRepoDir, 'runtime/python/fastapi/server.py'),
    cosyvoiceServerCwd: path.join(cosyvoiceRepoDir, 'runtime/python/fastapi'),
    cosyvoiceModelDir,
    cosyvoicePython,
    cosyvoiceCheckScript: path.join(rootDir, 'scripts/cosyvoice/check-runtime-readiness.mjs'),
    cosyvoiceVoiceId: String(env.COSYVOICE_VOICE_ID || '中文女').trim() || '中文女',
    cosyvoiceSampleRate: readPositiveNumber(env.COSYVOICE_SAMPLE_RATE, 24_000),
    startTimeoutMs: readPositiveNumber(env.DEMO_START_TIMEOUT_MS, DEFAULT_START_TIMEOUT_MS),
    stopTimeoutMs: readPositiveNumber(env.DEMO_STOP_TIMEOUT_MS, DEFAULT_STOP_TIMEOUT_MS),
    llmTimeoutMs: readPositiveNumber(env.DEMO_LLM_CHECK_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS),
    ttsTimeoutMs: readPositiveNumber(env.DEMO_TTS_CHECK_TIMEOUT_MS, DEFAULT_TTS_TIMEOUT_MS)
  };
}

export function buildAliceEnv(config, env = process.env) {
  const result = {
    ...env,
    PORT: String(config.alicePort),
    TTS_PROVIDER: 'cosyvoice',
    COSYVOICE_BASE_URL: config.cosyvoiceBaseUrl,
    COSYVOICE_PORT: String(config.cosyvoicePort),
    COSYVOICE_API_STYLE: 'official_fastapi',
    COSYVOICE_API_MODE: String(env.COSYVOICE_API_MODE || 'sft').trim() || 'sft',
    COSYVOICE_VOICE_ID: config.cosyvoiceVoiceId,
    COSYVOICE_SAMPLE_RATE: String(config.cosyvoiceSampleRate)
  };
  Object.entries(result).forEach(([name, value]) => {
    const isCredential = /(API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name);
    const isOptionalUrl = ['N8N_WEBHOOK_URL', 'CUSTOM_BASE_URL'].includes(name);
    if ((isCredential || isOptionalUrl) && PLACEHOLDER_PATTERN.test(String(value || ''))) {
      result[name] = '';
    }
  });
  if (!result.N8N_WEBHOOK_URL) result.N8N_WEBHOOK_SECRET = '';
  return result;
}

export function buildCosyVoiceEnv(config, env = process.env) {
  const result = { ...env };
  Object.keys(result).forEach((name) => {
    if (/(API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name)) delete result[name];
  });
  return {
    ...result,
    COSYVOICE_RUNTIME_DIR: config.cosyvoiceRuntimeDir,
    COSYVOICE_REPO_DIR: config.cosyvoiceRepoDir,
    COSYVOICE_MODEL_DIR: config.cosyvoiceModelDir,
    COSYVOICE_PYTHON: config.cosyvoicePython,
    COSYVOICE_PORT: String(config.cosyvoicePort),
    COSYVOICE_BASE_URL: config.cosyvoiceBaseUrl,
    COSYVOICE_API_STYLE: 'official_fastapi',
    COSYVOICE_API_MODE: String(env.COSYVOICE_API_MODE || 'sft').trim() || 'sft',
    COSYVOICE_VOICE_ID: config.cosyvoiceVoiceId,
    COSYVOICE_SAMPLE_RATE: String(config.cosyvoiceSampleRate),
    MODELSCOPE_CACHE: String(env.MODELSCOPE_CACHE || path.join(config.cosyvoiceRuntimeDir, 'modelscope-cache')),
    MPLCONFIGDIR: String(env.MPLCONFIGDIR || path.join(config.cosyvoiceRuntimeDir, 'matplotlib-cache'))
  };
}

export function hasUsableDeepSeekConfig(env = process.env) {
  const value = String(env.DEEPSEEK_API_KEY || env.LLM_API_KEY || '').trim();
  return value.length >= 12 && !PLACEHOLDER_PATTERN.test(value) && !/[\r\n]/.test(value);
}

export function isValidWavBuffer(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= 44
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WAVE';
}

export function matchesOwnedCommand(kind, commandLine, state, config) {
  const value = String(commandLine || '');
  if (!value || !state?.instanceId) return false;
  if (kind === 'supervisor') {
    return value.includes(config.managerScript)
      && value.includes('supervise')
      && value.includes(state.instanceId);
  }
  if (kind === 'alice') {
    return value.includes(config.aliceScript);
  }
  if (kind === 'cosyvoice') {
    return value.includes(config.cosyvoiceServer)
      && value.includes(`--port ${config.cosyvoicePort}`)
      && value.includes(config.cosyvoiceModelDir);
  }
  return false;
}

async function startDemo() {
  const config = resolveDemoConfig();
  await ensureRuntimeDirs(config);
  assertStartConfiguration(config);

  const existing = await readState(config);
  if (existing && await isOwnedProcessAlive('supervisor', existing.supervisorPid, existing, config)) {
    const result = await collectDemoStatus(config, existing, { runLiveChecks: true });
    printDemoStatus(result, { heading: 'already running', command: 'start' });
    if (!result.ready) process.exitCode = 1;
    return;
  }

  if (existing) {
    const ownedChildren = await ownedChildrenAlive(existing, config);
    if (ownedChildren.length) {
      throw new Error(`stale supervisor state still owns ${ownedChildren.join(', ')}; run npm run demo:stop first`);
    }
    await removeState(config, existing.instanceId);
  }

  const occupied = [];
  if (await isPortOpen(config.alicePort)) occupied.push(`Alice:${config.alicePort}`);
  if (await isPortOpen(config.cosyvoicePort)) occupied.push(`CosyVoice:${config.cosyvoicePort}`);
  if (occupied.length) {
    throw new Error(`required port already in use by an unmanaged process (${occupied.join(', ')}); demo:start will not stop it`);
  }

  const instanceId = randomUUID();
  await appendFile(
    config.supervisorLog,
    `\n[demo-supervisor] start requested at ${new Date().toISOString()} instance=${instanceId}\n`,
    { mode: 0o600 }
  );
  const supervisorLogHandle = await open(config.supervisorLog, 'a', 0o600);
  const supervisor = spawn(process.execPath, [
    config.managerScript,
    'supervise',
    `--instance-id=${instanceId}`
  ], {
    cwd: config.rootDir,
    detached: true,
    env: process.env,
    stdio: ['ignore', supervisorLogHandle.fd, supervisorLogHandle.fd]
  });
  supervisor.unref();
  await supervisorLogHandle.close();

  try {
    const startingState = await waitForState(config, instanceId, supervisor.pid, 15_000);
    await waitForBaseReadiness(config, startingState, config.startTimeoutMs);
    const readyState = await readState(config);
    if (!readyState || readyState.instanceId !== instanceId) {
      throw new Error(`supervisor state disappeared after readiness; see ${config.supervisorLog}`);
    }
    const result = await collectDemoStatus(config, readyState, { runLiveChecks: true });
    if (!result.ready) {
      await stopDemo({ silent: true });
      throw new Error(`live readiness failed: ${result.errors.join('; ') || 'unknown readiness error'}`);
    }
    await writeState(config, {
      ...readyState,
      status: 'ready',
      readyAt: new Date().toISOString()
    });
    printDemoStatus(result, { heading: 'ready', command: 'start' });
  } catch (error) {
    if (await isProcessAlive(supervisor.pid)) {
      try {
        process.kill(supervisor.pid, 'SIGTERM');
      } catch {
        // The supervisor may have exited between the liveness check and signal.
      }
    }
    throw error;
  }
}

async function statusDemo() {
  const config = resolveDemoConfig();
  const state = await readState(config);
  if (!state) {
    const alicePortOpen = await isPortOpen(config.alicePort);
    const cosyvoicePortOpen = await isPortOpen(config.cosyvoicePort);
    console.log('[demo:status] stopped');
    console.log(`Demo: ${config.demoUrl}`);
    console.log(`Ports: alice=${alicePortOpen ? 'occupied-unmanaged' : 'free'}:${config.alicePort} cosyvoice=${cosyvoicePortOpen ? 'occupied-unmanaged' : 'free'}:${config.cosyvoicePort}`);
    process.exitCode = alicePortOpen || cosyvoicePortOpen ? 1 : 0;
    return;
  }

  const result = await collectDemoStatus(config, state, { runLiveChecks: true });
  printDemoStatus(result, { heading: result.ready ? 'ready' : state.status || 'not ready', command: 'status' });
  if (!result.ready) process.exitCode = 1;
}

async function stopDemo({ silent = false } = {}) {
  const config = resolveDemoConfig();
  const state = await readState(config);
  if (!state) {
    if (!silent) console.log('[demo:stop] already stopped; no managed state file');
    return;
  }

  const stoppedPids = [];
  if (await isOwnedProcessAlive('supervisor', state.supervisorPid, state, config)) {
    stoppedPids.push(state.supervisorPid);
    process.kill(state.supervisorPid, 'SIGTERM');
    const supervisorExited = await waitUntil(
      async () => !await isProcessAlive(state.supervisorPid),
      config.stopTimeoutMs
    );
    if (!supervisorExited && await isOwnedProcessAlive('supervisor', state.supervisorPid, state, config)) {
      process.kill(state.supervisorPid, 'SIGKILL');
    }
  }

  for (const [kind, pid] of [
    ['alice', state.alicePid],
    ['cosyvoice', state.cosyvoicePid]
  ]) {
    if (!await isOwnedProcessAlive(kind, pid, state, config)) continue;
    stoppedPids.push(pid);
    process.kill(pid, 'SIGTERM');
    const exited = await waitUntil(
      async () => !await isProcessAlive(pid),
      Math.min(config.stopTimeoutMs, 8_000)
    );
    if (!exited && await isOwnedProcessAlive(kind, pid, state, config)) {
      process.kill(pid, 'SIGKILL');
    }
  }

  await waitUntil(async () => {
    const current = await readState(config);
    return !current || current.instanceId !== state.instanceId;
  }, config.stopTimeoutMs);
  await removeState(config, state.instanceId);

  const portsReleased = await waitUntil(async () => (
    !await isPortOpen(config.alicePort) && !await isPortOpen(config.cosyvoicePort)
  ), config.stopTimeoutMs);

  if (!silent) {
    console.log(`[demo:stop] ${portsReleased ? 'stopped' : 'managed processes stopped; port still occupied'}`);
    console.log(`PIDs: ${stoppedPids.length ? stoppedPids.join(', ') : 'already exited'}`);
    console.log(`State: ${config.stateFile} (removed)`);
    console.log(`Logs kept: ${config.logDir}`);
  }
  if (!portsReleased) process.exitCode = 1;
}

async function superviseDemo(instanceId) {
  if (!instanceId) throw new Error('supervisor instance id is required');
  const config = resolveDemoConfig();
  await ensureRuntimeDirs(config);

  let state = createState(config, instanceId);
  let aliceProcess = null;
  let cosyvoiceProcess = null;
  let stopping = false;
  let finishLifetime = null;
  const lifetime = new Promise((resolve) => {
    finishLifetime = resolve;
  });

  const shutdown = async ({ reason, exitCode = 0, removeManagedState = true } = {}) => {
    if (stopping) return;
    stopping = true;
    state = {
      ...state,
      status: exitCode === 0 ? 'stopping' : 'failed',
      stoppedReason: safeErrorMessage(reason || 'shutdown'),
      updatedAt: new Date().toISOString()
    };
    await writeState(config, state).catch(() => {});
    await Promise.all([
      terminateChild(aliceProcess),
      terminateChild(cosyvoiceProcess)
    ]);
    if (removeManagedState) {
      await removeState(config, instanceId);
    } else {
      await writeState(config, state).catch(() => {});
    }
    process.exitCode = exitCode;
    finishLifetime();
  };

  process.once('SIGTERM', () => void shutdown({ reason: 'requested_stop' }));
  process.once('SIGINT', () => void shutdown({ reason: 'requested_interrupt' }));
  process.once('uncaughtException', (error) => void shutdown({
    reason: `uncaught_exception:${safeErrorMessage(error)}`,
    exitCode: 1,
    removeManagedState: false
  }));
  process.once('unhandledRejection', (error) => void shutdown({
    reason: `unhandled_rejection:${safeErrorMessage(error)}`,
    exitCode: 1,
    removeManagedState: false
  }));

  await writeState(config, state);

  try {
    const cosyvoiceEnv = buildCosyVoiceEnv(config);
    await runCommand(process.execPath, [config.cosyvoiceCheckScript, '--no-endpoint'], {
      cwd: config.rootDir,
      env: cosyvoiceEnv,
      stdio: 'inherit'
    });

    const cosyvoiceLogHandle = await open(config.cosyvoiceLog, 'a', 0o600);
    cosyvoiceProcess = spawn(config.cosyvoicePython, [
      config.cosyvoiceServer,
      '--port',
      String(config.cosyvoicePort),
      '--model_dir',
      config.cosyvoiceModelDir
    ], {
      cwd: config.cosyvoiceServerCwd,
      env: cosyvoiceEnv,
      stdio: ['ignore', cosyvoiceLogHandle.fd, cosyvoiceLogHandle.fd]
    });
    await cosyvoiceLogHandle.close();

    const aliceLogHandle = await open(config.aliceLog, 'a', 0o600);
    aliceProcess = spawn(process.execPath, [config.aliceScript], {
      cwd: config.rootDir,
      env: buildAliceEnv(config),
      stdio: ['ignore', aliceLogHandle.fd, aliceLogHandle.fd]
    });
    await aliceLogHandle.close();

    state = {
      ...state,
      status: 'starting',
      alicePid: aliceProcess.pid,
      cosyvoicePid: cosyvoiceProcess.pid,
      updatedAt: new Date().toISOString()
    };
    await writeState(config, state);

    aliceProcess.once('error', (error) => void shutdown({
      reason: `alice_spawn_error:${safeErrorMessage(error)}`,
      exitCode: 1,
      removeManagedState: false
    }));
    cosyvoiceProcess.once('error', (error) => void shutdown({
      reason: `cosyvoice_spawn_error:${safeErrorMessage(error)}`,
      exitCode: 1,
      removeManagedState: false
    }));
    aliceProcess.once('exit', (code, signal) => {
      if (!stopping) void shutdown({
        reason: `alice_exited:code=${code ?? '-'} signal=${signal || '-'}`,
        exitCode: 1,
        removeManagedState: false
      });
    });
    cosyvoiceProcess.once('exit', (code, signal) => {
      if (!stopping) void shutdown({
        reason: `cosyvoice_exited:code=${code ?? '-'} signal=${signal || '-'}`,
        exitCode: 1,
        removeManagedState: false
      });
    });
  } catch (error) {
    await shutdown({
      reason: `startup_failed:${safeErrorMessage(error)}`,
      exitCode: 1,
      removeManagedState: false
    });
  }

  await lifetime;
}

async function collectDemoStatus(config, state, { runLiveChecks = true } = {}) {
  const errors = [];
  const [supervisorOwned, aliceOwned, cosyvoiceOwned, alicePortOpen, cosyvoicePortOpen] = await Promise.all([
    isOwnedProcessAlive('supervisor', state.supervisorPid, state, config),
    isOwnedProcessAlive('alice', state.alicePid, state, config),
    isOwnedProcessAlive('cosyvoice', state.cosyvoicePid, state, config),
    isPortOpen(config.alicePort),
    isPortOpen(config.cosyvoicePort)
  ]);

  const processes = {
    supervisor: { pid: state.supervisorPid || null, owned: supervisorOwned },
    alice: { pid: state.alicePid || null, owned: aliceOwned },
    cosyvoice: { pid: state.cosyvoicePid || null, owned: cosyvoiceOwned }
  };
  if (!supervisorOwned) errors.push('supervisor process is not running or is not owned');
  if (!aliceOwned) errors.push('Alice process is not running or is not owned');
  if (!cosyvoiceOwned) errors.push('CosyVoice process is not running or is not owned');
  if (!alicePortOpen) errors.push(`Alice port ${config.alicePort} is not listening`);
  if (!cosyvoicePortOpen) errors.push(`CosyVoice port ${config.cosyvoicePort} is not listening`);

  let web = { ready: false };
  let providers = { ready: false };
  if (alicePortOpen) {
    web = await checkWeb(config);
    providers = await checkProviders(config);
    if (!web.ready) errors.push(web.error || 'Alice web is not reachable');
    if (!providers.ready) errors.push(providers.error || 'provider readiness is not ready');
  }

  let llm = { ready: false, provider: 'deepseek' };
  let tts = { ready: false, provider: 'cosyvoice' };
  if (runLiveChecks && web.ready && providers.ready) {
    [llm, tts] = await Promise.all([
      checkDeepSeek(config),
      checkCosyVoiceWav(config)
    ]);
    if (!llm.ready) errors.push(llm.error || 'DeepSeek live check failed');
    if (!tts.ready) errors.push(tts.error || 'CosyVoice live WAV check failed');
  }

  return {
    ready: errors.length === 0
      && web.ready
      && providers.ready
      && (!runLiveChecks || (llm.ready && tts.ready)),
    state,
    processes,
    ports: {
      alice: { port: config.alicePort, listening: alicePortOpen },
      cosyvoice: { port: config.cosyvoicePort, listening: cosyvoicePortOpen }
    },
    web,
    providers,
    llm,
    tts,
    errors,
    config
  };
}

async function checkWeb(config) {
  const startedAt = Date.now();
  try {
    const health = await fetchJson(`${config.aliceBaseUrl}/api/health`, {}, 5_000);
    const page = await fetchWithTimeout(config.demoUrl, {}, 5_000);
    if (!page.ok || health?.ok !== true) throw new Error('health or page response is not HTTP 200');
    return { ready: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ready: false, error: `Alice web check failed (${safeErrorMessage(error)})` };
  }
}

async function checkProviders(config) {
  try {
    const payload = await fetchJson(`${config.aliceBaseUrl}/api/providers`, {}, 10_000);
    const llm = payload?.data?.llm?.find((item) => item.provider === 'deepseek');
    const tts = payload?.data?.tts?.find((item) => item.provider === 'cosyvoice');
    const ready = llm?.configured === true
      && llm?.status === 'ready'
      && tts?.configured === true
      && tts?.available === true
      && tts?.health?.live === true;
    return {
      ready,
      deepseekConfigured: llm?.configured === true,
      cosyvoiceLive: tts?.health?.live === true,
      error: ready ? null : 'DeepSeek configuration or CosyVoice endpoint readiness is not ready'
    };
  } catch (error) {
    return { ready: false, error: `provider status check failed (${safeErrorMessage(error)})` };
  }
}

async function checkDeepSeek(config) {
  const startedAt = Date.now();
  try {
    const payload = await fetchJson(`${config.aliceBaseUrl}/api/dialogue`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({
        message: '请只回复：DEMO_LLM_READY',
        provider: 'deepseek',
        sessionId: `demo_status_${Date.now()}`,
        avatarId: 'alice',
        options: {
          useMemory: false,
          useRag: false,
          useWorkflow: false
        }
      })
    }, config.llmTimeoutMs);
    const data = payload?.data || payload;
    const reply = String(data?.reply_text || data?.reply || '');
    const ready = payload?.ok === true
      && data?.meta?.mode === 'llm_only'
      && data?.meta?.provider === 'deepseek'
      && reply.includes('DEMO_LLM_READY');
    return {
      ready,
      provider: 'deepseek',
      model: data?.meta?.model || null,
      mode: data?.meta?.mode || null,
      latencyMs: Date.now() - startedAt,
      error: ready ? null : 'DeepSeek response used fallback or did not return the expected marker'
    };
  } catch (error) {
    return {
      ready: false,
      provider: 'deepseek',
      latencyMs: Date.now() - startedAt,
      error: `DeepSeek live request failed (${safeErrorMessage(error)})`
    };
  }
}

async function checkCosyVoiceWav(config) {
  const startedAt = Date.now();
  try {
    const payload = await fetchJson(`${config.aliceBaseUrl}/api/tts`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({
        text: 'Alice Demo 语音服务正常。',
        provider: 'cosyvoice',
        voiceId: config.cosyvoiceVoiceId,
        locale: 'zh-CN',
        emotion: 'warm',
        tone: 'gentle',
        stream: false,
        responseFormat: 'json'
      })
    }, config.ttsTimeoutMs);
    const data = payload?.data || payload;
    const buffer = data?.audioBase64 ? Buffer.from(data.audioBase64, 'base64') : Buffer.alloc(0);
    const ready = payload?.ok === true
      && data?.tts_status === 'ok'
      && data?.provider === 'cosyvoice'
      && data?.format === 'wav'
      && isValidWavBuffer(buffer);
    return {
      ready,
      provider: 'cosyvoice',
      format: data?.format || null,
      audioBytes: buffer.length,
      sampleRate: data?.sampleRate || null,
      latencyMs: Date.now() - startedAt,
      error: ready ? null : 'CosyVoice did not return a valid RIFF/WAVE Audio Result'
    };
  } catch (error) {
    return {
      ready: false,
      provider: 'cosyvoice',
      latencyMs: Date.now() - startedAt,
      error: `CosyVoice live WAV request failed (${safeErrorMessage(error)})`
    };
  }
}

function printDemoStatus(result, { heading, command: outputCommand }) {
  const { config, processes, ports, llm, tts, web, errors } = result;
  console.log(`[demo:${outputCommand}] ${heading}`);
  console.log(`Demo: ${config.demoUrl}`);
  console.log(`Processes: supervisor=${processes.supervisor.pid || '-'} alice=${processes.alice.pid || '-'} cosyvoice=${processes.cosyvoice.pid || '-'}`);
  console.log(`Ports: alice=${ports.alice.listening ? 'ready' : 'down'}:${ports.alice.port} cosyvoice=${ports.cosyvoice.listening ? 'ready' : 'down'}:${ports.cosyvoice.port}`);
  console.log(`Alice: ${web.ready ? 'ready' : 'not_ready'}${web.latencyMs !== undefined ? ` latencyMs=${web.latencyMs}` : ''}`);
  console.log(`LLM: ${llm.ready ? 'ready' : 'not_ready'} provider=deepseek model=${llm.model || '-'} mode=${llm.mode || '-'}${llm.latencyMs !== undefined ? ` latencyMs=${llm.latencyMs}` : ''}`);
  console.log(`TTS: ${tts.ready ? 'ready' : 'not_ready'} provider=cosyvoice format=${tts.format || '-'} audioBytes=${tts.audioBytes || 0}${tts.latencyMs !== undefined ? ` latencyMs=${tts.latencyMs}` : ''}`);
  console.log(`Logs: supervisor=${config.supervisorLog}`);
  console.log(`Logs: alice=${config.aliceLog}`);
  console.log(`Logs: cosyvoice=${config.cosyvoiceLog}`);
  if (errors.length) console.log(`Errors: ${errors.join('; ')}`);
}

function createState(config, instanceId) {
  return {
    version: STATE_VERSION,
    instanceId,
    status: 'starting',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    supervisorPid: process.pid,
    alicePid: null,
    cosyvoicePid: null,
    ports: {
      alice: config.alicePort,
      cosyvoice: config.cosyvoicePort
    },
    logs: {
      supervisor: config.supervisorLog,
      alice: config.aliceLog,
      cosyvoice: config.cosyvoiceLog
    }
  };
}

async function waitForState(config, instanceId, supervisorPid, timeoutMs) {
  const ready = await waitUntil(async () => {
    const state = await readState(config);
    return state?.instanceId === instanceId && state?.supervisorPid === supervisorPid;
  }, timeoutMs);
  if (!ready) {
    throw new Error(`supervisor did not create state within ${timeoutMs}ms; see ${config.supervisorLog}`);
  }
  return readState(config);
}

async function waitForBaseReadiness(config, initialState, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = await readState(config);
    if (!state || state.instanceId !== initialState.instanceId) {
      throw new Error(`supervisor state disappeared during startup; see ${config.supervisorLog}`);
    }
    if (state.status === 'failed') {
      throw new Error(`${state.stoppedReason || 'supervisor failed'}; see ${config.supervisorLog}`);
    }
    if (!await isProcessAlive(state.supervisorPid)) {
      throw new Error(`supervisor exited during startup; see ${config.supervisorLog}`);
    }

    const [aliceReady, cosyvoiceReady] = await Promise.all([
      fetchOk(`${config.aliceBaseUrl}/api/health`, 2_000),
      fetchOk(`${config.cosyvoiceBaseUrl}/openapi.json`, 2_000)
    ]);
    if (aliceReady && cosyvoiceReady) return;
    await delay(1_000);
  }
  throw new Error(`services did not reach endpoint readiness within ${timeoutMs}ms; see ${config.logDir}`);
}

async function ensureRuntimeDirs(config) {
  await mkdir(config.logDir, { recursive: true, mode: 0o700 });
  await mkdir(path.join(config.cosyvoiceRuntimeDir, 'modelscope-cache'), { recursive: true });
  await mkdir(path.join(config.cosyvoiceRuntimeDir, 'matplotlib-cache'), { recursive: true });
}

function assertStartConfiguration(config) {
  if (!hasUsableDeepSeekConfig()) {
    throw new Error('DeepSeek API key is missing or still a placeholder in the backend environment; .env was not modified');
  }
  if (!existsSync(config.cosyvoiceServer)) {
    throw new Error(`CosyVoice server is missing: ${config.cosyvoiceServer}`);
  }
  if (!existsSync(config.cosyvoiceModelDir)) {
    throw new Error(`CosyVoice model directory is missing: ${config.cosyvoiceModelDir}`);
  }
  if (config.cosyvoicePython !== 'python3' && !existsSync(config.cosyvoicePython)) {
    throw new Error(`CosyVoice Python runtime is missing: ${config.cosyvoicePython}`);
  }
}

async function readState(config) {
  try {
    const source = await readFile(config.stateFile, 'utf8');
    const state = JSON.parse(source);
    return state?.version === STATE_VERSION ? state : null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`cannot read demo state: ${safeErrorMessage(error)}`);
  }
}

async function writeState(config, state) {
  await mkdir(config.demoRuntimeDir, { recursive: true, mode: 0o700 });
  const tempFile = `${config.stateFile}.${process.pid}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(tempFile, config.stateFile);
}

async function removeState(config, expectedInstanceId) {
  const current = await readState(config);
  if (!current || (expectedInstanceId && current.instanceId !== expectedInstanceId)) return;
  await rm(config.stateFile, { force: true });
}

async function ownedChildrenAlive(state, config) {
  const result = [];
  if (await isOwnedProcessAlive('alice', state.alicePid, state, config)) result.push('Alice');
  if (await isOwnedProcessAlive('cosyvoice', state.cosyvoicePid, state, config)) result.push('CosyVoice');
  return result;
}

async function isOwnedProcessAlive(kind, pid, state, config) {
  if (!await isProcessAlive(pid)) return false;
  return matchesOwnedCommand(kind, getProcessCommand(pid), state, config);
}

async function isProcessAlive(pid) {
  const number = Number(pid);
  if (!Number.isInteger(number) || number <= 0) return false;
  try {
    process.kill(number, 0);
    return true;
  } catch {
    return false;
  }
}

function getProcessCommand(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

function isPortOpen(port, host = '127.0.0.1', timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function terminateChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try {
    child.kill('SIGTERM');
  } catch {
    return;
  }
  const graceful = await Promise.race([
    exited.then(() => true),
    delay(8_000).then(() => false)
  ]);
  if (!graceful && child.exitCode === null && child.signalCode === null) {
    try {
      child.kill('SIGKILL');
    } catch {
      // Process already exited.
    }
    await Promise.race([exited, delay(2_000)]);
  }
}

function runCommand(executable, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, options);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`preflight exited code=${code ?? '-'} signal=${signal || '-'}`));
    });
  });
}

async function fetchJson(url, options, timeoutMs) {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error('invalid JSON response');
  }
}

function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs)
  });
}

async function fetchOk(url, timeoutMs) {
  try {
    return (await fetchWithTimeout(url, {}, timeoutMs)).ok;
  } catch {
    return false;
  }
}

function buildApiHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  if (String(process.env.REQUIRE_API_AUTH || '').toLowerCase() === 'true') {
    const token = String(process.env.API_AUTH_TOKEN || '').trim();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function waitUntil(check, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) return true;
    await delay(POLL_INTERVAL_MS);
  }
  return false;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePath(baseDir, value, fallback) {
  const selected = String(value || '').trim() || fallback;
  return path.isAbsolute(selected) ? selected : path.resolve(baseDir, selected);
}

function readPort(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 65_535 ? number : fallback;
}

function readPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : '';
}

function safeErrorMessage(value) {
  const message = String(value?.message || value || 'unknown error')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, '[redacted-key]')
    .replace(/[\r\n]+/g, ' ')
    .trim();
  return message.slice(0, 300);
}

function isDirectRun() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === MANAGER_SCRIPT;
}
