import { AvatarLoader } from './avatar/AvatarLoader.js';
import { AnimationController, AvatarState } from './animation/AnimationController.js';
import { LLMClient } from './ai/LLMClient.js';
import { PROVIDER_BASE_URLS } from './config/providers.js';
import { loadJson } from './core/loadJson.js';
import { HitTestController } from './interaction/HitTestController.js';
import { SceneRuntime } from './scene/SceneRuntime.js';
import { LocalConfigStore } from './storage/LocalConfigStore.js';
import { SpeechRecognitionService } from './voice/SpeechRecognitionService.js';
import { TTSService } from './voice/TTSService.js';

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

if (location.protocol === 'file:') {
  alert('请使用本地服务器运行本项目，例如：npm run dev、npx serve . 或 python -m http.server。');
}

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
  scaleSlider: document.getElementById('scaleSlider'),
  lightSlider: document.getElementById('lightSlider'),
  autoRotateToggle: document.getElementById('autoRotateToggle'),
  gridToggle: document.getElementById('gridToggle'),
  gridBg: document.getElementById('gridBg'),
  saveMemoryBtn: document.getElementById('saveMemoryBtn'),
  debugToggle: document.getElementById('debugToggle'),
  freezeAnimToggle: document.getElementById('freezeAnimToggle'),
  llmProvider: document.getElementById('llmProvider'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  apiKeyToggle: document.getElementById('apiKeyToggle'),
  baseUrlInput: document.getElementById('baseUrlInput'),
  llmModel: document.getElementById('llmModel'),
  systemPromptInput: document.getElementById('systemPromptInput'),
  saveLLMConfigBtn: document.getElementById('saveLLMConfigBtn'),
  testLLMBtn: document.getElementById('testLLMBtn'),
  llmStatus: document.getElementById('llmStatus'),
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
  ambientSlider: document.getElementById('ambientSlider'),
  fovSlider: document.getElementById('fovSlider')
};

const dialogues = {
  head: ['别摸头啦，发型要乱了！', '指挥官，今天有什么新任务吗？', '嗯？怎么突然摸我头？'],
  body: ['哇！别突然戳我！', '我在待命状态，系统运转正常。', '机体反馈良好，随时可以出击。'],
  arm: ['手臂活动一下～感觉关节润滑得不错！', '嘿！别拉我的手！', '装甲臂伸展完毕，战斗准备就绪。'],
  leg: ['腿部驱动器运转正常！', '别碰我的腿啦，好痒！', '跑步测试？随时可以开始！'],
  chat: ['收到指令。系统全功率运转中。', '这个赛博空间的感觉不错吧？', '我随时准备执行你的计划。'],
  idle: ['如果没事的话，我就先挂机休息了哦。', '镜头可以随便转，细节都经得起看。'],
  record: ['录制功能暂未完全接入流媒体，当前仅作 UI 演示。']
};

const store = new LocalConfigStore();
const llmClient = new LLMClient();
const ttsService = new TTSService();
const runtime = new SceneRuntime(document.getElementById('scene'));
const avatarLoader = new AvatarLoader(runtime);
const animationController = new AnimationController();
const recognitionService = new SpeechRecognitionService();
animationController.onStateComplete = (nextState) => setAvatarState(nextState);

const state = {
  currentState: AvatarState.IDLE,
  isMuted: false,
  modelLoaded: false,
  speechTimer: null,
  characterManifest: null,
  actionManifest: null,
  skeletonMap: null
};

let llmConfig = store.loadLLMConfig();
let ttsConfig = store.loadTTSConfig();
let hitTestController = null;

init();

async function init() {
  try {
    localStorage.removeItem('llm_api_key');
    prepareLLMKeyUI();

    state.characterManifest = await loadJson('config/characters/alice.manifest.json');
    state.actionManifest = await loadJson(state.characterManifest.actionManifest);
    state.skeletonMap = await loadJson(state.characterManifest.skeletonMap);

    runtime.init(state.characterManifest);
    bindEvents();
    runtime.render((delta) => animationController.update(delta));

    await loadAvatarAndAnimations();
  } catch (error) {
    console.error('[App] 初始化失败:', error);
    showLoadingError(error.message);
  }
}

async function loadAvatarAndAnimations() {
  try {
    const result = await avatarLoader.load(state.characterManifest, (percent) => {
      refs.loaderProgress.style.width = `${percent}%`;
    });

    state.modelLoaded = true;
    hitTestController = new HitTestController(runtime, state.characterManifest.hitRegions);
    refs.loaderProgress.style.width = '100%';

    await animationController.init({
      avatar: result.avatar,
      actionManifest: state.actionManifest,
      skeletonMap: state.skeletonMap
    });

    setAvatarState(AvatarState.BOOT);
    setTimeout(() => {
      if (state.currentState === AvatarState.BOOT) setAvatarState(AvatarState.IDLE);
    }, 4000);
    setTimeout(() => {
      refs.loading.style.opacity = '0';
      setTimeout(() => {
        refs.loading.style.display = 'none';
      }, 500);
      showDialogue('[SYSTEM] 模型装载完毕，交互系统已激活。');
    }, 500);
  } catch (error) {
    console.error('[ResourceLoader] 系统资源加载中断:', error);
    avatarLoader.createFallback();
    showLoadingError(error.message);
  }
}

function bindEvents() {
  window.addEventListener('resize', () => runtime.onResize());

  refs.settingsBtn.addEventListener('click', () => refs.sidePanel.classList.add('show'));
  refs.closePanelBtn.addEventListener('click', () => refs.sidePanel.classList.remove('show'));
  refs.sendBtn.addEventListener('click', handleChat);
  refs.promptInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') handleChat();
  });

  refs.muteBtn.addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    refs.muteBtn.style.color = state.isMuted ? 'var(--muted)' : 'var(--text)';
    showDialogue(state.isMuted ? '语音播报已静音。' : '语音播报已开启。');
  });

  bindSceneControls();
  bindLLMControls();
  bindTTSControls();
  bindMemoryControls();
  bindInteractionControls();
  initSmoothDetails();
  initButtonRipple();
}

function bindSceneControls() {
  refs.scaleSlider.addEventListener('input', (event) => {
    if (!state.modelLoaded) return;
    runtime.avatarRoot.scale.setScalar(parseFloat(event.target.value));
    runtime.fitCameraToObject(runtime.avatarRoot);
  });

  refs.lightSlider.addEventListener('input', (event) => {
    runtime.dirLight.intensity = parseFloat(event.target.value);
  });

  refs.ambientSlider?.addEventListener('input', (event) => {
    runtime.ambientLight.intensity = parseFloat(event.target.value);
  });

  refs.fovSlider?.addEventListener('input', (event) => {
    runtime.camera.fov = parseFloat(event.target.value);
    runtime.camera.updateProjectionMatrix();
  });

  refs.autoRotateToggle.addEventListener('change', (event) => {
    runtime.controls.autoRotate = event.target.checked;
    runtime.controls.autoRotateSpeed = 2.0;
  });

  refs.gridToggle.addEventListener('change', (event) => {
    refs.gridBg.style.opacity = event.target.checked ? '1' : '0';
  });

  refs.debugToggle.addEventListener('change', (event) => {
    runtime.debug.enabled = event.target.checked;
    runtime.debug.boxes.forEach((box) => {
      box.visible = runtime.debug.enabled;
    });
  });

  refs.freezeAnimToggle.addEventListener('change', (event) => {
    runtime.debug.freezeAnim = event.target.checked;
    if (runtime.debug.freezeAnim) {
      animationController.stopAll();
    } else {
      setAvatarState(state.currentState);
    }
  });
}

function bindLLMControls() {
  refs.llmProvider.value = llmConfig.provider;
  refs.baseUrlInput.value = llmConfig.baseUrl;
  refs.llmModel.value = llmConfig.model;
  refs.systemPromptInput.value = llmConfig.systemPrompt;

  refs.llmProvider.addEventListener('change', (event) => {
    const url = PROVIDER_BASE_URLS[event.target.value] || '';
    if (!refs.baseUrlInput.value) refs.baseUrlInput.value = url;
  });

  refs.saveLLMConfigBtn.addEventListener('click', () => {
    llmConfig = {
      provider: refs.llmProvider.value,
      baseUrl: refs.baseUrlInput.value.trim(),
      model: refs.llmModel.value,
      systemPrompt: refs.systemPromptInput.value.trim()
    };
    store.saveLLMConfig(llmConfig);
    showLLMStatus('success', '配置已保存。API Key 请配置在后端环境变量中。');
  });

  refs.testLLMBtn.addEventListener('click', async () => {
    showLLMStatus('loading', '正在通过后端测试连接...');
    try {
      const reply = await llmClient.test(readLLMFormConfig());
      showLLMStatus('success', `连接成功：${reply.slice(0, 40)}`);
    } catch (error) {
      showLLMStatus('error', `连接失败：${error.message.slice(0, 120)}`);
    }
  });
}

function bindTTSControls() {
  refs.ttsEngine.value = ttsConfig.engine;
  refs.speechRate.value = ttsConfig.rate;
  refs.speechPitch.value = ttsConfig.pitch;
  refs.openaiVoiceSelect.value = ttsConfig.openaiVoice;
  refs.rateVal.textContent = ttsConfig.rate.toFixed(2);
  refs.pitchVal.textContent = ttsConfig.pitch.toFixed(2);

  syncTTSEngineUI();
  populateVoices();
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = populateVoices;

  refs.ttsEngine.addEventListener('change', (event) => {
    ttsConfig.engine = event.target.value;
    store.saveTTSConfig(ttsConfig);
    syncTTSEngineUI();
  });

  refs.voiceSelect.addEventListener('change', (event) => {
    ttsConfig.browserVoice = event.target.value;
    store.saveTTSConfig(ttsConfig);
  });

  refs.speechRate.addEventListener('input', (event) => {
    ttsConfig.rate = parseFloat(event.target.value);
    refs.rateVal.textContent = ttsConfig.rate.toFixed(2);
    store.saveTTSConfig(ttsConfig);
  });

  refs.speechPitch.addEventListener('input', (event) => {
    ttsConfig.pitch = parseFloat(event.target.value);
    refs.pitchVal.textContent = ttsConfig.pitch.toFixed(2);
    store.saveTTSConfig(ttsConfig);
  });

  refs.openaiVoiceSelect.addEventListener('change', (event) => {
    ttsConfig.openaiVoice = event.target.value;
    store.saveTTSConfig(ttsConfig);
  });

  refs.testVoiceBtn.addEventListener('click', () => {
    speakText('你好！我是 Alice，很高兴认识你！');
  });
}

function bindMemoryControls() {
  refs.saveMemoryBtn.addEventListener('click', () => {
    const name = document.getElementById('nameInput').value;
    const birthday = document.getElementById('birthdayInput').value;
    const likes = document.getElementById('likesInput').value;
    store.saveMemory({ name, birthday, likes });
    showDialogue(`好的${name ? '，' + name : ''}！我已经记住啦～`);
  });
}

function bindInteractionControls() {
  recognitionService.bind(refs.voiceBtn, {
    onResult: (transcript) => {
      refs.promptInput.value = transcript;
      handleChat();
    },
    onError: (event) => console.warn('[Speech] 识别错误:', event.error)
  });

  let isDragging = false;
  const canvas = runtime.renderer.domElement;
  canvas.addEventListener('pointerdown', () => {
    isDragging = false;
  });
  canvas.addEventListener('pointermove', () => {
    isDragging = true;
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!isDragging && hitTestController) {
      const hitPart = hitTestController.pick(event);
      if (hitPart) window.triggerReaction(hitPart);
    }
  });

  window.setMood = (mood) => {
    document.querySelectorAll('[id^="mood"]').forEach((el) => el.classList.remove('active'));
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

  window.triggerReaction = (type) => {
    const pool = dialogues[type] || dialogues.idle;
    const text = pool[Math.floor(Math.random() * pool.length)];
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
}

async function handleChat() {
  const text = refs.promptInput.value.trim();
  if (!text) return;

  refs.promptInput.value = '';
  refs.sendBtn.disabled = true;
  setAvatarState(AvatarState.THINKING);

  try {
    llmConfig = readLLMFormConfig();
    const reply = await llmClient.chat(text, llmConfig);
    setAvatarState(AvatarState.SPEAKING);
    speakText(reply);
  } catch (error) {
    console.error('[LLM] 调用失败:', error);
    setAvatarState(AvatarState.SPEAKING);
    speakText('抱歉，连接出现问题。请确认后端服务已启动，并配置了对应模型的 API Key。');
  } finally {
    refs.sendBtn.disabled = false;
  }
}

function readLLMFormConfig() {
  return {
    provider: refs.llmProvider.value,
    baseUrl: refs.baseUrlInput.value.trim(),
    model: refs.llmModel.value,
    systemPrompt: refs.systemPromptInput.value.trim()
  };
}

function setAvatarState(newState) {
  state.currentState = newState;
  refs.statusText.textContent = `ONLINE / ${newState.toUpperCase()}`;
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

  if (!runtime.debug.freezeAnim) animationController.setState(newState);
}

function showDialogue(text) {
  speakText(text);
}

function speakText(text) {
  if (state.speechTimer) clearTimeout(state.speechTimer);

  const estimatedDuration = Math.max(3000, text.length * 150);
  state.speechTimer = setTimeout(resetSpeakingState, estimatedDuration);

  ttsService.speak(text, ttsConfig, {
    muted: state.isMuted,
    onEnd: resetSpeakingState
  });
}

function resetSpeakingState() {
  if (state.speechTimer) {
    clearTimeout(state.speechTimer);
    state.speechTimer = null;
  }
  const transientStates = new Set([
    AvatarState.SPEAKING,
    AvatarState.INTERACTING,
    AvatarState.ARM_ACTION,
    AvatarState.HEAD_ACTION,
    AvatarState.LEG_ACTION
  ]);
  if (transientStates.has(state.currentState)) setAvatarState(AvatarState.IDLE);
}

function populateVoices() {
  const voices = ttsService.getVoices();
  const sorted = [...voices].sort((a, b) => {
    const azh = a.lang?.startsWith('zh') ? 1 : 0;
    const bzh = b.lang?.startsWith('zh') ? 1 : 0;
    if (azh !== bzh) return bzh - azh;
    return (a.name || '').localeCompare(b.name || '');
  });

  refs.voiceSelect.innerHTML = '<option value="auto">自动（优先晓晓 Neural）</option>';
  sorted.forEach((voice) => {
    const opt = document.createElement('option');
    opt.value = voice.name;
    opt.textContent = `${voice.name} (${voice.lang || 'unknown'})`;
    refs.voiceSelect.appendChild(opt);
  });

  const hasSaved = [...refs.voiceSelect.options].some((option) => option.value === ttsConfig.browserVoice);
  refs.voiceSelect.value = hasSaved ? ttsConfig.browserVoice : 'auto';
}

function syncTTSEngineUI() {
  refs.browserVoiceGroup.style.display = ttsConfig.engine === 'browser' ? '' : 'none';
  refs.openaiVoiceGroup.style.display = ttsConfig.engine === 'openai' ? '' : 'none';
}

function showLLMStatus(type, message) {
  refs.llmStatus.className = `llm-status ${type}`;
  refs.llmStatus.textContent = message;
  if (type !== 'loading') {
    setTimeout(() => {
      refs.llmStatus.className = 'llm-status';
    }, 4000);
  }
}

function prepareLLMKeyUI() {
  if (!refs.apiKeyInput) return;
  refs.apiKeyInput.value = '';
  refs.apiKeyInput.disabled = true;
  refs.apiKeyInput.placeholder = '已迁移到后端环境变量，例如 OPENAI_API_KEY';
  refs.apiKeyToggle.disabled = true;
  refs.apiKeyToggle.style.opacity = '0.35';
}

function showLoadingError(message) {
  refs.loaderProgress.style.backgroundColor = 'red';
  refs.loading.innerHTML = `
    <div style="color: red; margin-bottom: 12px;">SYSTEM ERROR: FAILED TO LOAD ASSETS</div>
    <div style="font-size: 12px; color: #888; max-width: 80%; text-align: center;">
      ${message || '资源加载失败'}<br><br>
      请确认使用本地服务器运行，并检查模型、动作和 manifest 路径。
    </div>
  `;
}

function initSmoothDetails() {
  document.querySelectorAll('details.section').forEach((detail) => {
    const content = detail.querySelector('.details-content');
    const summary = detail.querySelector('summary');
    if (!content || !summary) return;

    if (detail.open) {
      content.style.opacity = '1';
      content.style.maxHeight = 'none';
      content.style.overflow = 'visible';
    } else {
      content.style.maxHeight = '0';
      content.style.opacity = '0';
      content.style.overflow = 'hidden';
    }

    summary.addEventListener('click', (event) => {
      event.preventDefault();

      if (detail.open) {
        content.style.overflow = 'hidden';
        content.style.maxHeight = `${content.scrollHeight || 0}px`;
        requestAnimationFrame(() => {
          content.style.maxHeight = '0';
          content.style.opacity = '0';
        });
        content.addEventListener('transitionend', function handler() {
          detail.open = false;
          content.removeEventListener('transitionend', handler);
        }, { once: true });
      } else {
        detail.open = true;
        content.style.overflow = 'hidden';
        content.style.maxHeight = '0';
        requestAnimationFrame(() => {
          content.style.maxHeight = `${content.scrollHeight || 0}px`;
          content.style.opacity = '1';
        });
        content.addEventListener('transitionend', function handler() {
          content.style.maxHeight = 'none';
          content.style.overflow = 'visible';
          content.removeEventListener('transitionend', handler);
        }, { once: true });
      }
    });
  });
}

function initButtonRipple() {
  document.querySelectorAll('.custom-btn, .tag, .dock-btn').forEach((btn) => {
    btn.addEventListener('click', function(event) {
      const existingRipple = this.querySelector('.ripple-effect');
      if (existingRipple) existingRipple.remove();

      const ripple = document.createElement('span');
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      ripple.classList.add('ripple-effect');
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

      this.style.position = 'relative';
      this.style.overflow = 'hidden';
      this.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });
}
