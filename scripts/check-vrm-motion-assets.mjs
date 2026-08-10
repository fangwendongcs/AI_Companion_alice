import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const MOTIONS_PATH = 'assets/avatars/test-vrm/motions.json';
const VRMA_DIR = 'assets/motions/vrm/test';
const FBX_DIR = 'assets/motions/fbx';
const LICENSE_REGISTER_PATH = 'docs/assets/licenses/MOTION_ASSET_LICENSES.md';
const LICENSE_EVIDENCE_FILES = [
  'docs/assets/licenses/evidence/mixamo/mixamo.png',
  'docs/assets/licenses/evidence/vroid-vrma/vrm动作.png',
  'docs/assets/licenses/evidence/vroid-vrma/vrm动作2.png'
];
const QA_RUNNER_FILES = [
  'scripts/qa/vrm-file-motion-product-runner.js',
  'scripts/qa/vrm-motion-lifecycle-runner.js',
  'scripts/qa/vrm-fbx-retarget-qa-runner.js'
];
const FBX_TICKS_PER_SECOND = 46186158000;
const VALID_STATUSES = new Set(['approved', 'qaApproved', 'qa', 'debugOnly', 'rejected']);
const VALID_TECHNICAL_STATUSES = new Set(['playable', 'playableWithRetargetIssues', 'blocked']);
const VALID_PRODUCT_STATUSES = new Set(['approved', 'candidate', 'debugOnly', 'rejected']);
const VALID_LICENSE_STATUSES = new Set(['verified', 'pending verification', 'restricted', 'unknown']);
const VALID_SECONDARY_MOTION = new Set(['keep', 'reset', 'suppress']);
const VALID_MODES = new Set(['vrma', 'retargeted', 'external', 'procedural']);
const VALID_FORMATS = new Set(['vrma', 'fbx']);
const CURRENT_DEBUG_ONLY_FBX_ASSETS = new Set([
  'fbxStandingIdle',
  'fbxTalking',
  'fbxTalking1',
  'fbxTalking2',
  'fbxThinking',
  'fbxWaving'
]);
const CALIBRATED_LOCAL_SLOTS = {
  intro: { assetId: 'fbxWaving', path: 'assets/motions/fbx/Waving.fbx', loop: 'once', layer: 'gesture' },
  idle: { assetId: 'fbxStandingIdle', path: 'assets/motions/fbx/Standing Idle.fbx', loop: 'repeat', layer: 'base' },
  speaking: { assetId: 'fbxTalking1', path: 'assets/motions/fbx/Talking (1).fbx', loop: 'repeat', layer: 'base' },
  listening: { assetId: 'fbxStandingIdle', path: 'assets/motions/fbx/Standing Idle.fbx', loop: 'repeat', layer: 'base' },
  thinking: { assetId: 'fbxThinking', path: 'assets/motions/fbx/Thinking.fbx', loop: 'repeat', layer: 'base' },
  chat: { assetId: 'fbxTalking', path: 'assets/motions/fbx/Talking.fbx', loop: 'once', layer: 'gesture' },
  wave: { assetId: 'fbxWaving', path: 'assets/motions/fbx/Waving.fbx', loop: 'once', layer: 'gesture' }
};
const VALID_BINDING_PROFILES = new Set([
  'raw-vrm-nodes-with-secondary-channels',
  'normalized-humanoid-nodes'
]);
const failures = [];

const motions = await readJson(MOTIONS_PATH);
const vrmaFiles = await listFiles(VRMA_DIR, '.vrma');
const fbxFiles = await listFiles(FBX_DIR, '.fbx');
const assets = motions.assets || {};
const slots = motions.slots || {};
const qaSlots = motions.qaSlots || {};
const interactionIntents = motions.interactionIntents || {};
const proceduralFallbacks = motions.proceduralFallbacks || {};

await checkAssetCatalog();
await checkFormalSlots();
await checkQaSlots();
checkInteractionIntents();
checkRejectedAssetBoundaries();
await checkLicenseRegister();
await checkQaRunnerFiles();

if (failures.length) {
  console.error('[check-vrm-motion-assets] VRM 动作资产配置失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-vrm-motion-assets] ok');

async function checkAssetCatalog() {
  assert(Object.keys(assets).length === 13, 'assets 必须登记当前 7 个 VRMA 与 6 个 FBX 测试动作。');

  const assetsByFormat = groupAssetsByFormat();
  checkCatalogPaths(assetsByFormat.vrma, vrmaFiles, VRMA_DIR, 'VRMA');
  checkCatalogPaths(assetsByFormat.fbx, fbxFiles, FBX_DIR, 'FBX');

  for (const [assetId, asset] of Object.entries(assets)) {
    assert(asset.id === assetId, `${assetId} 的 id 必须与 catalog key 一致。`);
    assert(VALID_STATUSES.has(asset.qualityStatus), `${assetId} qualityStatus 非法：${asset.qualityStatus}`);
    assert(VALID_TECHNICAL_STATUSES.has(asset.technicalStatus), `${assetId} technicalStatus 非法：${asset.technicalStatus}`);
    assert(VALID_PRODUCT_STATUSES.has(asset.productStatus), `${assetId} productStatus 非法：${asset.productStatus}`);
    assert(VALID_LICENSE_STATUSES.has(asset.licenseStatus), `${assetId} licenseStatus 非法：${asset.licenseStatus}`);
    assert(VALID_FORMATS.has(asset.format), `${assetId} format 非法：${asset.format}`);
    await assertLocalFile(asset.path, `${assetId}.path`);

    if (asset.format === 'vrma') await checkVrmaAsset(assetId, asset);
    if (asset.format === 'fbx') await checkFbxAsset(assetId, asset);
  }
}

function groupAssetsByFormat() {
  return Object.values(assets).reduce((result, asset) => {
    if (!result[asset.format]) result[asset.format] = [];
    result[asset.format].push(asset);
    return result;
  }, { vrma: [], fbx: [] });
}

function checkCatalogPaths(assetList, files, dir, label) {
  const catalogPaths = new Set(assetList.map((asset) => normalizePath(asset.path)));
  const actualPaths = new Set(files.map((file) => path.posix.join(dir, file)));
  actualPaths.forEach((filePath) => {
    assert(catalogPaths.has(filePath), `${label} 文件未登记到 assets：${filePath}`);
  });
  catalogPaths.forEach((filePath) => {
    assert(actualPaths.has(filePath), `assets 登记了不存在的 ${label} 文件：${filePath}`);
  });
}

async function checkVrmaAsset(assetId, asset) {
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
  assert(asset.technicalStatus === 'playable', `${assetId} VRMA 技术状态应为 playable。`);
  assert(asset.licenseStatus === 'pending verification', `${assetId} VRMA 授权状态必须保持 pending verification，不能编造授权结论。`);
}

async function checkFbxAsset(assetId, asset) {
  const audit = await auditFbx(asset.path);
  assert(audit.version === asset.fbxVersion, `${assetId} fbxVersion 应为 ${audit.version}。`);
  assert(audit.animatedModelCount === asset.staticAnimatedModelCount, `${assetId} staticAnimatedModelCount 应为 ${audit.animatedModelCount}。`);
  assert(audit.boneTrackCount === asset.staticBoneTrackCount, `${assetId} staticBoneTrackCount 应为 ${audit.boneTrackCount}。`);
  assert(Math.abs(audit.durationSec - Number(asset.durationSec)) < 0.02, `${assetId} durationSec 应接近 ${audit.durationSec}。`);
  assert(asset.provider === 'mixamo', `${assetId} provider 应标记为 mixamo。`);
  assert(asset.technicalStatus === 'playableWithRetargetIssues', `${assetId} 当前 FBX 技术状态应标记 playableWithRetargetIssues。`);
  assert(asset.productStatus === 'debugOnly', `${assetId} 当前 FBX 产品状态必须保持 debugOnly。`);
  assert(asset.licenseStatus === 'pending verification', `${assetId} licenseStatus 应保持 pending verification，不能编造授权结论。`);
  assert(
    !CURRENT_DEBUG_ONLY_FBX_ASSETS.has(assetId) || asset.qualityStatus === 'debugOnly',
    `${assetId} 当前浏览器 retarget QA 未通过，必须保持 debugOnly。`
  );
  assert(audit.rootMotion, `${assetId} 应包含 hips/root motion 审计信息。`);
}

async function checkFormalSlots() {
  for (const [slot, expected] of Object.entries(CALIBRATED_LOCAL_SLOTS)) {
    const entry = slots[slot] || {};
    assert(entry.id === slot, `slots.${slot} 必须保留稳定 id。`);
    assert(entry.assetId === expected.assetId, `slots.${slot} 必须指向 ${expected.assetId}。`);
    assert(entry.path === expected.path, `slots.${slot} 路径必须为 ${expected.path}。`);
    assert(entry.loop === expected.loop, `slots.${slot}.loop 必须为 ${expected.loop}。`);
    assert(entry.layer === expected.layer, `slots.${slot}.layer 必须为 ${expected.layer}。`);
    assert(isCalibratedLocalUse(entry), `slots.${slot} 必须声明本地上半身校准与 local-only 范围。`);
    assert(entry.trackFilter?.mode === 'include', `slots.${slot} 必须使用 include trackFilter。`);
    assert(entry.trackFilter?.groups?.includes('upperlimb'), `slots.${slot} 必须保留 upperlimb 轨道。`);
    assert(entry.trackFilter?.groups?.includes('torso'), `slots.${slot} 必须保留 torso 轨道。`);
    assert(!entry.trackFilter?.groups?.includes('hips'), `slots.${slot} 不得保留 hips 轨道。`);
    assert(!entry.trackFilter?.groups?.includes('legs'), `slots.${slot} 不得保留 legs 轨道。`);
    assert(entry.rootMotionPolicy === 'strip-by-track-filter', `slots.${slot} 必须显式剔除 root motion。`);
    assert(proceduralFallbacks[slot] === true, `slots.${slot} 必须保留 procedural fallback。`);
  }

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
    'qaSquat',
    'qaFbxStandingIdle',
    'qaFbxTalking',
    'qaFbxTalking1',
    'qaFbxTalking2',
    'qaFbxThinking',
    'qaFbxWaving'
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
    if (entry.format === 'fbx') {
      assert(entry.qualityStatus === 'debugOnly', `${slot} 当前 FBX retarget QA 未通过，必须保持 debugOnly。`);
    }
    checkMotionEntry(entry, `qaSlots.${slot}`);
  }
}

function checkRejectedAssetBoundaries() {
  const formalEntries = Object.values(slots);
  const formalAssetIds = new Set(formalEntries.map((entry) => entry.assetId).filter(Boolean));
  ['vrmaShoot', 'vrmaSpin', 'vrmaSquat'].forEach((assetId) => {
    assert(assets[assetId]?.qualityStatus === 'rejected', `${assetId} 必须标记为 rejected。`);
    assert(!formalAssetIds.has(assetId), `${assetId} 不得进入正式 slots。`);
  });
  Object.values(assets).forEach((asset) => {
    if (asset.qualityStatus !== 'approved') {
      const uses = formalEntries.filter((entry) => entry.assetId === asset.id);
      assert(
        !uses.length || uses.every((entry) => isCalibratedLocalUse(entry)),
        `${asset.id} 尚未全局 approved，只能通过校准后的 local-only slot 使用。`
      );
    }
  });
}

function checkInteractionIntents() {
  [
    'interaction.headTap',
    'interaction.legTap',
    'interaction.tap',
    'interaction.chat',
    'interaction.greeting'
  ].forEach((intentId) => {
    assert(Boolean(interactionIntents[intentId]), `interactionIntents 缺少 ${intentId}。`);
  });

  const greeting = interactionIntents['interaction.greeting'] || {};
  assert(greeting.motionId === 'wave', 'interaction.greeting 必须请求校准后的正式 wave slot。');
  assert(greeting.fallbackSlot === 'armTap', 'interaction.greeting 必须 fallback 到 armTap procedural。');
  assert(greeting.fallbackReason === 'file_motion_unavailable', 'interaction.greeting 必须记录文件动作不可用 fallback。');

  const chat = interactionIntents['interaction.chat'] || {};
  assert(chat.motionId === 'chat', 'interaction.chat 必须请求校准后的正式 chat slot。');
  assert(chat.fallbackReason === 'file_motion_unavailable', 'interaction.chat 必须记录文件动作不可用 fallback。');

  for (const [intentId, intent] of Object.entries(interactionIntents)) {
    assert(intent.id === intentId, `${intentId} 的 id 必须与 key 一致。`);
    assert(Boolean(intent.fallbackSlot), `${intentId} 缺少 fallbackSlot。`);
    assert(
      Boolean(slots[intent.fallbackSlot] || proceduralFallbacks[intent.fallbackSlot]),
      `${intentId}.fallbackSlot 必须指向正式 slot 或 procedural fallback：${intent.fallbackSlot}`
    );
    assert(!qaSlots[intent.fallbackSlot], `${intentId}.fallbackSlot 不得指向 QA slot：${intent.fallbackSlot}`);

    const candidateId = intent.candidateMotionId || intent.motionId;
    if (candidateId) {
      const candidateSlot = slots[candidateId] || qaSlots[candidateId];
      assert(Boolean(candidateSlot), `${intentId} candidateMotionId 未登记：${candidateId}`);
      if (qaSlots[candidateId]) {
        assert(candidateSlot.qaOnly === true, `${intentId} 的 QA candidate 必须 qaOnly=true。`);
        assert(candidateSlot.productMapping === false, `${intentId} 的 QA candidate 必须 productMapping=false。`);
        assert(Boolean(intent.fallbackReason), `${intentId} 使用 QA/debug candidate 时必须记录 fallbackReason。`);
      } else {
        const asset = candidateSlot.assetId ? assets[candidateSlot.assetId] : null;
        assert(
          isProductUsable(candidateSlot, asset),
          `${intentId} 的正式 candidate 必须同时满足 quality=approved、technical=playable、product=approved、license=verified。`
        );
      }
    }
  }
}

function isProductUsable(entry = {}, asset = null) {
  const entryStatus = entry.qualityStatus || asset?.qualityStatus || 'approved';
  const assetStatus = asset?.qualityStatus || 'approved';
  const technicalStatus = entry.technicalStatus || asset?.technicalStatus || 'playable';
  const productStatus = entry.productStatus || asset?.productStatus || 'approved';
  const licenseStatus = entry.licenseStatus || asset?.licenseStatus || 'verified';
  return entryStatus === 'approved'
    && (assetStatus === 'approved' || isCalibratedLocalUse(entry))
    && technicalStatus === 'playable'
    && productStatus === 'approved'
    && (licenseStatus === 'verified' || (isCalibratedLocalUse(entry) && licenseStatus === 'pending verification'));
}

function isCalibratedLocalUse(entry = {}) {
  return entry.localUseApproved === true
    && entry.releaseScope === 'local-only'
    && entry.calibrationProfile === 'mixamo-vrm-upper-body-v1'
    && Boolean(entry.trackFilter)
    && entry.trackFilter?.enabled !== false;
}

function checkMotionEntry(entry, label) {
  assert(entry.renderer === 'vrm', `${label}.renderer 必须为 vrm。`);
  assert(VALID_MODES.has(entry.mode), `${label}.mode 非法：${entry.mode}`);
  assert(VALID_FORMATS.has(entry.format), `${label}.format 非法：${entry.format}`);
  assert(entry.format !== 'fbx' || entry.mode === 'retargeted', `${label} FBX 必须声明 mode=retargeted。`);
  assert(entry.source === 'file', `${label}.source 必须为 file。`);
  assert(Boolean(entry.path || entry.file), `${label} 缺少 path/file。`);
  assert(VALID_SECONDARY_MOTION.has(entry.secondaryMotion), `${label}.secondaryMotion 非法：${entry.secondaryMotion}`);
  assert(
    entry.secondaryMotionRestoreDelayMs === undefined
      || (Number.isFinite(entry.secondaryMotionRestoreDelayMs) && entry.secondaryMotionRestoreDelayMs >= 0),
    `${label}.secondaryMotionRestoreDelayMs 必须为非负数。`
  );
  assert(['fullBody', 'gesture', 'base', 'upperBody', 'face'].includes(entry.layer), `${label}.layer 非法：${entry.layer}`);
  if (entry.localUseApproved === true) {
    assert(entry.releaseScope === 'local-only', `${label} 本地批准动作必须限制 releaseScope=local-only。`);
    assert(entry.licenseStatus === 'pending verification', `${label} 不得把未核实许可标成 verified。`);
    assert(Boolean(entry.calibrationProfile), `${label} 本地批准动作必须声明 calibrationProfile。`);
    assert(entry.trackFilter?.enabled !== false, `${label} 本地批准动作必须启用 trackFilter。`);
  }
}

async function checkLicenseRegister() {
  const licenseText = await readText(LICENSE_REGISTER_PATH);
  assert(Boolean(licenseText), '缺少动作资产许可登记文档。');
  for (const evidencePath of LICENSE_EVIDENCE_FILES) {
    await assertLocalFile(evidencePath, 'license evidence');
    assert(licenseText.includes(evidencePath), `许可登记文档缺少证据路径：${evidencePath}`);
  }
  Object.keys(assets).forEach((assetId) => {
    assert(licenseText.includes(`\`${assetId}\``), `许可登记文档缺少资产：${assetId}`);
  });
  assert(licenseText.includes('Pending verification'), '许可登记必须保留 Pending verification 状态，不得编造授权结论。');
  assert(!licenseText.includes('docs/architecture/MOTION_ASSET_LICENSES.md'), '许可登记不得引用迁移前路径。');
}

async function checkQaRunnerFiles() {
  for (const filePath of QA_RUNNER_FILES) {
    await assertLocalFile(filePath, 'QA runner');
  }
  const doc = await readText('docs/architecture/VRM_MOTION_QUALITY_V1.md');
  QA_RUNNER_FILES.forEach((filePath) => {
    assert(doc.includes(filePath), `VRM Motion 文档必须记录可复跑 QA runner：${filePath}`);
  });
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

async function auditFbx(filePath) {
  const buffer = await readFile(normalizePath(filePath));
  const version = buffer.readUInt32LE(23);
  const wideRecords = version >= 7500;
  const roots = readFbxNodes(buffer, wideRecords);
  const nodes = [];
  roots.forEach((root) => walk(root, (node) => nodes.push(node)));

  const models = new Map();
  const curveNodes = new Map();
  const curves = new Map();
  const connections = [];
  nodes.forEach((node) => {
    if (node.name === 'Model') models.set(node.props[0], { id: node.props[0], name: cleanFbxName(node.props[1]) });
    if (node.name === 'AnimationCurveNode') curveNodes.set(node.props[0], { id: node.props[0], name: cleanFbxName(node.props[1]) });
    if (node.name === 'AnimationCurve') curves.set(node.props[0], { id: node.props[0], times: [], values: [] });
    if (node.name === 'C') connections.push(node.props);
  });

  nodes.forEach((node) => {
    if (node.name !== 'AnimationCurve') return;
    const curve = curves.get(node.props[0]);
    node.children.forEach((child) => {
      if (child.name === 'KeyTime') curve.times = child.props[0]?.values || [];
      if (child.name === 'KeyValueFloat') curve.values = child.props[0]?.values || [];
    });
  });

  const curveNodeToModel = new Map();
  const curveToCurveNode = [];
  connections.forEach((connection) => {
    const from = connection[1];
    const to = connection[2];
    const prop = connection[3] || '';
    if (curveNodes.has(from) && models.has(to)) curveNodeToModel.set(from, { modelId: to, prop });
    if (curves.has(from) && curveNodes.has(to)) {
      curveToCurveNode.push({ curveId: from, curveNodeId: to, axis: String(prop).replace(/^d\|/, '') });
    }
  });

  const tracksByModel = new Map();
  let maxTick = 0;
  curveToCurveNode.forEach((link) => {
    const curveNode = curveNodes.get(link.curveNodeId);
    const curveModel = curveNodeToModel.get(link.curveNodeId);
    const curve = curves.get(link.curveId);
    if (!curveNode || !curveModel || !curve) return;

    const model = models.get(curveModel.modelId);
    const prop = String(curveModel.prop || curveNode.name || '').replace(/^d\|/, '');
    curve.times.forEach((time) => {
      if (time > maxTick) maxTick = time;
    });

    const modelName = model?.name || String(curveModel.modelId);
    if (!tracksByModel.has(modelName)) {
      tracksByModel.set(modelName, { model: modelName, props: new Set(), ranges: {} });
    }
    const track = tracksByModel.get(modelName);
    track.props.add(prop);
    if (curve.values.length) {
      const min = Math.min(...curve.values);
      const max = Math.max(...curve.values);
      track.ranges[`${prop}.${link.axis}`] = {
        min: Number(min.toFixed(4)),
        max: Number(max.toFixed(4)),
        delta: Number((max - min).toFixed(4))
      };
    }
  });

  const tracks = Array.from(tracksByModel.values());
  const boneTracks = tracks.filter((track) => /mixamorig|hips|spine|arm|leg|foot|hand|head|neck|shoulder/i.test(track.model));
  const hips = tracks.find((track) => /hips/i.test(track.model));

  return {
    version,
    durationSec: Number((maxTick / FBX_TICKS_PER_SECOND).toFixed(3)),
    animatedModelCount: tracks.length,
    boneTrackCount: boneTracks.length,
    rootMotion: hips?.ranges || null
  };
}

function readFbxNodes(buffer, wideRecords) {
  let offset = 27;
  const roots = [];

  const readUInt = () => {
    if (wideRecords) {
      const value = Number(buffer.readBigUInt64LE(offset));
      offset += 8;
      return value;
    }
    const value = buffer.readUInt32LE(offset);
    offset += 4;
    return value;
  };

  const readNode = () => {
    const endOffset = readUInt();
    const numProps = readUInt();
    readUInt();
    const nameLength = buffer[offset++];
    if (endOffset === 0 && numProps === 0 && nameLength === 0) return null;

    const name = buffer.subarray(offset, offset + nameLength).toString('utf8');
    offset += nameLength;
    const props = [];
    for (let index = 0; index < numProps; index++) props.push(readFbxProperty(buffer, () => offset, (next) => { offset = next; }));

    const children = [];
    const nullRecordSize = wideRecords ? 25 : 13;
    while (offset < endOffset - nullRecordSize) {
      const child = readNode();
      if (!child) break;
      children.push(child);
    }
    offset = endOffset;
    return { name, props, children };
  };

  while (offset < buffer.length) {
    const node = readNode();
    if (!node) break;
    roots.push(node);
  }
  return roots;
}

function readFbxProperty(buffer, getOffset, setOffset) {
  let offset = getOffset();
  const type = String.fromCharCode(buffer[offset++]);
  const readString = () => {
    const length = buffer.readUInt32LE(offset);
    offset += 4;
    const value = buffer.subarray(offset, offset + length).toString('utf8');
    offset += length;
    return value;
  };

  let value;
  if (type === 'Y') { value = buffer.readInt16LE(offset); offset += 2; }
  else if (type === 'C') { value = buffer[offset++] !== 0; }
  else if (type === 'I') { value = buffer.readInt32LE(offset); offset += 4; }
  else if (type === 'F') { value = buffer.readFloatLE(offset); offset += 4; }
  else if (type === 'D') { value = buffer.readDoubleLE(offset); offset += 8; }
  else if (type === 'L') { value = Number(buffer.readBigInt64LE(offset)); offset += 8; }
  else if (type === 'S') { value = readString(); }
  else if (type === 'R') {
    const length = buffer.readUInt32LE(offset);
    offset += 4 + length;
    value = { rawBytes: length };
  } else if ('fdilbc'.includes(type)) {
    const length = buffer.readUInt32LE(offset); offset += 4;
    const encoding = buffer.readUInt32LE(offset); offset += 4;
    const byteLength = buffer.readUInt32LE(offset); offset += 4;
    const raw = buffer.subarray(offset, offset + byteLength);
    offset += byteLength;
    value = { values: decodeFbxArray(type, length, encoding, raw) };
  } else {
    throw new Error(`Unsupported FBX property type ${type}`);
  }

  setOffset(offset);
  return value;
}

function decodeFbxArray(type, length, encoding, raw) {
  const data = encoding ? zlib.inflateSync(raw) : raw;
  const values = [];
  let offset = 0;
  for (let index = 0; index < length; index++) {
    if (type === 'f') { values.push(data.readFloatLE(offset)); offset += 4; }
    else if (type === 'd') { values.push(data.readDoubleLE(offset)); offset += 8; }
    else if (type === 'i') { values.push(data.readInt32LE(offset)); offset += 4; }
    else if (type === 'l') { values.push(Number(data.readBigInt64LE(offset))); offset += 8; }
    else { values.push(data[offset]); offset += 1; }
  }
  return values;
}

function walk(node, visit) {
  visit(node);
  node.children.forEach((child) => walk(child, visit));
}

function cleanFbxName(value) {
  return String(value || '')
    .split('\u0000')[0]
    .replace(/^Model::/, '')
    .replace(/^AnimStack::/, '')
    .replace(/^AnimLayer::/, '')
    .replace(/^AnimCurveNode::/, '')
    .replace(/^AnimCurve::/, '');
}

async function listFiles(dir, extension) {
  try {
    return (await readdir(dir))
      .filter((file) => file.toLowerCase().endsWith(extension))
      .sort();
  } catch {
    return [];
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    failures.push(`无法读取 JSON：${filePath} (${error.message})`);
    return {};
  }
}

async function readText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    failures.push(`无法读取文本：${filePath} (${error.message})`);
    return '';
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
