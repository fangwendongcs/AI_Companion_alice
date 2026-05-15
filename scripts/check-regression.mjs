import { access, readFile } from 'node:fs/promises';
import { AnimationQueue } from '../js/animation/AnimationQueue.js';
import {
  AnimationStateMachine,
  isTransientAnimationState
} from '../js/animation/AnimationStateMachine.js';
import { AvatarState } from '../js/animation/states.js';
import { VALID_TTS_ENGINES } from '../js/config/configSchema.js';
import { DEFAULT_TTS_CONFIG } from '../js/config/providers.js';
import { TTSProviders, getTTSProvider } from '../js/voice/TTSProviderRegistry.js';

const expectedAvatarIds = ['alice', 'osa_shiro', 'osa_wambo'];
const requiredMotionSlots = ['intro', 'idle', 'headTap', 'armTap', 'legTap'];
const failures = [];

await checkAnimationRegression();
await checkAvatarRegression();
checkTTSRegression();

if (failures.length) {
  console.error('[check-regression] 阶段验收回归失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-regression] ok');

async function checkAnimationRegression() {
  const machine = new AnimationStateMachine();
  assert(machine.transition(AvatarState.BOOT).ok, '动画状态机必须支持 idle -> boot。');
  assert(isTransientAnimationState(AvatarState.BOOT), 'boot 必须是会自动收敛的 transient state。');
  assert(machine.transition(AvatarState.IDLE).ok, '动画状态机必须支持 boot -> idle。');

  const cooldownQueue = new AnimationQueue({ defaultCooldownMs: 240 });
  assert(cooldownQueue.enqueue({ name: 'headTap', layer: 'gesture' }).type === 'play', '第一次点击动作应立即播放。');
  const repeatedClick = cooldownQueue.enqueue({ name: 'headTap', layer: 'gesture' });
  assert(
    repeatedClick.type === 'ignored' && repeatedClick.reason === 'cooldown',
    '连续点击必须被 cooldown 抑制。'
  );

  const interruptQueue = new AnimationQueue({ defaultCooldownMs: 0 });
  interruptQueue.enqueue({ name: 'idleReaction', layer: 'gesture', priority: 1 });
  const interrupt = interruptQueue.enqueue({
    name: 'headTap',
    layer: 'gesture',
    priority: 10,
    interrupt: true
  });
  assert(interrupt.type === 'interrupt', '高优先级动作必须能打断低优先级动作。');

  const loopQueue = new AnimationQueue({ defaultCooldownMs: 0 });
  loopQueue.enqueue({ name: 'idle', layer: 'base', loop: 'repeat' });
  const duplicateLoop = loopQueue.enqueue({ name: 'idle', layer: 'base', loop: 'repeat' });
  assert(
    duplicateLoop.type === 'ignored' && duplicateLoop.reason === 'duplicate-loop',
    '循环动作不能重复堆叠。'
  );
}

async function checkAvatarRegression() {
  const registry = await readJson('public/avatars/registry.json');
  const avatars = registry.avatars || [];
  const ids = new Set(avatars.map((avatar) => avatar.id));

  expectedAvatarIds.forEach((id) => {
    assert(ids.has(id), `avatar registry 缺少 ${id}。`);
  });

  for (const avatar of avatars) {
    assert(Boolean(avatar.manifest), `${avatar.id} 必须使用 manifest.json 作为主入口。`);
    const manifest = await readJson(avatar.manifest);
    assert(manifest.id === avatar.id, `${avatar.id} manifest.id 与 registry 不一致。`);
    await assertLocalFile(manifest.model?.url, `${avatar.id}.model`);
    await assertLocalFile(
      manifest.motionManifest || manifest.animations?.manifest,
      `${avatar.id}.motionManifest`
    );

    const motionsPath = manifest.motionManifest || manifest.animations?.manifest;
    const motions = await readJson(motionsPath);
    requiredMotionSlots.forEach((slot) => {
      assert(hasMotionSupport(motions, slot), `${avatar.id} 缺少关键动作能力 ${slot}。`);
    });
  }
}

function checkTTSRegression() {
  assert(
    DEFAULT_TTS_CONFIG.engine === 'browser',
    '默认 TTS engine 必须保持为免费浏览器兜底。'
  );
  assert(
    VALID_TTS_ENGINES.includes(DEFAULT_TTS_CONFIG.engine),
    `默认 TTS engine 不在白名单中：${DEFAULT_TTS_CONFIG.engine}`
  );
  assert(TTSProviders.browser?.transport === 'browser', 'browser provider 必须可用。');
  assert(
    TTSProviders.openai?.transport === 'backend'
      && typeof TTSProviders.openai.createPayload === 'function',
    'OpenAI TTS provider 配置不完整。'
  );
  assert(
    TTSProviders.minimax?.transport === 'backend'
      && typeof TTSProviders.minimax.createPayload === 'function',
    'MiniMax TTS provider 配置不完整。'
  );
  assert(
    getTTSProvider('unsupported-provider') === TTSProviders.browser,
    '未知 TTS provider 必须回退到 browser。'
  );
  assert(
    !Object.keys(DEFAULT_TTS_CONFIG).some((key) => key.toLowerCase().includes('key')),
    '前端默认 TTS 配置中不应出现 API key 字段。'
  );
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    failures.push(`无法读取 JSON：${path} (${error.message})`);
    return {};
  }
}

async function assertLocalFile(path, label) {
  if (!path) {
    failures.push(`${label} 缺少路径。`);
    return;
  }

  try {
    await access(normalizePath(path));
  } catch {
    failures.push(`${label} 文件不存在：${path}`);
  }
}

function normalizePath(path) {
  return String(path || '').split('?')[0].replace(/^\.?\//, '');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function hasMotionSupport(motions, slot) {
  return Boolean(motions.slots?.[slot] || motions.proceduralFallbacks?.[slot]);
}
