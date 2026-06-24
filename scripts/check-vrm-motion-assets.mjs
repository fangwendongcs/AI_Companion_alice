import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const MOTIONS_PATH = 'assets/avatars/test-vrm/motions.json';
const VRMA_DIR = 'assets/motions/vrm/test';
const VALID_STATUSES = new Set(['approved', 'debugOnly', 'rejected']);
const VALID_SECONDARY_MOTION = new Set(['keep', 'reset', 'suppress']);
const VALID_MODES = new Set(['vrma', 'retargeted', 'external', 'procedural']);
const VALID_BINDING_PROFILES = new Set([
  'raw-vrm-nodes-with-secondary-channels',
  'normalized-humanoid-nodes'
]);
const failures = [];

const motions = await readJson(MOTIONS_PATH);
const vrmaFiles = (await readdir(VRMA_DIR))
  .filter((file) => file.toLowerCase().endsWith('.vrma'))
  .sort();
const assets = motions.assets || {};
const slots = motions.slots || {};
const qaSlots = motions.qaSlots || {};

await checkAssetCatalog();
await checkFormalSlots();
await checkQaSlots();
checkRejectedAssetBoundaries();

if (failures.length) {
  console.error('[check-vrm-motion-assets] VRM 动作资产配置失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-vrm-motion-assets] ok');

async function checkAssetCatalog() {
  assert(Object.keys(assets).length === 7, 'assets 必须登记当前 7 个 VRMA 测试动作。');

  const catalogPaths = new Set(Object.values(assets).map((asset) => normalizePath(asset.path)));
  const actualPaths = new Set(vrmaFiles.map((file) => path.posix.join(VRMA_DIR, file)));
  actualPaths.forEach((filePath) => {
    assert(catalogPaths.has(filePath), `VRMA 文件未登记到 assets：${filePath}`);
  });
  catalogPaths.forEach((filePath) => {
    assert(actualPaths.has(filePath), `assets 登记了不存在的 VRMA 文件：${filePath}`);
  });

  for (const [assetId, asset] of Object.entries(assets)) {
    assert(asset.id === assetId, `${assetId} 的 id 必须与 catalog key 一致。`);
    assert(VALID_STATUSES.has(asset.qualityStatus), `${assetId} qualityStatus 非法：${asset.qualityStatus}`);
    assert(asset.format === 'vrma', `${assetId} format 必须为 vrma。`);
    await assertLocalFile(asset.path, `${assetId}.path`);

    const audit = await auditVrma(asset.path);
    assert(audit.hasVrmAnimationExtension, `${assetId} 必须包含 VRMC_vrm_animation 扩展。`);
    assert(audit.animationCount > 0, `${assetId} 必须包含 animation。`);
    assert(audit.channelCount === asset.staticChannelCount, `${assetId} staticChannelCount 应为 ${audit.channelCount}。`);
    assert(audit.nodeCount === asset.staticNodeCount, `${assetId} staticNodeCount 应为 ${audit.nodeCount}。`);
    assert(Math.abs(audit.durationSec - Number(asset.durationSec)) < 0.02, `${assetId} durationSec 应接近 ${audit.durationSec}。`);
    assert(audit.specVersion === asset.vrmaSpecVersion, `${assetId} vrmaSpecVersion 应为 ${audit.specVersion}。`);
    assert(audit.humanoidBoneCount === asset.humanoidBoneCount, `${assetId} humanoidBoneCount 应为 ${audit.humanoidBoneCount}。`);
    assert(asset.runtimeTrackCount === 53, `${assetId} 浏览器 QA 已确认 runtimeTrackCount 应为 53。`);
    assert(VALID_BINDING_PROFILES.has(asset.sourceBindingProfile), `${assetId} sourceBindingProfile 非法。`);
  }
}

async function checkFormalSlots() {
  const wave = slots.wave || {};
  assert(wave.id === 'wave', 'slots.wave 必须保留 wave id。');
  assert(wave.assetId === 'vrmaGreeting', 'wave 必须指向 vrmaGreeting 资产。');
  assert(wave.path === 'assets/motions/vrm/test/VRMA_02Greeting.vrma', 'wave 必须继续指向 VRMA_02Greeting.vrma。');
  assert(wave.layer === 'fullBody', 'wave 必须保持 fullBody layer。');
  assert(wave.baseWeightWhileActive === 0, 'wave 播放时 base idle 权重必须让出。');
  assert(wave.secondaryMotion === 'suppress', 'wave 必须保持 secondaryMotion=suppress。');
  assert(wave.secondaryMotionRestoreDelayMs === 450, 'wave 必须在 idle 淡入后延迟 450ms 恢复 secondary motion。');
  assert(!wave.trackFilter, 'wave 不应使用 trackFilter 截断原始 fullBody VRMA。');

  for (const [slot, entry] of Object.entries(slots)) {
    assert(VALID_STATUSES.has(entry.qualityStatus), `${slot} qualityStatus 非法：${entry.qualityStatus}`);
    assert(entry.qualityStatus === 'approved', `${slot} 是正式 slot，不能使用 ${entry.qualityStatus} 资产。`);
    assert(entry.qaOnly !== true, `${slot} 是正式 slot，不能标记 qaOnly。`);
    assert(entry.productMapping !== false, `${slot} 是正式 slot，不能关闭 productMapping。`);
    checkMotionEntry(entry, `slots.${slot}`);
  }
}

async function checkQaSlots() {
  const requiredQaSlots = [
    'qaShowFullBody',
    'qaGreeting',
    'qaPeace',
    'qaShoot',
    'qaSpin',
    'qaModelPose',
    'qaSquat'
  ];
  requiredQaSlots.forEach((slot) => {
    assert(Boolean(qaSlots[slot]), `qaSlots 缺少 ${slot}。`);
  });

  for (const [slot, entry] of Object.entries(qaSlots)) {
    assert(entry.qaOnly === true, `${slot} 必须标记 qaOnly=true。`);
    assert(entry.productMapping === false, `${slot} 必须标记 productMapping=false。`);
    assert(VALID_STATUSES.has(entry.qualityStatus), `${slot} qualityStatus 非法：${entry.qualityStatus}`);
    if (entry.secondaryMotion === 'suppress') {
      assert(entry.secondaryMotionRestoreDelayMs === 450, `${slot} suppress 恢复延迟必须保持 450ms。`);
    }
    checkMotionEntry(entry, `qaSlots.${slot}`);
  }
}

function checkRejectedAssetBoundaries() {
  const formalAssetIds = new Set(Object.values(slots).map((entry) => entry.assetId).filter(Boolean));
  ['vrmaShoot', 'vrmaSpin', 'vrmaSquat'].forEach((assetId) => {
    assert(assets[assetId]?.qualityStatus === 'rejected', `${assetId} 必须标记为 rejected。`);
    assert(!formalAssetIds.has(assetId), `${assetId} 不得进入正式 slots。`);
  });
}

function checkMotionEntry(entry, label) {
  assert(entry.renderer === 'vrm', `${label}.renderer 必须为 vrm。`);
  assert(VALID_MODES.has(entry.mode), `${label}.mode 非法：${entry.mode}`);
  assert(entry.format === 'vrma', `${label}.format 必须为 vrma。`);
  assert(entry.source === 'file', `${label}.source 必须为 file。`);
  assert(Boolean(entry.path || entry.file), `${label} 缺少 path/file。`);
  assert(VALID_SECONDARY_MOTION.has(entry.secondaryMotion), `${label}.secondaryMotion 非法：${entry.secondaryMotion}`);
  assert(
    entry.secondaryMotionRestoreDelayMs === undefined
      || (Number.isFinite(entry.secondaryMotionRestoreDelayMs) && entry.secondaryMotionRestoreDelayMs >= 0),
    `${label}.secondaryMotionRestoreDelayMs 必须为非负数。`
  );
  assert(['fullBody', 'gesture', 'base', 'upperBody', 'face'].includes(entry.layer), `${label}.layer 非法：${entry.layer}`);
}

async function auditVrma(filePath) {
  const buffer = await readFile(normalizePath(filePath));
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = buffer.subarray(0, 4).toString('utf8');
  assert(magic === 'glTF', `${filePath} 不是 GLB/VRMA 容器。`);

  let offset = 12;
  let json = null;
  while (offset < buffer.length) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(buffer.subarray(offset, offset + chunkLength).toString('utf8'));
      break;
    }
    offset += chunkLength;
  }
  assert(Boolean(json), `${filePath} 缺少 GLB JSON chunk。`);

  const animations = json?.animations || [];
  const accessors = json?.accessors || [];
  const channels = animations.flatMap((animation) => animation.channels || []);
  const samplers = animations.flatMap((animation) => animation.samplers || []);
  const nodeNames = (json?.nodes || []).map((node) => node.name || '');
  const targetedNodes = new Set(
    channels
      .map((channel) => nodeNames[channel.target?.node] || '')
      .filter(Boolean)
  );
  const durationSec = Math.max(0, ...samplers.map((sampler) => {
    const accessor = accessors[sampler.input] || {};
    return Array.isArray(accessor.max) ? Number(accessor.max[0] || 0) : 0;
  }));

  return {
    animationCount: animations.length,
    channelCount: channels.length,
    nodeCount: targetedNodes.size,
    durationSec: Number(durationSec.toFixed(3)),
    hasVrmAnimationExtension: (json?.extensionsUsed || []).includes('VRMC_vrm_animation'),
    specVersion: json?.extensions?.VRMC_vrm_animation?.specVersion || '',
    humanoidBoneCount: Object.keys(
      json?.extensions?.VRMC_vrm_animation?.humanoid?.humanBones || {}
    ).length
  };
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    failures.push(`无法读取 JSON：${filePath} (${error.message})`);
    return {};
  }
}

async function assertLocalFile(filePath, label) {
  try {
    await access(normalizePath(filePath));
  } catch {
    failures.push(`${label} 文件不存在：${filePath}`);
  }
}

function normalizePath(filePath) {
  return String(filePath || '').split('?')[0].replace(/^\.?\//, '');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
