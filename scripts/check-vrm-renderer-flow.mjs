import { readFile } from 'node:fs/promises';
import { ExpressionController } from '../js/avatar/presentation/ExpressionController.js';
import { LipSyncController } from '../js/avatar/presentation/LipSyncController.js';
import { MotionController } from '../js/avatar/presentation/MotionController.js';
import { PresentationOrchestrator, createFallbackAffect } from '../js/avatar/presentation/PresentationOrchestrator.js';
import { TTSController, TTSLifecycleStatus } from '../js/avatar/presentation/TTSController.js';
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
await checkPresentationOrchestrator();
await checkPresentationControllers();
await checkMotionController();
await checkTTSController();
await checkVrmManifestCapabilities();
await checkLocalTestManifests();
await checkLocalGirlWaveMotionConfig();
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
  const avatarLoader = await readText('js/avatar/AvatarLoader.js');
  const animationController = await readText('js/animation/AnimationController.js');
  const appController = await readText('js/app/AppController.js');
  const indexHtml = await readText('index.html');
  const styles = await readText('css/style.css');
  const orchestrator = await readText('js/avatar/presentation/PresentationOrchestrator.js');
  const motionController = await readText('js/avatar/presentation/MotionController.js');
  const ttsController = await readText('js/avatar/presentation/TTSController.js');
  const audioSampler = await readText('js/avatar/presentation/AudioAmplitudeSampler.js');
  const vrmRenderer = await readText('js/avatar/renderers/VRMRenderer.js');

  assert(characterManager.includes('createAvatarRenderer'), 'CharacterManager 应通过 AvatarRendererFactory 创建 renderer。');
  assert(characterManager.includes('applyAvatarDirective'), 'CharacterManager 应暴露 applyAvatarDirective。');
  assert(characterManager.includes('manifest.boy.json'), 'CharacterManager 应支持 boy 本地 VRM 测试 manifest 注入。');
  assert(characterManager.includes('manifest.girl.json'), 'CharacterManager 应支持 girl 本地 VRM 测试 manifest 注入。');
  assert(appController.includes('PresentationOrchestrator'), 'AppController 应通过 PresentationOrchestrator 协调表现层。');
  assert(appController.includes('avatarCapabilities'), 'AppController 应把 renderer capability 快照同步到前端状态。');
  assert(appController.includes('syncMotionDebugState'), 'AppController 应同步 MotionManager debug 状态。');
  assert(appController.includes('getRequestedMotionId') && appController.includes("params.get('motion')"), 'AppController 应支持 debug-only motion query 触发。');
  assert(appController.includes('transitionState: false'), 'debug motion query 不应被业务状态机切换阻塞。');
  assert(appController.includes('getRequestedQAMode') && appController.includes("qaMode !== 'motion'"), 'AppController 应支持 debug-only qa=motion 视觉验收模式。');
  assert(styles.includes('body.qa-motion .bottom-hud') && styles.includes('body.qa-motion .debug-panel'), 'qa=motion 应隐藏底部输入遮挡并调整 Debug 面板位置。');
  assert(indexHtml.includes('@pixiv/three-vrm-animation'), 'index.html import map 应声明 @pixiv/three-vrm-animation。');
  assert(avatarLoader.includes('VRMLoaderPlugin'), 'AvatarLoader 应使用 three-vrm VRMLoaderPlugin 加载 VRM。');
  assert(avatarLoader.includes('vrmRuntime'), 'AvatarLoader 应暴露 VRM runtime capability 快照。');
  assert(animationController.includes('VRMAnimationLoaderPlugin'), 'AnimationController 应使用 VRMAnimationLoaderPlugin 加载 VRMA。');
  assert(animationController.includes('createVRMAnimationClip'), 'AnimationController 应把 VRMA 转换为 AnimationClip。');
  assert(animationController.includes('loadVRMAClip'), 'AnimationController 应提供 VRMA clip 加载入口。');
  assert(orchestrator.includes('class PresentationOrchestrator'), '应存在 PresentationOrchestrator 表现编排骨架。');
  assert(orchestrator.includes('createNoopController'), 'PresentationOrchestrator 应预留后续 controller safe no-op 接口。');
  assert(orchestrator.includes('MotionController'), 'PresentationOrchestrator 应委托 MotionController 处理动作表现。');
  assert(orchestrator.includes('TTSController'), 'PresentationOrchestrator 应委托 TTSController 处理 TTS 生命周期。');
  assert(orchestrator.includes('getDebugState'), 'PresentationOrchestrator 应暴露表现层 debug snapshot。');
  assert(!orchestrator.includes('getMotionSlotForDirective('), 'PresentationOrchestrator 不应继续持有具体 directive -> motion 映射。');
  assert(motionController.includes('getMotionSlotForDirective'), 'MotionController 应集中处理 directive -> motion 映射。');
  assert(motionController.includes('getMotionSlotForAffect'), 'MotionController 应集中处理 affect -> motion 映射。');
  assert(motionController.includes("gesture === 'wave'") && motionController.includes('PresentationMotionSlot.WAVE'), 'MotionController 应把 wave 指令映射到独立 wave slot。');
  assert(ttsController.includes('TTSLifecycleStatus'), 'TTSController 应集中记录 TTS / audio lifecycle 状态。');
  assert(ttsController.includes('onRequest') && ttsController.includes('onError'), 'TTSController 应覆盖 request/start/end/error 生命周期。');
  assert(audioSampler.includes('createAudioAmplitudeSampler'), '应存在可选 audio amplitude sampler 供 lip-sync 使用。');
  assert(vrmRenderer.includes('ExpressionController'), 'VRMRenderer 应委托 ExpressionController 处理表情 / blink。');
  assert(vrmRenderer.includes('LipSyncController'), 'VRMRenderer 应委托 LipSyncController 处理 speaking mouth loop。');
  assert(vrmRenderer.includes('this.vrm?.update'), 'VRMRenderer.update 应推进 three-vrm runtime。');
  assert(vrmRenderer.includes('setLookAt'), 'VRMRenderer 应暴露 setLookAt 执行入口。');
  assert(vrmRenderer.includes('hasSpringBoneManager'), 'VRMRenderer capability 应暴露 springBone runtime 状态。');
  assert(vrmRenderer.includes('hasSpringBoneReset'), 'VRMRenderer capability 应暴露 springBone reset 可用性。');
  assert(vrmRenderer.includes('resetSecondaryMotion'), 'VRMRenderer 应提供 secondary motion reset 执行入口供后续 QA 验证。');
  assert(vrmRenderer.includes('inspectRetargetReadiness'), 'VRMRenderer capability 应暴露 retarget readiness。');
  assert(!vrmRenderer.includes('applyEmotion('), 'VRMRenderer 不应继续持有 emotion 表现决策。');
  assert(!vrmRenderer.includes('updateBlink('), 'VRMRenderer 不应继续持有 blink timing 逻辑。');
  assert(!vrmRenderer.includes('updateLipSync('), 'VRMRenderer 不应继续持有 lip-sync timing 逻辑。');
}

async function checkPresentationOrchestrator() {
  const appliedDirectives = [];
  const requestedSlots = [];
  const orchestrator = new PresentationOrchestrator({
    characterManager: {
      applyAvatarDirective(directive) {
        appliedDirectives.push(directive);
        return { ok: true };
      }
    },
    motionManager: {
      requestSlot(slot, options) {
        requestedSlots.push({ slot, options });
      }
    },
    log: { debug() {} }
  });

  const dialogue = orchestrator.applyDialogueResponse({
    avatarDirective: {
      state: 'speaking',
      emotion: 'happy',
      gesture: 'soft_nod',
      gaze: 'user',
      lip_sync: 'auto',
      intensity: 0.7
    },
    affect: {
      emotion: 'happy',
      tone: 'playful',
      motion: { slot: 'happy', intensity: 0.7 }
    }
  });

  assert(dialogue.directive.tone === 'playful', 'PresentationOrchestrator 应把 affect tone 合并到 AvatarDirective。');
  assert(appliedDirectives.at(-1)?.emotion === 'happy', 'PresentationOrchestrator 应把 AvatarDirective 转交给 CharacterManager。');

  orchestrator.handleAudioStart();
  assert(requestedSlots.some((request) => request.slot === 'speaking'), 'audio:start 应请求 speaking motion slot。');
  assert(requestedSlots.some((request) => request.slot === 'chat'), 'soft_nod / happy 应能映射到 chat motion slot。');
  assert(orchestrator.controllers.tts.getState().status === TTSLifecycleStatus.PLAYING, 'audio:start 应把 TTSController 标记为 playing。');

  orchestrator.applyDialogueResponse({
    avatarDirective: null,
    affect: createFallbackAffect()
  });
  orchestrator.handleAudioStart();
  assert(appliedDirectives.at(-1)?.state === 'speaking', '缺少 AvatarDirective 时 audio:start 应创建 speaking fallback directive。');

  orchestrator.handleAudioEnd({ currentState: 'speaking', emotion: 'neutral' });
  assert(appliedDirectives.at(-1)?.state === 'idle', 'audio:end 应恢复 idle directive。');
  assert(requestedSlots.at(-1)?.slot === 'idle', 'speaking 结束后应请求 idle motion slot。');
  assert(orchestrator.controllers.tts.getState().status === TTSLifecycleStatus.ENDED, 'audio:end 应把 TTSController 标记为 ended。');

  orchestrator.handleAudioError({
    currentState: 'speaking',
    error: new Error('test audio error'),
    message: 'test audio error'
  });
  assert(appliedDirectives.at(-1)?.state === 'idle', 'audio:error 应恢复 idle directive。');
  assert(orchestrator.controllers.tts.getState().status === TTSLifecycleStatus.ERROR, 'audio:error 应把 TTSController 标记为 error。');
}

async function checkMotionController() {
  const requestedSlots = [];
  const controller = new MotionController({
    motionManager: {
      requestSlot(slot, options) {
        requestedSlots.push({ slot, options });
        return true;
      }
    },
    log: { debug() {} }
  });

  const audioStart = controller.onAudioStart({
    directive: {
      state: 'speaking',
      gesture: 'soft_nod'
    },
    affect: {
      motion: { slot: 'happy' }
    }
  });
  assert(audioStart.slot === 'chat', 'MotionController 应优先把 soft_nod / happy 映射到 chat slot。');
  assert(requestedSlots.some((request) => request.slot === 'speaking'), 'MotionController audio:start 应请求 speaking base slot。');
  assert(requestedSlots.some((request) => request.slot === 'chat'), 'MotionController audio:start 应请求 semantic gesture slot。');

  const idle = controller.onAudioEnd({ currentState: 'speaking' });
  assert(idle.slot === 'idle', 'MotionController audio:end 应能在 speaking 后请求 idle。');

  const listening = controller.applyDirective({ state: 'thinking', gesture: 'thinking' });
  assert(listening.slot === 'listening', 'MotionController 应把 thinking 映射到 listening slot。');

  const safeNoop = new MotionController().requestAffectMotion(
    { motion: { slot: 'apologize' } },
    'bodyTap'
  );
  assert(safeNoop.ok === false && safeNoop.requested.length > 0, 'MotionController 缺少 MotionManager 时应返回 safe no-op 结果。');
}

async function checkTTSController() {
  const controller = new TTSController();
  const requested = controller.onRequest({
    engine: 'browser',
    affect: { emotion: 'warm' }
  });
  assert(requested.status === TTSLifecycleStatus.REQUESTED, 'TTSController audio:request 应进入 requested 状态。');
  assert(requested.engine === 'browser', 'TTSController 应记录非敏感 TTS engine。');

  const started = controller.onStart({
    engine: 'browser',
    directive: { state: 'speaking' }
  });
  assert(started.status === TTSLifecycleStatus.PLAYING, 'TTSController audio:start 应进入 playing 状态。');
  assert(started.shouldStartLipSync === true, 'speaking directive 应提示可以启动 lip-sync。');

  const fallback = controller.onFallback({
    message: 'backend unavailable'
  });
  assert(fallback.status === TTSLifecycleStatus.FALLBACK, 'TTSController audio:fallback 应进入 fallback 状态。');
  assert(fallback.error?.message === 'backend unavailable', 'TTSController fallback 应保留脱敏错误信息。');

  const ended = controller.onEnd({ fallback: true });
  assert(ended.status === TTSLifecycleStatus.ENDED, 'TTSController audio:end 应进入 ended 状态。');
  assert(ended.shouldStopLipSync === true, 'audio:end 应提示停止 lip-sync。');

  const errored = controller.onError({
    error: Object.assign(new Error('audio failed'), { code: 'AUDIO_FAILED' })
  });
  assert(errored.status === TTSLifecycleStatus.ERROR, 'TTSController audio:error 应进入 error 状态。');
  assert(errored.error?.code === 'AUDIO_FAILED', 'TTSController error 应保留稳定错误码。');
}

async function checkPresentationControllers() {
  const fakeMesh = {
    isMesh: true,
    morphTargetDictionary: {
      Fcl_ALL_Joy: 0,
      Fcl_ALL_Sorrow: 1,
      Fcl_MTH_A: 2,
      Fcl_MTH_I: 3,
      Fcl_EYE_Close: 4
    },
    morphTargetInfluences: new Array(5).fill(0)
  };
  const executor = {
    resetExpressionGroups(groups) {
      groups.forEach((group) => this.setGroupInfluence(group, 0));
    },
    setGroupInfluence(group, value) {
      const indexByGroup = {
        happy: 0,
        sad: 1,
        mouthA: 2,
        mouthI: 3,
        blink: 4
      };
      const index = indexByGroup[group];
      if (Number.isInteger(index)) fakeMesh.morphTargetInfluences[index] = value;
    },
    hasAnyGroup(groups) {
      return groups.includes('blink');
    }
  };

  const expression = new ExpressionController({ executor });
  expression.applyDirective({ emotion: 'happy', intensity: 0.8, tone: 'playful' });
  assert(fakeMesh.morphTargetInfluences[0] > 0, 'ExpressionController 应能把 happy emotion 映射为表情 influence。');
  expression.blink.nextIn = 0;
  expression.update(0.08);
  assert(fakeMesh.morphTargetInfluences[4] > 0, 'ExpressionController 应能驱动 blink。');

  const lipSync = new LipSyncController({ executor });
  lipSync.setMouthGroups(['mouthA', 'mouthI']);
  lipSync.applyDirective({ state: 'speaking', lip_sync: 'auto', intensity: 0.8, tone: 'playful' });
  assert(fakeMesh.morphTargetInfluences[2] > 0, 'LipSyncController 应能启动 mouthA。');
  lipSync.update(0.12);
  assert(fakeMesh.morphTargetInfluences[3] > 0, 'LipSyncController 应能推进到 mouthI。');
  const fixedLoopAmount = fakeMesh.morphTargetInfluences[3];
  const loopDebug = lipSync.getDebugState();
  assert(loopDebug.mode === 'loop', 'LipSyncController 应暴露 fallback speaking loop debug mode。');
  assert(loopDebug.mouthGroup === 'mouthI', 'LipSyncController debug 应记录当前 mouth group。');
  const amplitudes = [0.05, 0.95];
  lipSync.onAudioStart({
    directive: { state: 'speaking', lip_sync: 'auto', intensity: 0.8, tone: 'playful' },
    audioSource: { getAmplitude: () => amplitudes.shift() ?? 0.95 }
  });
  assert(lipSync.getDebugState().audioDriven === true, 'LipSyncController debug 应标记 audio-driven 模式。');
  lipSync.update(0.04);
  const lowAudioAmount = Math.max(fakeMesh.morphTargetInfluences[2], fakeMesh.morphTargetInfluences[3]);
  lipSync.update(0.04);
  const highAudioAmount = Math.max(fakeMesh.morphTargetInfluences[2], fakeMesh.morphTargetInfluences[3]);
  assert(lowAudioAmount !== fixedLoopAmount, 'LipSyncController audio-driven 模式应不再只使用固定 speaking loop 强度。');
  assert(highAudioAmount > lowAudioAmount, 'LipSyncController 应能用 audio amplitude 提升 mouth intensity。');
  assert(lipSync.getDebugState().smoothedAmplitude > 0, 'LipSyncController debug 应暴露平滑音量。');
  lipSync.onAudioEnd();
  assert(lipSync.getDebugState().mode === 'idle', 'LipSyncController audio:end 后 debug mode 应回到 idle。');
  assert(fakeMesh.morphTargetInfluences[2] === 0 && fakeMesh.morphTargetInfluences[3] === 0, 'LipSyncController audio:end 应清理 mouth influence。');
  const fallback = lipSync.onAudioStart({
    directive: { state: 'speaking', lip_sync: 'auto', intensity: 0.8 },
    audioSource: null
  });
  assert(fallback.fallback === true, '缺少 audioSource 时 LipSyncController 应安全 fallback 到 speaking loop。');
  assert(lipSync.getDebugState().fallback === true, 'LipSyncController debug 应标记缺少 audioSource 时的 fallback。');
  lipSync.applyDirective({ state: 'idle', lip_sync: 'none', intensity: 0 });
  assert(fakeMesh.morphTargetInfluences[2] === 0 && fakeMesh.morphTargetInfluences[3] === 0, 'LipSyncController 应在 idle 时清理 mouth。');
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

async function checkLocalGirlWaveMotionConfig() {
  const motions = await readJson('assets/avatars/test-vrm/motions.json');
  const wave = motions.slots?.wave || {};
  assert(wave.id === 'wave', 'local_girl_vrm_test motions.json 应提供 wave 测试 slot。');
  assert(wave.renderer === 'vrm', 'wave 测试动作应声明 renderer=vrm。');
  assert(wave.mode === 'vrma', 'wave 测试动作应声明 mode=vrma。');
  assert(wave.source === 'file', 'wave 测试动作应声明 source=file。');
  assert(wave.format === 'vrma', 'wave 测试动作应声明 format=vrma。');
  assert(wave.path === 'assets/motions/vrm/test/VRMA_02Greeting.vrma', 'wave 测试动作应使用人工放置的授权 VRMA 测试路径。');
  assert(wave.layer === 'gesture', 'wave 测试动作应运行在 gesture layer。');
  assert(wave.fallback === 'procedural', 'wave 测试动作缺文件时应回退 procedural。');
  assert(motions.proceduralFallbacks?.wave === true, 'wave 缺外部文件时应保留 procedural fallback。');
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
  const fakeExpressionValues = {};
  const fakeExpressions = new Set(['happy', 'aa', 'ih', 'ou', 'ee', 'oh', 'blink', 'blinkLeft', 'blinkRight']);
  const requiredHumanoidBones = [
    'hips',
    'spine',
    'chest',
    'upperChest',
    'neck',
    'head',
    'leftUpperArm',
    'rightUpperArm',
    'leftLowerArm',
    'rightLowerArm',
    'leftHand',
    'rightHand',
    'leftUpperLeg',
    'rightUpperLeg',
    'leftLowerLeg',
    'rightLowerLeg',
    'leftFoot',
    'rightFoot'
  ];
  const fakeVrm = {
    humanoid: {
      getNormalizedBoneNode(name) {
        return requiredHumanoidBones.includes(name) ? { name: `VRM_${name}` } : null;
      }
    },
    expressionManager: {
      expressionMap: Object.fromEntries([...fakeExpressions].map((name) => [name, {}])),
      getExpression(name) {
        return fakeExpressions.has(name) ? {} : null;
      },
      setValue(name, value) {
        fakeExpressionValues[name] = value;
      }
    },
    lookAt: {
      target: null,
      lookAt(target) {
        this.lastTarget = target;
      },
      reset() {
        this.lastTarget = null;
      }
    },
    springBoneManager: {
      reset() {
        this.wasReset = true;
      }
    },
    update(delta) {
      this.lastDelta = delta;
    }
  };
  const fakeAvatar = {
    userData: {
      vrm: fakeVrm
    },
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
  assert(initResult.capabilities.hasVrmRuntime === true, 'VRMRenderer capability 应暴露 three-vrm runtime。');
  assert(initResult.capabilities.hasExpressionManager === true, 'VRMRenderer capability 应暴露 expressionManager。');
  assert(initResult.capabilities.hasLookAt === true, 'VRMRenderer capability 应暴露 lookAt。');
  assert(initResult.capabilities.hasSpringBoneManager === true, 'VRMRenderer capability 应暴露 springBoneManager。');
  assert(initResult.capabilities.hasSpringBoneReset === true, 'VRMRenderer capability 应暴露 springBone reset 可用性。');
  assert(initResult.capabilities.retargetReady === true, 'VRMRenderer capability 应能确认 humanoid retarget readiness。');
  assert(initResult.capabilities.retargetMissingBones.length === 0, 'VRMRenderer retarget readiness 不应误报关键骨骼缺失。');
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
  assert(fakeExpressionValues.happy > 0, 'VRMRenderer 应优先通过 expressionManager 写入 VRM preset 表情。');
  assert(fakeMesh.morphTargetInfluences[0] > 0, 'happy 表情应通过 expressionMap 产生 morph influence。');
  assert(fakeMesh.morphTargetInfluences[4] > 0, 'speaking + lip_sync=auto 应先驱动 mouthA。');
  renderer.update(0.1);
  assert(fakeVrm.lastDelta > 0, 'VRMRenderer.update 应调用 vrm.update(delta)。');
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

  const resetResult = renderer.resetSecondaryMotion('qa-test');
  assert(resetResult.ok === true && fakeVrm.springBoneManager.wasReset === true, 'VRMRenderer resetSecondaryMotion 应调用 springBoneManager.reset。');

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

  renderer.expressionController.blink.nextIn = 0;
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
