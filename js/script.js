// 增加全局错误捕获
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error || e.message);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});

// 检查是否通过 file:// 协议运行
if (location.protocol === 'file:') {
  alert('❌ 警告：检测到您直接双击打开了 HTML (file:// 协议)。\nThree.js 出于安全限制无法通过 file:// 加载外部模型和纹理。\n请使用本地服务器运行本项目（例如：npx serve . 或 python -m http.server）。');
}

// ============================================================
// NOTE: LLM 配置 - 从 localStorage 恢复，敏感信息不离开本地
// ============================================================
const llmConfig = {
  provider: localStorage.getItem('llm_provider') || 'openai',
  apiKey: localStorage.getItem('llm_api_key') || '',
  baseUrl: localStorage.getItem('llm_base_url') || '',
  model: localStorage.getItem('llm_model') || 'gpt-4o-mini',
  systemPrompt: localStorage.getItem('llm_system_prompt') || '你是 Alice，一个元气满满的青少年 AI 伙伴。请用简短活泼的语气回复，每次回复控制在 60 字以内。'
};

// NOTE: 语音合成配置
const ttsConfig = {
  engine: localStorage.getItem('tts_engine') || 'browser',
  browserVoice: localStorage.getItem('tts_browser_voice') || 'auto',
  rate: parseFloat(localStorage.getItem('tts_rate') || '1.05'),
  pitch: parseFloat(localStorage.getItem('tts_pitch') || '1.2'),
  openaiVoice: localStorage.getItem('tts_openai_voice') || 'nova'
};

// NOTE: 预设各提供商的 base URL，方便切换
const PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com/v1',
  custom: ''
};

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// 【新增】FBXLoader（Mixamo Without Skin 动画）
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 核心状态
const AvatarState = {
  BOOT: 'boot',
  IDLE: 'idle',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  INTERACTING: 'interacting',
  ARM_ACTION: 'arm_action',
  HEAD_ACTION: 'head_action',
  LEG_ACTION: 'leg_action'
};

const state = {
  currentState: AvatarState.IDLE,
  animStartTime: 0,
  isMuted: false,
  speechTimer: null,
  modelLoaded: false,
  baseScale: 1,
  dialogues: {
    head: ["别摸头啦，发型要乱了！", "指挥官，今天有什么新任务吗？", "嗯？怎么突然摸我头？"],
    body: ["哇！别突然戳我！", "我在待命状态，系统运转正常。", "机体反馈良好，随时可以出击。"],
    arm: ["手臂活动一下～感觉关节润滑得不错！", "嘿！别拉我的手！", "装甲臂伸展完毕，战斗准备就绪。"],
    leg: ["腿部驱动器运转正常！", "别碰我的腿啦，好痒！", "跑步测试？随时可以开始！"],
    chat: ["收到指令。系统全功率运转中。", "这个赛博空间的感觉不错吧？", "我随时准备执行你的计划。"],
    idle: ["如果没事的话，我就先挂机休息了哦。", "镜头可以随便转，细节都经得起看。"],
    record: ["录制功能暂未完全接入流媒体，当前仅作UI演示。"]
  }
};

// UI 引用
const refs = {
  promptInput: document.getElementById('promptInput'),
  sendBtn: document.getElementById('sendBtn'),
  statusText: document.getElementById('statusText'),
  statusBadge: document.getElementById('statusBadge'),
  loading: document.getElementById('loading'),
  loaderProgress: document.getElementById('loaderProgress'),
  sidePanel: document.getElementById('sidePanel'),
  settingsBtn: document.getElementById('settingsBtn'),
  closePanelBtn: document.getElementById('closePanelBtn'),
  muteBtn: document.getElementById('muteBtn'),
  voiceBtn: document.getElementById('voiceBtn'),
  recordingPulse: document.getElementById('recordingPulse'),
  scaleSlider: document.getElementById('scaleSlider'),
  lightSlider: document.getElementById('lightSlider'),
  autoRotateToggle: document.getElementById('autoRotateToggle'),
  gridToggle: document.getElementById('gridToggle'),
  gridBg: document.getElementById('gridBg'),
  saveMemoryBtn: document.getElementById('saveMemoryBtn'),
  debugToggle: document.getElementById('debugToggle'),
  freezeAnimToggle: document.getElementById('freezeAnimToggle'),
  // LLM 配置面板
  llmProvider: document.getElementById('llmProvider'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  apiKeyToggle: document.getElementById('apiKeyToggle'),
  baseUrlInput: document.getElementById('baseUrlInput'),
  llmModel: document.getElementById('llmModel'),
  systemPromptInput: document.getElementById('systemPromptInput'),
  saveLLMConfigBtn: document.getElementById('saveLLMConfigBtn'),
  testLLMBtn: document.getElementById('testLLMBtn'),
  llmStatus: document.getElementById('llmStatus'),
  // TTS 配置面板
  ttsEngine: document.getElementById('ttsEngine'),
  voiceSelect: document.getElementById('voiceSelect'),
  openaiVoiceSelect: document.getElementById('openaiVoiceSelect'),
  browserVoiceGroup: document.getElementById('browserVoiceGroup'),
  openaiVoiceGroup: document.getElementById('openaiVoiceGroup'),
  speechRate: document.getElementById('speechRate'),
  speechPitch: document.getElementById('speechPitch'),
  rateVal: document.getElementById('rateVal'),
  pitchVal: document.getElementById('pitchVal'),
  testVoiceBtn: document.getElementById('testVoiceBtn'),
  // 场景配置
  ambientSlider: document.getElementById('ambientSlider'),
  fovSlider: document.getElementById('fovSlider')
};

// Three.js 运行环境
const runtime = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  dirLight: null,
  clock: new THREE.Clock(),
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),

  // 诊断工具
  debug: {
    enabled: true,
    freezeAnim: false,
    boxes: []
  },

  // 重建模型层级
  avatarRoot: new THREE.Group(),
  avatarAnim: new THREE.Group(),

  avatarObject: null,
  speechAnchor: null,
  mixers: [],
  interactableMeshes: []
};

// 【新增】Mixamo 动画绑定系统（只作用在原始 GLB 上）
let avatar;
let skinnedMesh;
let mixer;
const actions = Object.create(null);
let currentAction = null;
const fbxLoader = new FBXLoader();

let pendingActionsToRegister = [];
let loadedAnimCount = 0;
const TOTAL_ANIMS = 5;

init();

function init() {
  initScene();
  loadModels();
  loadFBX('boot', 'models/animations/boot.fbx');
  loadFBX('idle', 'models/animations/idle.fbx');
  loadFBX('arm', 'models/animations/arm_stretch.fbx');
  loadFBX('head', 'models/animations/head.fbx');
  loadFBX('leg', 'models/animations/leg.fbx');

  bindEvents();
  animate();
}

// 【新增】统一加载 FBX 动画
function loadFBX(name, path) {
  fbxLoader.load(path, (fbx) => {
    if (!fbx.animations || fbx.animations.length === 0) {
      console.error(`❌ 动画为空: ${name}`);
      loadedAnimCount++;
      checkAllAnimsLoaded();
      return;
    }

    const clip = fbx.animations[0];
    pendingActionsToRegister.push({ name, clip });

    console.log(`✅ 动画加载完成: ${name}`);
    loadedAnimCount++;
    checkAllAnimsLoaded();
  }, undefined, (err) => {
    console.error(`❌ 动画加载失败: ${name}`, err);
    loadedAnimCount++;
    checkAllAnimsLoaded();
  });
}

function checkAllAnimsLoaded() {
  if (loadedAnimCount >= TOTAL_ANIMS && state.modelLoaded) {
    tryInitAllClipsAndMixer();
  }
}

function registerAction(name, clip) {
  if (!mixer || !clip) return;
  const action = mixer.clipAction(clip, avatar);
  actions[name] = action;
}

function playAction(name, loop = THREE.LoopRepeat) {
  const next = actions[name];
  if (!next) return;

  const isSame = currentAction === next;
  if (currentAction && !isSame) {
    currentAction.fadeOut(0.2);
  }

  if (isSame) {
    next.stop();
  }

  next.reset();
  next.setLoop(loop);
  next.clampWhenFinished = loop === THREE.LoopOnce;
  next.fadeIn(0.2);
  next.play();

  currentAction = next;
  console.log('🎬 切换动作:', name);
}

function stopAllActions() {
  for (const action of Object.values(actions)) {
    action.stop();
  }
  currentAction = null;
}

function createIdleClip() {
  if (!avatar) return null;

  const duration = 4.0;
  const times = [0, 1, 2, 3, 4];
  const tracks = [];

  const defs = [
    { boneName: 'Spine_55', axis: 'x', amp: 0.06 },
    { boneName: 'Spine1_54', axis: 'x', amp: 0.05 },
    { boneName: 'Spine2_53', axis: 'x', amp: 0.04 },
    { boneName: 'LeftShoulder_28', axis: 'z', amp: 0.04 },
    { boneName: 'RightShoulder_52', axis: 'z', amp: -0.04 },
    { boneName: 'Neck_4', axis: 'x', amp: 0.03 },
    { boneName: 'Head_3', axis: 'x', amp: 0.02 }
  ];

  for (const def of defs) {
    const bone = avatar.getObjectByName(def.boneName);
    if (!bone) continue;

    const base = bone.quaternion.clone();
    const values = [];

    for (const t of times) {
      const phase = (t / duration) * Math.PI * 2;
      const a = Math.sin(phase) * def.amp;

      const e = new THREE.Euler(
        def.axis === 'x' ? a : 0,
        def.axis === 'y' ? a : 0,
        def.axis === 'z' ? a : 0
      );
      const dq = new THREE.Quaternion().setFromEuler(e);
      const q = new THREE.Quaternion().copy(base).multiply(dq);
      values.push(q.x, q.y, q.z, q.w);
    }

    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values));
  }

  if (tracks.length === 0) return null;
  return new THREE.AnimationClip('idle', duration, tracks);
}

function createInteractClip() {
  if (!avatar) return null;

  const duration = 0.5;
  const times = [0, 0.12, 0.25, 0.38, 0.5];
  const tracks = [];

  const defs = [
    { boneName: 'Spine2_53', axis: 'x', amp: 0.14 },
    { boneName: 'Neck_4', axis: 'x', amp: 0.12 },
    { boneName: 'Head_3', axis: 'x', amp: 0.10 }
  ];

  for (const def of defs) {
    const bone = avatar.getObjectByName(def.boneName);
    if (!bone) continue;

    const base = bone.quaternion.clone();
    const values = [];

    for (const t of times) {
      const phase = (t / duration) * Math.PI * 2;
      const a = Math.sin(phase) * def.amp;

      const e = new THREE.Euler(
        def.axis === 'x' ? a : 0,
        def.axis === 'y' ? a : 0,
        def.axis === 'z' ? a : 0
      );
      const dq = new THREE.Quaternion().setFromEuler(e);
      const q = new THREE.Quaternion().copy(base).multiply(dq);
      values.push(q.x, q.y, q.z, q.w);
    }

    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values));
  }

  if (tracks.length === 0) return null;
  return new THREE.AnimationClip('interact', duration, tracks);
}

// 【修改】创建统一 AnimationMixer（绑定 SkinnedMesh）
function initMixer() {
  if (!avatar || mixer) return;

  skinnedMesh = null;
  avatar.traverse((obj) => {
    if (obj.isSkinnedMesh && !skinnedMesh) skinnedMesh = obj;
  });
  if (!skinnedMesh) return;

  mixer = new THREE.AnimationMixer(skinnedMesh);
  console.log('✅ Mixer 已创建');
  console.log('🎯 mixer root:', mixer.getRoot());

  mixer.addEventListener('finished', (e) => {
    const finished = e.action;
    if (finished === actions['boot']) {
      setAvatarState(AvatarState.IDLE);
    } else {
      setAvatarState(AvatarState.IDLE);
    }
  });
}

// 【第五步】改进 retarget 逻辑：严格使用 boneMap（Mixamo 骨骼名 → 模型骨骼名）
function retargetClipToAvatar(sourceClip, targetRoot) {
  if (!sourceClip || !targetRoot) return null;

  const keywordsSkip = ['.scale'];
  const tracks = [];
  let matchedCount = 0;

  const boneMap = {
    mixamorigHips: 'Hips_66',
    mixamorigSpine: 'Spine_55',
    mixamorigSpine1: 'Spine1_54',
    mixamorigSpine2: 'Spine2_53',
    mixamorigNeck: 'Neck_4',
    mixamorigHead: 'Head_3',

    mixamorigLeftShoulder: 'LeftShoulder_28',
    mixamorigLeftArm: 'LeftArm_27',
    mixamorigLeftForeArm: 'LeftForeArm_26',
    mixamorigLeftHand: 'LeftHand_25',

    mixamorigRightShoulder: 'RightShoulder_52',
    mixamorigRightArm: 'RightArm_51',
    mixamorigRightForeArm: 'RightForeArm_50',
    mixamorigRightHand: 'RightHand_49',

    mixamorigLeftUpLeg: 'LeftUpLeg_60',
    mixamorigLeftLeg: 'LeftLeg_59',
    mixamorigLeftFoot: 'LeftFoot_58',

    mixamorigRightUpLeg: 'RightUpLeg_65',
    mixamorigRightLeg: 'RightLeg_64',
    mixamorigRightFoot: 'RightFoot_63'
  };

  for (const track of sourceClip.tracks) {
    const trackName = track.name || '';
    if (keywordsSkip.some((k) => trackName.toLowerCase().includes(k))) continue;

    const dot = trackName.indexOf('.');
    if (dot <= 0) continue;

    const rawNodeName = trackName.slice(0, dot);
    const prop = trackName.slice(dot + 1);

    let trackBoneName = rawNodeName;
    if (trackBoneName.startsWith('mixamorig:')) {
      trackBoneName = `mixamorig${trackBoneName.slice('mixamorig:'.length)}`;
    }

    const targetBoneName = boneMap[trackBoneName];
    if (!targetBoneName) continue;

    const targetBone = targetRoot.getObjectByName(targetBoneName);
    if (!targetBone) continue;

    console.log('🎯 映射:', trackBoneName, '→', targetBoneName);

    const cloned = track.clone();
    cloned.name = `${targetBoneName}.${prop}`;
    tracks.push(cloned);
    matchedCount++;
  }

  if (matchedCount < 10) {
    console.log('[AvatarDebug] NEED_BONEMAP: 匹配到的 track 太少，matchedCount =', matchedCount);
    return null;
  }
  return new THREE.AnimationClip(sourceClip.name || 'arm', sourceClip.duration, tracks);
}

// 【新增】在模型加载完成后统一注册所有 clip
function tryInitAllClipsAndMixer() {
  if (!avatar || pendingActionsToRegister.length === 0) return;

  initMixer();

  pendingActionsToRegister.forEach((item) => {
    const retargeted = retargetClipToAvatar(item.clip, avatar);
    if (retargeted) {
      registerAction(item.name, retargeted);
    } else {
      console.warn(`❌ retarget 失败: ${item.name}，降级直接使用原始 clip`);
    }
  });

  pendingActionsToRegister = [];

  if (!actions.idle) {
    const idleClip = createIdleClip();
    if (idleClip) registerAction('idle', idleClip);
  }
  if (!actions.interact) {
    const interactClip = createInteractClip();
    if (interactClip) registerAction('interact', interactClip);
  }

  setAvatarState(AvatarState.BOOT);
}

function getHitPart(intersection) {
  const mesh = intersection && intersection.object ? intersection.object : null;
  if (!mesh) return 'body';

  let skinned = mesh;
  while (skinned && !skinned.isSkinnedMesh) skinned = skinned.parent;
  if (!skinned || !skinned.isSkinnedMesh) return 'body';

  const geo = skinned.geometry;
  if (!geo || !geo.attributes) return 'body';

  const skinIndexAttr = geo.attributes.skinIndex;
  const skinWeightAttr = geo.attributes.skinWeight;
  if (!skinIndexAttr || !skinWeightAttr) return 'body';

  const face = intersection.face;
  if (!face) return 'body';

  const vIndices = [face.a, face.b, face.c];
  const skeleton = skinned.skeleton;
  if (!skeleton || !skeleton.bones) return 'body';

  let best = { weight: 0, boneName: '' };

  for (const vi of vIndices) {
    const si = new THREE.Vector4().fromBufferAttribute(skinIndexAttr, vi);
    const sw = new THREE.Vector4().fromBufferAttribute(skinWeightAttr, vi);

    const pairs = [
      { idx: si.x, w: sw.x },
      { idx: si.y, w: sw.y },
      { idx: si.z, w: sw.z },
      { idx: si.w, w: sw.w }
    ];

    for (const p of pairs) {
      if (p.w <= 0) continue;
      const bone = skeleton.bones[p.idx];
      const boneName = bone && bone.name ? bone.name.toLowerCase() : '';
      if (p.w > best.weight) best = { weight: p.w, boneName };
    }
  }

  if (!best.boneName || best.weight < 0.15) return 'body';

  const boneName = best.boneName;
  if (boneName.includes('head') || boneName.includes('neck')) return 'head';
  if (boneName.includes('leg') || boneName.includes('foot') || boneName.includes('toe')) return 'leg';
  if (boneName.includes('arm') || boneName.includes('hand') || boneName.includes('shoulder')) return 'arm';

  return 'body';
}

function initScene() {
  const canvas = document.getElementById('scene');
  runtime.renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    logarithmicDepthBuffer: true
  });
  runtime.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  runtime.renderer.setSize(window.innerWidth, window.innerHeight);
  runtime.renderer.outputColorSpace = THREE.SRGBColorSpace;

  runtime.scene = new THREE.Scene();

  runtime.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 5000);

  runtime.controls = new OrbitControls(runtime.camera, runtime.renderer.domElement);
  runtime.controls.enableDamping = true;
  runtime.controls.dampingFactor = 0.05;

  runtime.controls.target.set(0, 90, 0);
  runtime.controls.minDistance = 100;
  runtime.controls.maxDistance = 600;
  runtime.controls.enablePan = false;
  runtime.controls.maxPolarAngle = Math.PI / 2 + 0.1;

  runtime.camera.position.set(0, 100, 250);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  runtime.scene.add(ambientLight);

  runtime.dirLight = new THREE.DirectionalLight(0xe0f7fa, 1.5);
  runtime.dirLight.position.set(100, 200, 100);
  runtime.scene.add(runtime.dirLight);

  const rimLight = new THREE.DirectionalLight(0x00e5ff, 2.0);
  rimLight.position.set(-100, 50, -100);
  runtime.scene.add(rimLight);

  runtime.scene.add(new THREE.AxesHelper(100));

  runtime.avatarRoot.add(runtime.avatarAnim);
  runtime.scene.add(runtime.avatarRoot);
}

async function loadModels() {
  const gltfLoader = new GLTFLoader();

  const modelPath = "models/characters/avatar_v2.glb";
  console.log(`[ResourceLoader] 准备加载模型，路径: ${modelPath}`);

  function normalizeModel(group) {
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    console.log(`[AvatarDebug] Merged model bounds before normalize:`, { size, center });

    const targetHeight = 120;
    const scale = targetHeight / size.y;

    group.scale.setScalar(scale);
    state.baseScale = scale;

    group.updateMatrixWorld(true);
    const newBox = new THREE.Box3().setFromObject(group);
    const newCenter = newBox.getCenter(new THREE.Vector3());

    group.position.set(
      -newCenter.x,
      -newBox.min.y,
      -newCenter.z
    );

    console.log(`[AvatarDebug] normalizeModel complete. scale: ${scale}`);
  }

  function fitCameraToObject(targetGroup) {
    targetGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(targetGroup);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    console.log(`[AvatarDebug] camera fit target bounds:`, { size, center });

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = runtime.camera.fov * (Math.PI / 180);
    let distance = maxDim / (2 * Math.tan(fov / 2));
    distance *= 1.5;

    runtime.camera.position.set(center.x, center.y + size.y * 0.2, distance);
    const lookAtBiasY = size.y * 0.18;
    runtime.controls.target.set(center.x, center.y + size.y * 0.2 - lookAtBiasY, center.z);
    runtime.controls.update();

    console.log(`[AvatarDebug] camera fit result: pos(${runtime.camera.position.toArray()}), target(${runtime.controls.target.toArray()})`);
  }

  function setupDebugHelpers() {
    if (!runtime.debug.enabled) return;

    const rootBox = new THREE.BoxHelper(runtime.avatarObject, 0x0000ff);

    runtime.scene.add(rootBox);

    runtime.debug.boxes = [rootBox];
  }

  try {
    const gltf = await new Promise((resolve, reject) => {
      gltfLoader.load(
        modelPath,
        (result) => {
          console.log(`[ResourceLoader] ✅ 模型加载成功: ${modelPath}`);
          resolve(result);
        },
        (xhr) => {
          if (xhr.lengthComputable && xhr.total > 0) {
            const percent = (xhr.loaded / xhr.total) * 100;
            refs.loaderProgress.style.width = `${percent}%`;
            console.log(`[ResourceLoader] 模型加载进度: ${percent.toFixed(2)}%`);
          }
        },
        (error) => {
          console.error(`[ResourceLoader] ❌ 模型加载失败: ${modelPath}`, error);
          reject(error);
        }
      );
    });

    refs.loaderProgress.style.width = '100%';

    avatar = gltf.scene;
    runtime.avatarObject = avatar;

    console.log(`\n========= 🤖 [Model Capability Check] =========`);

    let hasSkinnedMesh = false;
    let boneNames = [];
    let hasAnimations = gltf.animations && gltf.animations.length > 0;

    console.log(`[1] 正在检测 SkinnedMesh...`);
    avatar.traverse((obj) => {
      if (obj.isSkinnedMesh) {
        hasSkinnedMesh = true;
        console.log('✅ 发现 SkinnedMesh:', obj.name);
      }
      if (obj.isBone) {
        boneNames.push(obj.name.toLowerCase());
      }
    });
    if (!hasSkinnedMesh) console.log('❌ 未发现 SkinnedMesh (无蒙皮网格)');

    console.log(`\n[2] 正在检测内置动画 (Animations)...`);
    if (hasAnimations) {
      console.log(`✅ 发现 ${gltf.animations.length} 个内置动画:`);
      gltf.animations.forEach((anim) => console.log(`   - ${anim.name} (时长: ${anim.duration.toFixed(2)}s)`));
    } else {
      console.log('❌ 未发现内置动画数据 (Animations 为空)');
    }

    console.log(`\n[3] 正在检测骨骼层级 (Bones)...`);
    if (boneNames.length > 0) {
      console.log(`✅ 发现 ${boneNames.length} 根骨骼。分析关键节点：`);
      const hasHead = boneNames.some((n) => n.includes('head'));
      const hasNeck = boneNames.some((n) => n.includes('neck'));
      const hasSpine = boneNames.some((n) => n.includes('spine'));
      const hasArm = boneNames.some((n) => n.includes('arm') || n.includes('hand'));

      console.log(`   - Head:  ${hasHead ? '✅' : '❌'}`);
      console.log(`   - Neck:  ${hasNeck ? '✅' : '❌'}`);
      console.log(`   - Spine: ${hasSpine ? '✅' : '❌'}`);
      console.log(`   - Arm:   ${hasArm ? '✅' : '❌'}`);
    } else {
      console.log('❌ 未发现任何骨骼 (Bones 为空)');
    }

    console.log(`\n[4] 评估结果 (Assessment)`);
    let level = 1;
    if (hasSkinnedMesh && boneNames.length > 0) level = 2;
    if (level === 2 && hasAnimations) level = 3;

    console.log(`🏆 当前模型等级: Level ${level}`);

    if (level === 1) {
      console.log(`⚠️  Level 1 (无骨骼静态模型)`);
      console.log(`👉  只能做基于 Transform 的程序化动画 (位置跳动、整体旋转)`);
      console.log(`❌  不支持：挥手、眨眼、口型同步、基于骨骼的点击反馈`);
      console.log(`💡  [建议] 如果目标是开发数字人，强烈建议更换带有骨骼绑定 (Rigged) 的模型。`);
    } else if (level === 2) {
      console.log(`⚠️  Level 2 (基础骨骼模型)`);
      console.log(`👉  可以做点击交互 + 简单动作 (IK 演算，如转头看鼠标)`);
      console.log(`❌  不支持：直接播放现成的复杂预制动画`);
      console.log(`💡  [建议] 适合作为进阶数字人，但需要编写大量程序化动画代码。建议通过 Mixamo 等工具补充动画片段。`);
    } else if (level === 3) {
      console.log(`✨  Level 3 (完整骨骼 + 动画)`);
      console.log(`👉  可以做完整数字人系统 (AnimationMixer, 状态机无缝切换动作)`);
      console.log(`💡  [建议] 模型非常标准，可以直接接入基于 StateMachine 的高级动画控制器。`);
    }
    console.log(`=================================================\n`);

    console.log(`\n========= 🧩 [Mesh Names] =========`);
    avatar.traverse((obj) => {
      if (obj.isMesh) console.log(obj.name);
    });
    console.log(`==================================\n`);

    const MODEL_FORWARD_Y = 0;
    function autoOrientAvatar(model) {
      model.rotation.y = MODEL_FORWARD_Y;
      console.log(`[AvatarDebug] autoOrientAvatar: need orientation confirmation. current Y: ${MODEL_FORWARD_Y}`);
    }
    autoOrientAvatar(avatar);

    avatar.traverse((child) => {
      if (child.isMesh) {
        runtime.interactableMeshes.push(child);
        child.userData.partType = 'body';

        if (child.material) {
          child.material.alphaTest = 0.5;
        }
      }
    });

    runtime.avatarAnim.add(avatar);

    checkAllAnimsLoaded();

    normalizeModel(runtime.avatarObject);

    runtime.speechAnchor = new THREE.Object3D();
    const box = new THREE.Box3().setFromObject(runtime.avatarObject);
    runtime.speechAnchor.position.set(0, box.max.y + 10, 0);
    runtime.avatarRoot.add(runtime.speechAnchor);

    fitCameraToObject(runtime.avatarRoot);
    setupDebugHelpers();

    setTimeout(() => {
      refs.loading.style.opacity = '0';
      setTimeout(() => refs.loading.style.display = 'none', 500);
      state.modelLoaded = true;
      checkAllAnimsLoaded();
      showDialogue("[SYSTEM] 模型装载完毕，交互系统已激活。");
    }, 500);

  } catch (error) {
    console.error("[ResourceLoader] ❌ 系统资源加载中断:", error);
    refs.loaderProgress.style.backgroundColor = 'red';
    refs.loading.innerHTML = `
      <div style="color: red; margin-bottom: 12px;">SYSTEM ERROR: FAILED TO LOAD ASSETS</div>
      <div style="font-size: 12px; color: #888; max-width: 80%; text-align: center;">
        检测到资源加载失败，请按 F12 (Console/Network) 检查错误信息。<br><br>
        常见原因：<br>
        1. 未使用本地服务器启动 (如 npx serve .)<br>
        2. 文件路径不匹配 (${modelPath})<br>
        3. 模型文件损坏
      </div>
    `;

    const fallbackGeo = new THREE.BoxGeometry(100, 100, 100);
    const fallbackMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
    const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
    runtime.avatarAnim.add(fallbackMesh);
    runtime.avatarObject = fallbackMesh;
    normalizeModel(runtime.avatarObject);
    fitCameraToObject(runtime.avatarRoot);
  }
}

function setAvatarState(newState) {
  state.currentState = newState;

  refs.statusText.textContent = `ONLINE / ${newState.toUpperCase()}`;

  // NOTE: 更新顶部状态徽章样式以反映当前状态
  if (refs.statusBadge) {
    refs.statusBadge.className = 'status-badge';
    if (newState === AvatarState.THINKING) {
      refs.statusBadge.textContent = 'THINKING';
      refs.statusBadge.classList.add('thinking');
    } else if (newState === AvatarState.SPEAKING) {
      refs.statusBadge.textContent = 'SPEAKING';
      refs.statusBadge.classList.add('speaking');
    } else {
      refs.statusBadge.textContent = 'ONLINE';
    }
  }

  if (runtime.debug.freezeAnim) return;
  if (!mixer) return;

  if (newState === AvatarState.BOOT) {
    playAction('boot', THREE.LoopOnce);
  }

  if (newState === AvatarState.IDLE || newState === AvatarState.THINKING || newState === AvatarState.SPEAKING) {
    playAction('idle', THREE.LoopRepeat);
  }

  if (newState === AvatarState.INTERACTING) {
    playAction('interact', THREE.LoopOnce);
  }

  if (newState === AvatarState.ARM_ACTION) {
    playAction('arm', THREE.LoopOnce);
  }

  if (newState === AvatarState.HEAD_ACTION) {
    playAction('head', THREE.LoopOnce);
  }

  if (newState === AvatarState.LEG_ACTION) {
    playAction('leg', THREE.LoopOnce);
  }
}

function bindEvents() {
  window.addEventListener('resize', onResize);

  refs.settingsBtn.addEventListener('click', () => refs.sidePanel.classList.add('show'));
  refs.closePanelBtn.addEventListener('click', () => refs.sidePanel.classList.remove('show'));

  refs.sendBtn.addEventListener('click', handleChat);
  refs.promptInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleChat();
  });

  refs.muteBtn.addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    refs.muteBtn.style.color = state.isMuted ? 'var(--muted)' : 'var(--text)';
    showDialogue(state.isMuted ? "语音播报已静音。" : "语音播报已开启。");
  });

  refs.scaleSlider.addEventListener('input', (e) => {
    if (!state.modelLoaded) return;
    const multiplier = parseFloat(e.target.value);
    runtime.avatarRoot.scale.setScalar(multiplier);
    fitCameraToObject(runtime.avatarRoot);
  });

  refs.lightSlider.addEventListener('input', (e) => {
    if (runtime.dirLight) {
      runtime.dirLight.intensity = parseFloat(e.target.value);
    }
  });

  refs.autoRotateToggle.addEventListener('change', (e) => {
    runtime.controls.autoRotate = e.target.checked;
    runtime.controls.autoRotateSpeed = 2.0;
  });

  refs.gridToggle.addEventListener('change', (e) => {
    refs.gridBg.style.opacity = e.target.checked ? '1' : '0';
  });

  refs.debugToggle.addEventListener('change', (e) => {
    runtime.debug.enabled = e.target.checked;
    runtime.debug.boxes.forEach((box) => box.visible = runtime.debug.enabled);
  });

  refs.freezeAnimToggle.addEventListener('change', (e) => {
    runtime.debug.freezeAnim = e.target.checked;
    if (runtime.debug.freezeAnim) {
      stopAllActions();
    } else {
      setAvatarState(state.currentState);
    }
  });

  refs.saveMemoryBtn.addEventListener('click', () => {
    const name = document.getElementById('nameInput').value;
    const birthday = document.getElementById('birthdayInput').value;
    const likes = document.getElementById('likesInput').value;
    if (name) localStorage.setItem('user_name', name);
    if (birthday) localStorage.setItem('user_birthday', birthday);
    if (likes) localStorage.setItem('user_likes', likes);
    showDialogue(`好的${name ? '，' + name : ''}！我已经记住啦～`);
  });

  // ===== LLM 配置面板事件 =====
  // 恢复已保存的配置到表单
  if (refs.apiKeyInput) refs.apiKeyInput.value = llmConfig.apiKey;
  if (refs.baseUrlInput) refs.baseUrlInput.value = llmConfig.baseUrl;
  if (refs.systemPromptInput) refs.systemPromptInput.value = llmConfig.systemPrompt;
  if (refs.llmProvider) refs.llmProvider.value = llmConfig.provider;
  if (refs.llmModel) refs.llmModel.value = llmConfig.model;

  // API Key 显示/隐藏切换
  refs.apiKeyToggle?.addEventListener('click', () => {
    const input = refs.apiKeyInput;
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // 提供商切换时自动填充 base URL
  refs.llmProvider?.addEventListener('change', (e) => {
    const url = PROVIDER_BASE_URLS[e.target.value] || '';
    if (refs.baseUrlInput && !refs.baseUrlInput.value) {
      refs.baseUrlInput.value = url;
    }
  });

  // 保存 LLM 配置到 localStorage
  refs.saveLLMConfigBtn?.addEventListener('click', () => {
    llmConfig.provider = refs.llmProvider.value;
    llmConfig.apiKey = refs.apiKeyInput.value.trim();
    llmConfig.baseUrl = refs.baseUrlInput.value.trim();
    llmConfig.model = refs.llmModel.value;
    llmConfig.systemPrompt = refs.systemPromptInput.value.trim();

    localStorage.setItem('llm_provider', llmConfig.provider);
    localStorage.setItem('llm_api_key', llmConfig.apiKey);
    localStorage.setItem('llm_base_url', llmConfig.baseUrl);
    localStorage.setItem('llm_model', llmConfig.model);
    localStorage.setItem('llm_system_prompt', llmConfig.systemPrompt);

    showLLMStatus('success', '✅ 配置已保存到本地，下次打开自动加载。');
  });

  // 测试 LLM 连接
  refs.testLLMBtn?.addEventListener('click', async () => {
    if (!refs.apiKeyInput.value.trim()) {
      showLLMStatus('error', '❌ 请先填写 API Key。');
      return;
    }
    showLLMStatus('loading', '⏳ 正在测试连接...');
    // 临时用当前表单值测试
    const tempConfig = { ...llmConfig,
      apiKey: refs.apiKeyInput.value.trim(),
      baseUrl: refs.baseUrlInput.value.trim(),
      model: refs.llmModel.value,
      provider: refs.llmProvider.value
    };
    try {
      const baseUrl = tempConfig.baseUrl || PROVIDER_BASE_URLS[tempConfig.provider] || PROVIDER_BASE_URLS.openai;
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tempConfig.apiKey}` },
        body: JSON.stringify({ model: tempConfig.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 })
      });
      if (res.ok) {
        showLLMStatus('success', `✅ 连接成功！模型 ${tempConfig.model} 响应正常。`);
      } else {
        const err = await res.text();
        showLLMStatus('error', `❌ 请求失败 (${res.status})：${err.slice(0, 100)}`);
      }
    } catch (e) {
      showLLMStatus('error', `❌ 网络错误：${e.message}`);
    }
  });

  // ===== TTS 配置面板事件 =====
  if (refs.ttsEngine) refs.ttsEngine.value = ttsConfig.engine;
  if (refs.speechRate) refs.speechRate.value = ttsConfig.rate;
  if (refs.speechPitch) refs.speechPitch.value = ttsConfig.pitch;
  if (refs.openaiVoiceSelect) refs.openaiVoiceSelect.value = ttsConfig.openaiVoice;

  const syncTTSEngineUI = () => {
    if (refs.browserVoiceGroup) refs.browserVoiceGroup.style.display = ttsConfig.engine === 'browser' ? '' : 'none';
    if (refs.openaiVoiceGroup) refs.openaiVoiceGroup.style.display = ttsConfig.engine === 'openai' ? '' : 'none';
  };
  syncTTSEngineUI();

  // 填充浏览器声音列表
  const populateVoices = () => {
    if (!refs.voiceSelect) return;
    const voices = window.speechSynthesis?.getVoices() || [];
    const sorted = [...voices].sort((a, b) => {
      const azh = a.lang && a.lang.startsWith('zh') ? 1 : 0;
      const bzh = b.lang && b.lang.startsWith('zh') ? 1 : 0;
      if (azh !== bzh) return bzh - azh;
      return (a.name || '').localeCompare(b.name || '');
    });
    refs.voiceSelect.innerHTML = '<option value="auto">自动（优先晓晓 Neural）</option>';
    sorted.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang || 'unknown'})`;
      refs.voiceSelect.appendChild(opt);
    });

    const saved = ttsConfig.browserVoice || 'auto';
    const has = [...refs.voiceSelect.options].some((o) => o.value === saved);
    refs.voiceSelect.value = has ? saved : 'auto';
  };
  populateVoices();
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = populateVoices;

  refs.ttsEngine?.addEventListener('change', (e) => {
    ttsConfig.engine = e.target.value;
    localStorage.setItem('tts_engine', ttsConfig.engine);
    syncTTSEngineUI();
  });

  refs.voiceSelect?.addEventListener('change', (e) => {
    ttsConfig.browserVoice = e.target.value;
    localStorage.setItem('tts_browser_voice', ttsConfig.browserVoice);
  });

  refs.speechRate?.addEventListener('input', (e) => {
    ttsConfig.rate = parseFloat(e.target.value);
    if (refs.rateVal) refs.rateVal.textContent = ttsConfig.rate.toFixed(2);
    localStorage.setItem('tts_rate', ttsConfig.rate);
  });

  refs.speechPitch?.addEventListener('input', (e) => {
    ttsConfig.pitch = parseFloat(e.target.value);
    if (refs.pitchVal) refs.pitchVal.textContent = ttsConfig.pitch.toFixed(2);
    localStorage.setItem('tts_pitch', ttsConfig.pitch);
  });

  refs.openaiVoiceSelect?.addEventListener('change', (e) => {
    ttsConfig.openaiVoice = e.target.value;
    localStorage.setItem('tts_openai_voice', ttsConfig.openaiVoice);
  });

  refs.testVoiceBtn?.addEventListener('click', () => {
    speakText('你好！我是 Alice，很高兴认识你！');
  });

  // ===== 扩充场景配置事件 =====
  refs.ambientSlider?.addEventListener('input', (e) => {
    const light = runtime.scene?.getObjectByProperty('isAmbientLight', true);
    if (light) light.intensity = parseFloat(e.target.value);
  });

  refs.fovSlider?.addEventListener('input', (e) => {
    runtime.camera.fov = parseFloat(e.target.value);
    runtime.camera.updateProjectionMatrix();
  });

  // ===== 语音识别输入 =====
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition && refs.voiceBtn) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    let isRecording = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      refs.promptInput.value = transcript;
      handleChat();
    };

    recognition.onend = () => {
      isRecording = false;
      refs.voiceBtn.classList.remove('recording');
    };

    recognition.onerror = (e) => {
      console.warn('[Speech] 识别错误:', e.error);
      isRecording = false;
      refs.voiceBtn.classList.remove('recording');
    };

    refs.voiceBtn.addEventListener('click', () => {
      if (isRecording) {
        recognition.stop();
      } else {
        recognition.start();
        isRecording = true;
        refs.voiceBtn.classList.add('recording');
      }
    });
  } else if (refs.voiceBtn) {
    // 不支持语音识别时隐藏按钮
    refs.voiceBtn.title = '当前浏览器不支持语音识别';
    refs.voiceBtn.style.opacity = '0.3';
  }

  // ===== 情绪设置 =====
  window.setMood = (mood) => {
    document.querySelectorAll('[id^="mood"]').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(`mood${mood.charAt(0).toUpperCase() + mood.slice(1)}`);
    if (el) el.classList.add('active');
    const moodDialogues = {
      energe: '元气回路全开！今天有什么想做的吗～',
      think: '...嗯，让我想想。',
      angry: '哼！你刚才那个操作让我有点不高兴！',
      shy: '...才、才没有什么嘛。'
    };
    showDialogue(moodDialogues[mood] || '嗯...');
  };

  const canvas = runtime.renderer.domElement;

  let isDragging = false;
  canvas.addEventListener('pointerdown', () => isDragging = false);
  canvas.addEventListener('pointermove', () => isDragging = true);

  canvas.addEventListener('pointerup', (e) => {
    if (!isDragging) {
      onPointerClick(e);
    }
  });

  // NOTE: triggerReaction 根据部位类型自动匹配动画状态和对话池
  window.triggerReaction = (type) => {
    const pool = state.dialogues[type] || state.dialogues.idle;
    const text = pool[Math.floor(Math.random() * pool.length)];

    // 根据部位类型设置对应的动画状态
    const stateMap = {
      head: AvatarState.HEAD_ACTION,
      arm: AvatarState.ARM_ACTION,
      leg: AvatarState.LEG_ACTION,
      body: AvatarState.INTERACTING,
      chat: AvatarState.INTERACTING
    };
    setAvatarState(stateMap[type] || AvatarState.INTERACTING);
    showDialogue(text);
  };

  // ===== 下拉栏平滑展开/收起动画 =====
  initSmoothDetails();

  // ===== 按钮涟漪效果 =====
  initButtonRipple();
}

/**
 * NOTE: 显示 LLM 状态提示，3秒后自动消失
 * @param {'success'|'error'|'loading'} type 状态类型
 * @param {string} msg 提示文本
 */
function showLLMStatus(type, msg) {
  if (!refs.llmStatus) return;
  refs.llmStatus.className = `llm-status ${type}`;
  refs.llmStatus.textContent = msg;
  if (type !== 'loading') {
    setTimeout(() => { refs.llmStatus.className = 'llm-status'; }, 4000);
  }
}

function onPointerClick(event) {
  if (!state.modelLoaded) return;

  runtime.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  runtime.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  runtime.raycaster.setFromCamera(runtime.pointer, runtime.camera);
  const intersects = runtime.raycaster.intersectObjects(runtime.avatarAnim.children, true);

  if (intersects.length > 0) {
    const hitPart = getHitPart(intersects[0]);
    console.log('👉 点击命中部位:', hitPart);

    // NOTE: 统一通过 triggerReaction 触发动画 + 对话反馈
    // triggerReaction 内部会根据部位类型自动匹配动画状态
    window.triggerReaction(hitPart);
  }
}

/**
 * NOTE: handleChat 支持大模型 API 调用。
 * 若未配置 API Key 则降级为本地固定回复。
 */
async function handleChat() {
  const text = refs.promptInput.value.trim();
  if (!text) return;

  refs.promptInput.value = '';
  refs.sendBtn.disabled = true;

  setAvatarState(AvatarState.THINKING);

  try {
    let reply;
    if (llmConfig.apiKey) {
      reply = await callLLM(text);
    } else {
      // 未配置 API Key 时的降级回复
      await new Promise(r => setTimeout(r, 600));
      reply = '请先在控制终端的「AI 大模型配置」中填写 API Key，我才能真正和你聊天哦！';
    }
    setAvatarState(AvatarState.SPEAKING);
    speakText(reply);
  } catch (err) {
    console.error('[LLM] 调用失败:', err);
    setAvatarState(AvatarState.SPEAKING);
    speakText('抱歉，连接出现问题，请检查 API Key 和网络设置。');
  } finally {
    refs.sendBtn.disabled = false;
  }
}

/**
 * NOTE: 调用 OpenAI 兼容接口，支持多家提供商。
 * @param {string} userMessage 用户输入文本
 * @returns {Promise<string>} 大模型回复文本
 */
async function callLLM(userMessage) {
  const baseUrl = llmConfig.baseUrl || PROVIDER_BASE_URLS[llmConfig.provider] || PROVIDER_BASE_URLS.openai;
  const endpoint = `${baseUrl}/chat/completions`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${llmConfig.apiKey}`
    },
    body: JSON.stringify({
      model: llmConfig.model,
      messages: [
        { role: 'system', content: llmConfig.systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 200,
      temperature: 0.8
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`HTTP ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '（Alice 陷入了沉默...）';
}

/**
 * NOTE: 隐藏文字气泡，只通过语音播报。
 * 优先使用微软晓晓 Neural 声音（Edge/Chrome 支持），音质更自然。
 * @param {string} text 要朗读的文本
 */
function speakText(text) {
  // NOTE: 状态管理 - 语音播报结束后自动切回 IDLE
  if (state.speechTimer) clearTimeout(state.speechTimer);
  const estimatedDuration = Math.max(3000, text.length * 150);
  state.speechTimer = setTimeout(() => {
    if (state.currentState === AvatarState.SPEAKING || state.currentState === AvatarState.INTERACTING) {
      setAvatarState(AvatarState.IDLE);
    }
  }, estimatedDuration);

  if (state.isMuted) return;

  // 优先尝试 OpenAI TTS
  if (ttsConfig.engine === 'openai' && llmConfig.apiKey) {
    callOpenAITTS(text);
    return;
  }

  // 浏览器原生 TTS，优先选晓晓 Neural
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = ttsConfig.rate;
  utterance.pitch = ttsConfig.pitch;

  // NOTE: 等声音列表加载后再选音色，避免空列表问题
  const selectVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    const preferred = [
      'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',
      'Microsoft XiaoXiao',
      'Xiaoxiao',
      'Google 普通话（中国大陆）',
      'zh-CN'
    ];
    // 用选择器值覆盖
    const savedVoiceName = ttsConfig.browserVoice || refs.voiceSelect?.value;
    if (savedVoiceName && savedVoiceName !== 'auto') {
      const found = voices.find(v => v.name === savedVoiceName);
      if (found) utterance.voice = found;
    } else {
      for (const name of preferred) {
        const found = voices.find(v => v.name.includes(name) || v.lang === name);
        if (found) { utterance.voice = found; break; }
      }
    }
    window.speechSynthesis.speak(utterance);
  };

  if (window.speechSynthesis.getVoices().length > 0) {
    selectVoice();
  } else {
    window.speechSynthesis.onvoiceschanged = () => { selectVoice(); };
  }
}

/**
 * NOTE: 调用 OpenAI TTS API 并通过 Audio 播放。
 * @param {string} text 文本
 */
async function callOpenAITTS(text) {
  try {
    const baseUrl = llmConfig.baseUrl || PROVIDER_BASE_URLS.openai;
    const response = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.apiKey}`
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: ttsConfig.openaiVoice,
        speed: ttsConfig.rate
      })
    });
    if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[TTS] OpenAI TTS 失败，降级到浏览器TTS:', err);
    ttsConfig.engine = 'browser';
    speakText(text);
  }
}

// NOTE: showDialogue 保留供内部状态回调使用，不再显示气泡，只调语音
function showDialogue(text) {
  speakText(text);
}

function onResize() {
  runtime.camera.aspect = window.innerWidth / window.innerHeight;
  runtime.camera.updateProjectionMatrix();
  runtime.renderer.setSize(window.innerWidth, window.innerHeight);
}

// NOTE: 文字气泡已移除，此函数保留为空以兼容 animate loop 调用
function updateSpeechBubblePosition() {
  // 文字气泡已禁用，只使用语音播报
}

function animate() {
  requestAnimationFrame(animate);

  const delta = runtime.clock.getDelta();
  if (!runtime.debug.freezeAnim && mixer) {
    mixer.update(delta);
  }
  runtime.controls.update();

  updateSpeechBubblePosition();

  if (runtime.debug.enabled && runtime.debug.boxes) {
    runtime.debug.boxes.forEach((box) => box.update());
  }

  runtime.renderer.render(runtime.scene, runtime.camera);
}

function updateAnimation(elapsed) {
  return;
}

// ===== 下拉栏平滑展开/收起 =====
function initSmoothDetails() {
  const allDetails = document.querySelectorAll('details.section');

  allDetails.forEach((detail) => {
    const content = detail.querySelector('.details-content');
    const summary = detail.querySelector('summary');
    if (!content || !summary) return;

    // 初始化：如果已经 open，设置实际高度
    if (detail.open) {
      content.style.opacity = '1';
      content.style.maxHeight = 'none';
      content.style.overflow = 'visible';
    } else {
      content.style.maxHeight = '0';
      content.style.opacity = '0';
      content.style.overflow = 'hidden';
    }

    summary.addEventListener('click', (e) => {
      e.preventDefault();

      if (detail.open) {
        // 收起动画
        content.style.overflow = 'hidden';
        content.style.maxHeight = (content.scrollHeight || 0) + 'px';
        // 强制重排后设置为 0 触发过渡
        requestAnimationFrame(() => {
          content.style.maxHeight = '0';
          content.style.opacity = '0';
        });
        content.addEventListener('transitionend', function handler() {
          detail.open = false;
          content.removeEventListener('transitionend', handler);
        }, { once: true });
      } else {
        // 展开动画
        detail.open = true;
        content.style.overflow = 'hidden';
        content.style.maxHeight = '0';
        requestAnimationFrame(() => {
          const targetHeight = content.scrollHeight || 0;
          content.style.maxHeight = targetHeight + 'px';
          content.style.opacity = '1';
        });
        content.addEventListener('transitionend', function handler() {
          // 展开完成后移除 maxHeight 限制，让内容自适应
          content.style.maxHeight = 'none';
          content.style.overflow = 'visible';
          content.removeEventListener('transitionend', handler);
        }, { once: true });
      }
    });
  });
}

// ===== 按钮涟漪效果 =====
function initButtonRipple() {
  const buttons = document.querySelectorAll('.custom-btn, .tag, .dock-btn');

  buttons.forEach((btn) => {
    btn.addEventListener('click', function(e) {
      // 移除已有的涟漪
      const existingRipple = this.querySelector('.ripple-effect');
      if (existingRipple) existingRipple.remove();

      const ripple = document.createElement('span');
      ripple.classList.add('ripple-effect');

      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';

      this.style.position = 'relative';
      this.style.overflow = 'hidden';
      this.appendChild(ripple);

      setTimeout(() => ripple.remove(), 600);
    });
  });
}
