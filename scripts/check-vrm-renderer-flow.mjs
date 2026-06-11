import { readFile } from 'node:fs/promises';
import { VRMRenderer } from '../js/avatar/renderers/VRMRenderer.js';

const failures = [];
const requiredDirectiveFields = ['state', 'emotion', 'gesture', 'gaze', 'lip_sync', 'intensity'];
const localTestAvatars = [
  {
    id: 'local_alice_vrm_test',
    manifest: 'assets/avatars/test-vrm/manifest.json',
    model: 'assets/avatars/test-vrm/alice_test.vrm'
  },
  {
    id: 'local_boy_vrm_test',
    manifest: 'assets/avatars/test-vrm/manifest.boy.json',
    model: 'assets/avatars/test-vrm/boy.vrm'
  },
  {
    id: 'local_girl_vrm_test',
    manifest: 'assets/avatars/test-vrm/manifest.girl.json',
    model: 'assets/avatars/test-vrm/girl.vrm'
  }
];

const modelAudits = [];

await checkRendererModules();
await checkVrmManifestCapabilities();
await checkLocalTestManifests();
await checkLocalTestModelsIfPresent();
await checkDirectiveApplication();
await checkBusinessLayerIsolation();
await checkLocalModelIgnoreRules();

if (modelAudits.length) {
  console.log('[check-vrm-renderer-flow] local VRM model audit:');
  modelAudits.forEach((audit) => console.log(formatModelAudit(audit)));
}

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
  assert(characterManager.includes('manifest.boy.json'), 'CharacterManager 应支持 boy 本地 VRM 测试 manifest 注入。');
  assert(characterManager.includes('manifest.girl.json'), 'CharacterManager 应支持 girl 本地 VRM 测试 manifest 注入。');
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

async function checkLocalTestManifests() {
  const registry = await readJson('public/avatars/registry.json');
  const registryIds = new Set((registry.avatars || []).map((avatar) => avatar.id));

  for (const testAvatar of localTestAvatars) {
    assert(!registryIds.has(testAvatar.id), `${testAvatar.id} 不应进入 public avatar registry。`);

    const manifest = await readJson(testAvatar.manifest);
    assert(manifest.id === testAvatar.id, `${testAvatar.manifest} manifest id 应为 ${testAvatar.id}。`);
    assert(manifest.renderer?.type === 'vrm', `${testAvatar.id} manifest 应声明 renderer.type=vrm。`);
    assert(manifest.model?.url === testAvatar.model, `${testAvatar.id} manifest 应引用 ${testAvatar.model}。`);
    assert(manifest.localTest?.commitModelFile === false, `${testAvatar.id} manifest 应明确模型文件不提交。`);
    assert(manifest.localTest?.licenseStatus, `${testAvatar.id} manifest 应标记本地模型授权状态。`);
    assert(manifest.renderer?.expressionMap && Object.keys(manifest.renderer.expressionMap).length > 0, `${testAvatar.id} 应提供 expressionMap 以避免在 VRMRenderer 中写死单一模型字段。`);
    if (testAvatar.id === 'local_girl_vrm_test') {
      ['neutral', 'happy', 'sad', 'angry', 'surprised', 'blink', 'mouthA', 'mouthI', 'mouthU', 'mouthE', 'mouthO'].forEach((group) => {
        assert(Array.isArray(manifest.renderer.expressionMap[group]) && manifest.renderer.expressionMap[group].length > 0, `girl.vrm expressionMap 应包含 ${group}。`);
      });
    }
  }
}

async function checkLocalTestModelsIfPresent() {
  for (const testAvatar of localTestAvatars) {
    try {
      const buffer = await readFile(testAvatar.model);
      const audit = auditGlbContainer(buffer, testAvatar);
      modelAudits.push(audit);
      assert(audit.magic === 'glTF', `${testAvatar.id} 本地 VRM 测试模型应为 GLB/VRM 容器，当前 magic=${audit.magic || '(empty)'}`);
      assert(audit.meshCount > 0, `${testAvatar.id} 应包含至少一个 mesh。`);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        modelAudits.push({
          id: testAvatar.id,
          path: testAvatar.model,
          exists: false
        });
        continue;
      }
      failures.push(`本地 VRM 测试模型无法读取或解析：${testAvatar.model} (${error.message})`);
    }
  }
}

async function checkDirectiveApplication() {
  const fakeMesh = {
    isMesh: true,
    morphTargetDictionary: {
      Fcl_ALL_Joy: 0,
      Fcl_ALL_Sorrow: 1,
      Fcl_ALL_Angry: 2,
      Fcl_ALL_Surprised: 3,
      Fcl_MTH_A: 4,
      Fcl_MTH_I: 5,
      Fcl_MTH_U: 6,
      Fcl_MTH_E: 7,
      Fcl_MTH_O: 8,
      Fcl_EYE_Close: 9,
      Fcl_EYE_Close_R: 10,
      Fcl_EYE_Close_L: 11
    },
    morphTargetInfluences: new Array(12).fill(0)
  };
  const fakeAvatar = {
    traverse(callback) {
      callback(fakeMesh);
    }
  };

  const renderer = new VRMRenderer({
    avatar: fakeAvatar,
    manifest: {
      renderer: {
        type: 'vrm',
        expressionMap: {
          happy: ['fcl_all_joy'],
          sad: ['fcl_all_sorrow'],
          angry: ['fcl_all_angry'],
          surprised: ['fcl_all_surprised'],
          mouthA: ['fcl_mth_a'],
          mouthI: ['fcl_mth_i'],
          mouthU: ['fcl_mth_u'],
          mouthE: ['fcl_mth_e'],
          mouthO: ['fcl_mth_o'],
          blinkRight: ['fcl_eye_close_r'],
          blinkLeft: ['fcl_eye_close_l'],
          blink: ['fcl_eye_close']
        }
      },
      model: { format: 'vrm' },
      capabilities: { renderer: 'vrm' }
    }
  });
  const initResult = renderer.init();
  assert(initResult.capabilities.hasMorphTargets === true, 'VRMRenderer 应能发现 morph target。');
  assert(initResult.capabilities.mouthGroups.length === 5, 'VRMRenderer 应能发现五元音 mouth groups。');

  const result = renderer.applyDirective({
    state: 'speaking',
    emotion: 'happy',
    gesture: 'soft_nod',
    gaze: 'user',
    lip_sync: 'auto',
    intensity: 0.8,
    tone: 'playful'
  });

  assert(result.ok === true && result.applied === true, 'VRMRenderer 应能应用 AvatarDirective。');
  assert(fakeMesh.morphTargetInfluences[0] > 0, 'happy 表情应通过 expressionMap 产生 morph influence。');
  assert(fakeMesh.morphTargetInfluences[4] > 0, 'speaking + lip_sync=auto 应先驱动 mouthA。');
  renderer.update(0.1);
  renderer.update(0.03);
  assert(fakeMesh.morphTargetInfluences[5] > 0, 'speaking update 应能推进到 mouthI，形成轻量节奏口型。');

  renderer.applyDirective({
    state: 'idle',
    emotion: 'angry',
    gesture: 'none',
    gaze: 'user',
    lip_sync: 'none',
    intensity: 0.8
  });
  assert(fakeMesh.morphTargetInfluences[2] > 0, 'angry emotion 应映射到 angry morph group。');

  renderer.applyDirective({
    state: 'idle',
    emotion: 'surprised',
    gesture: 'none',
    gaze: 'user',
    lip_sync: 'none',
    intensity: 0.8
  });
  assert(fakeMesh.morphTargetInfluences[3] > 0, 'surprised emotion 应映射到 surprised morph group。');

  renderer.applyDirective({
    state: 'idle',
    emotion: 'concerned',
    gesture: 'none',
    gaze: 'user',
    lip_sync: 'none',
    intensity: 0.8
  });
  assert(fakeMesh.morphTargetInfluences[1] > 0, 'concerned emotion 应低强度 fallback 到 sad morph group。');

  renderer.blink.nextIn = 0;
  renderer.update(0.08);
  assert(fakeMesh.morphTargetInfluences[9] > 0, 'auto blink 应能驱动双眼 blink。');
  assert(fakeMesh.morphTargetInfluences[10] > 0, 'auto blink 应能驱动右眼 blink。');
  assert(fakeMesh.morphTargetInfluences[11] > 0, 'auto blink 应能驱动左眼 blink。');

  renderer.applyDirective({
    state: 'idle',
    emotion: 'neutral',
    gesture: 'none',
    gaze: 'user',
    lip_sync: 'none',
    intensity: 0
  });
  assert(fakeMesh.morphTargetInfluences[4] === 0, 'idle 指令应清理 mouth influence。');
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

function auditGlbContainer(buffer, testAvatar) {
  const magic = buffer.subarray(0, 4).toString('utf8');
  const version = buffer.length >= 8 ? buffer.readUInt32LE(4) : null;
  const declaredLength = buffer.length >= 12 ? buffer.readUInt32LE(8) : null;
  const jsonChunkLength = buffer.length >= 16 ? buffer.readUInt32LE(12) : 0;
  const jsonChunkType = buffer.length >= 20 ? buffer.subarray(16, 20).toString('utf8') : '';

  let gltf = {};
  if (jsonChunkType === 'JSON' && jsonChunkLength > 0) {
    const jsonText = buffer
      .subarray(20, 20 + jsonChunkLength)
      .toString('utf8')
      .replace(/\0+$/g, '')
      .trim();
    gltf = JSON.parse(jsonText);
  }

  const morphTargetNames = collectMorphTargetNames(gltf);
  const nodeNames = (gltf.nodes || []).map((node) => node.name).filter(Boolean);
  const humanoidClues = nodeNames
    .filter((name) => /(hips|spine|chest|neck|head|arm|hand|leg|foot|toe|j_bip|bip|humanoid|upper|lower)/i.test(name))
    .slice(0, 36);

  return {
    id: testAvatar.id,
    path: testAvatar.model,
    exists: true,
    sizeBytes: buffer.length,
    sizeMb: Number((buffer.length / 1024 / 1024).toFixed(2)),
    magic,
    version,
    declaredLength,
    jsonChunkType,
    meshCount: (gltf.meshes || []).length,
    primitiveCount: (gltf.meshes || [])
      .reduce((total, mesh) => total + (mesh.primitives || []).length, 0),
    skinnedMeshCount: (gltf.nodes || [])
      .filter((node) => Number.isInteger(node.mesh) && Number.isInteger(node.skin)).length,
    morphTargetNames,
    possibleMouthMorphs: filterMorphs(morphTargetNames, /(mouth|mth|viseme|aa|ah|oh|ou|^a$|^i$|^u$|^e$|^o$|あ|い|う|え|お)/i),
    possibleBlinkMorphs: filterMorphs(morphTargetNames, /(blink|eye.*close|eyeclose|まばたき)/i),
    possibleEmotionMorphs: filterMorphs(morphTargetNames, /(happy|joy|smile|fun|sad|sorrow|angry|relaxed|surprise|trouble|neutral)/i),
    humanoidClues,
    materialCount: (gltf.materials || []).length,
    textureCount: (gltf.textures || []).length,
    imageCount: (gltf.images || []).length,
    imageMimeTypes: unique((gltf.images || []).map((image) => image.mimeType).filter(Boolean))
  };
}

function collectMorphTargetNames(gltf) {
  const names = [];
  (gltf.meshes || []).forEach((mesh) => {
    if (Array.isArray(mesh.extras?.targetNames)) names.push(...mesh.extras.targetNames);
    (mesh.primitives || []).forEach((primitive) => {
      if (Array.isArray(primitive.extras?.targetNames)) names.push(...primitive.extras.targetNames);
      const targetCount = Array.isArray(primitive.targets) ? primitive.targets.length : 0;
      for (let index = 0; index < targetCount; index += 1) {
        names.push(`target_${index}`);
      }
    });
  });
  return unique(names.map((name) => String(name || '').trim()).filter(Boolean));
}

function filterMorphs(names, pattern) {
  return names.filter((name) => pattern.test(name)).slice(0, 24);
}

function formatModelAudit(audit) {
  if (!audit.exists) return `- ${audit.id}: missing local file (${audit.path}); skipped optional local-only model validation.`;
  const mouth = audit.possibleMouthMorphs.length ? audit.possibleMouthMorphs.join(', ') : '-';
  const blink = audit.possibleBlinkMorphs.length ? audit.possibleBlinkMorphs.join(', ') : '-';
  const emotion = audit.possibleEmotionMorphs.length ? audit.possibleEmotionMorphs.join(', ') : '-';
  const humanoid = audit.humanoidClues.length ? audit.humanoidClues.slice(0, 12).join(', ') : '-';
  const textures = audit.imageMimeTypes.length ? audit.imageMimeTypes.join(', ') : '-';
  return [
    `- ${audit.id}: ${audit.sizeMb} MB, magic=${audit.magic}, glbVersion=${audit.version}, meshes=${audit.meshCount}, skinnedMeshes=${audit.skinnedMeshCount}, primitives=${audit.primitiveCount}`,
    `  morphTargets=${audit.morphTargetNames.length}, mouth=[${mouth}], blink=[${blink}], emotion=[${emotion}]`,
    `  humanoidClues=[${humanoid}], materials=${audit.materialCount}, textures=${audit.textureCount}, images=${audit.imageCount}, imageMimeTypes=[${textures}]`
  ].join('\n');
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

function unique(values) {
  return Array.from(new Set(values));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
