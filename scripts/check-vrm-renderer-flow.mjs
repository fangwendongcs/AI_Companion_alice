import { readFile } from 'node:fs/promises';
import { VRMRenderer } from '../js/avatar/renderers/VRMRenderer.js';

const failures = [];
const requiredDirectiveFields = ['state', 'emotion', 'gesture', 'gaze', 'lip_sync', 'intensity'];

await checkRendererModules();
await checkVrmManifestCapabilities();
await checkLocalTestManifest();
await checkLocalTestModelIfPresent();
await checkDirectiveApplication();
await checkBusinessLayerIsolation();
await checkLocalModelIgnoreRules();

if (failures.length) {
  console.error('[check-vrm-renderer-flow] VRM renderer 验收失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-vrm-renderer-flow] ok');

async function checkRendererModules() {
  const characterManager = await readText('js/avatar/CharacterManager.js');
  const appController = await readText('js/app/AppController.js');

  assert(characterManager.includes('createAvatarRenderer'), 'CharacterManager 应通过 AvatarRendererFactory 创建 renderer。');
  assert(characterManager.includes('applyAvatarDirective'), 'CharacterManager 应暴露 applyAvatarDirective。');
  assert(appController.includes('applyAvatarDirective'), 'AppController 应把 AvatarDirective 交给 avatar renderer。');
}

async function checkVrmManifestCapabilities() {
  const registry = await readJson('public/avatars/registry.json');
  for (const avatar of registry.avatars || []) {
    const manifest = await readJson(avatar.manifest);
    const format = String(manifest.model?.format || '').toLowerCase();
    if (format !== 'vrm') continue;

    assert(manifest.renderer?.type === 'vrm', `${avatar.id} VRM manifest 应声明 renderer.type=vrm。`);
    ['states', 'emotions', 'gestures', 'gaze', 'lipSync', 'expressions'].forEach((key) => {
      assert(Array.isArray(manifest.capabilities?.[key]) && manifest.capabilities[key].length > 0, `${avatar.id} capabilities.${key} 缺失。`);
    });
    assert(manifest.capabilities?.renderer === 'vrm', `${avatar.id} capabilities.renderer 应为 vrm。`);
  }
}

async function checkLocalTestManifest() {
  const registry = await readJson('public/avatars/registry.json');
  const registryIds = new Set((registry.avatars || []).map((avatar) => avatar.id));
  assert(!registryIds.has('local_alice_vrm_test'), 'local_alice_vrm_test 不应进入 public avatar registry。');

  const manifest = await readJson('assets/avatars/test-vrm/manifest.json');
  assert(manifest.id === 'local_alice_vrm_test', '本地 VRM 测试 manifest id 应为 local_alice_vrm_test。');
  assert(manifest.renderer?.type === 'vrm', '本地 VRM 测试 manifest 应声明 renderer.type=vrm。');
  assert(manifest.model?.url === 'assets/avatars/test-vrm/alice_test.vrm', '本地 VRM 测试 manifest 应引用 alice_test.vrm。');
  assert(manifest.localTest?.commitModelFile === false, '本地 VRM 测试 manifest 应明确模型文件不提交。');
}

async function checkLocalTestModelIfPresent() {
  const modelPath = 'assets/avatars/test-vrm/alice_test.vrm';
  try {
    const buffer = await readFile(modelPath);
    const magic = buffer.subarray(0, 4).toString('utf8');
    assert(magic === 'glTF', `本地 VRM 测试模型应为 GLB/VRM 容器，当前 magic=${magic || '(empty)'}`);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    failures.push(`本地 VRM 测试模型无法读取：${modelPath} (${error.message})`);
  }
}

async function checkDirectiveApplication() {
  const fakeMesh = {
    isMesh: true,
    morphTargetDictionary: {
      happy: 0,
      sad: 1,
      aa: 2,
      blink: 3
    },
    morphTargetInfluences: [0, 0, 0, 0]
  };
  const fakeAvatar = {
    traverse(callback) {
      callback(fakeMesh);
    }
  };

  const renderer = new VRMRenderer({
    avatar: fakeAvatar,
    manifest: {
      renderer: { type: 'vrm' },
      model: { format: 'vrm' },
      capabilities: { renderer: 'vrm' }
    }
  });
  const initResult = renderer.init();
  assert(initResult.capabilities.hasMorphTargets === true, 'VRMRenderer 应能发现 morph target。');

  const result = renderer.applyDirective({
    state: 'speaking',
    emotion: 'happy',
    gesture: 'soft_nod',
    gaze: 'user',
    lip_sync: 'auto',
    intensity: 0.8
  });

  assert(result.ok === true && result.applied === true, 'VRMRenderer 应能应用 AvatarDirective。');
  assert(fakeMesh.morphTargetInfluences[0] > 0, 'happy 表情应产生 morph influence。');
  assert(fakeMesh.morphTargetInfluences[2] > 0, 'speaking + lip_sync=auto 应产生基础口型 influence。');

  renderer.applyDirective({
    state: 'idle',
    emotion: 'neutral',
    gesture: 'none',
    gaze: 'user',
    lip_sync: 'none',
    intensity: 0
  });
  assert(fakeMesh.morphTargetInfluences[2] === 0, 'idle 指令应清理 mouth influence。');
  renderer.destroy();
}

async function checkBusinessLayerIsolation() {
  const businessFiles = [
    'backend/services/DialogueOrchestrationService.js',
    'backend/services/MemoryService.js',
    'backend/services/PersonaService.js',
    'backend/services/CompanionAffectService.js',
    'backend/services/PromptBuilder.js',
    'backend/contracts/dialogueContract.js'
  ];
  const forbidden = [
    'VRMRenderer',
    'FBXRenderer',
    'vrmExpressionPreset',
    'fbxPath',
    'boneName',
    'animationFile'
  ];

  for (const file of businessFiles) {
    const text = await readText(file);
    forbidden.forEach((token) => {
      assert(!text.includes(token), `${file} 不应依赖 renderer 专属字段：${token}`);
    });
  }

  const contract = await readText('backend/contracts/dialogueContract.js');
  requiredDirectiveFields.forEach((field) => {
    assert(contract.includes(field), `dialogue contract 应包含 renderer-agnostic directive 字段：${field}`);
  });
}

async function checkLocalModelIgnoreRules() {
  const gitignore = await readText('.gitignore');
  assert(gitignore.includes('assets/avatars/test-vrm/*.vrm'), '.gitignore 应忽略本地测试 VRM 文件。');
  assert(gitignore.includes('assets/avatars/test-vrm/alice_test'), '.gitignore 应忽略当前无后缀本地测试模型。');
  assert(!gitignore.includes('public/avatars/*.vrm'), '.gitignore 不应整体忽略运行时 public/avatars VRM。');
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    failures.push(`无法读取 JSON：${path} (${error.message})`);
    return {};
  }
}

async function readText(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    failures.push(`无法读取文件：${path} (${error.message})`);
    return '';
  }
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
