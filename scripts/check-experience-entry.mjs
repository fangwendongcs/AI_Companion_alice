import { readFile } from 'node:fs/promises';

import {
  shouldShowDebugPanel,
  shouldUseDeveloperExperience
} from '../js/config/appConfig.js';

const failures = [];
const [html, css, app, controller, ui, refs, store, dialogues, manifest, errorView, sceneRuntime] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('css/style.css', 'utf8'),
  readFile('js/app/AppController.js', 'utf8'),
  readFile('js/ui/ExperienceEntryController.js', 'utf8'),
  readFile('js/ui/UIController.js', 'utf8'),
  readFile('js/ui/domRefs.js', 'utf8'),
  readFile('js/storage/LocalConfigStore.js', 'utf8'),
  readFile('js/config/dialogues.js', 'utf8'),
  readFile('public/avatars/alice/manifest.json', 'utf8'),
  readFile('js/ui/ErrorView.js', 'utf8'),
  readFile('js/scene/SceneRuntime.js', 'utf8')
]);

assert(shouldUseDeveloperExperience('') === false, '普通入口必须使用 Alice experience mode。');
assert(shouldUseDeveloperExperience('?debug=1') === true, '显式 debug 入口必须恢复开发工具。');
assert(shouldUseDeveloperExperience('?localVrm=1') === true, 'localVrm QA 入口必须恢复开发工具。');
assert(shouldShowDebugPanel('') === false, '本地普通入口也不应默认显示 Debug 面板。');
assert(shouldShowDebugPanel('?debug=1') === true, 'Debug 面板必须保留显式开启方式。');
assert(shouldShowDebugPanel('?debug=0') === false, 'debug=0 必须强制关闭 Debug 面板。');

assert(html.includes('<body class="experience-mode">'), 'HTML 首帧必须默认为 experience mode，避免开发控件闪现。');
assert(html.includes('id="welcomeCard"') && html.includes('id="welcomeStartBtn"'), '普通入口必须包含一次点击即可开始的欢迎卡。');
assert(html.includes('id="welcomeMemoryToggle"') && html.includes('允许 Alice 记住这次聊天'), '首次进入必须提供明确且默认关闭的记忆同意选择。');
assert(html.includes('id="memoryBtn"') && html.includes('id="privacyPopover"'), '普通入口必须提供持续可访问的记忆与隐私入口。');
assert(html.includes('id="experienceMemoryClearBtn"'), '用户必须能从普通入口清除本次会话记忆。');
assert(/class="[^"]*developer-only[^"]*" id="settingsBtn"/.test(html), '开发设置按钮必须标记为 developer-only。');
['regenerateBtn', 'clearContextBtn', 'voiceBtn'].forEach((id) => {
  assert(new RegExp(`class="[^"]*developer-only[^"]*" id="${id}"`).test(html), `${id} 必须从普通首次体验中隐藏。`);
});
assert(/class="side-panel developer-only" id="sidePanel"/.test(html), '完整控制面板必须只在开发入口显示。');
assert(css.includes('body.experience-mode .developer-only') && css.includes('display: none !important'), 'CSS 必须在普通入口隐藏开发控件。');
assert(css.includes('body.developer-mode .experience-only'), 'CSS 必须在开发入口隐藏普通用户欢迎层。');

assert(ui.includes('ExperienceEntryController') && ui.includes('this.experience'), 'UIController 必须接入独立体验入口控制器。');
[
  'welcomeCard',
  'welcomeStartBtn',
  'welcomeMemoryToggle',
  'memoryBtn',
  'privacyPopover',
  'experienceMemoryToggle',
  'experienceMemoryClearBtn'
].forEach((id) => assert(refs.includes(id), `domRefs 必须暴露 ${id}。`));
assert(controller.includes('markExperienceIntroComplete'), '欢迎卡选择必须持久化，不能每次刷新重复阻挡用户。');
assert(controller.includes('scope=session'), '普通隐私入口必须能清除当前会话及其显式记忆。');
assert(controller.includes('useMemory') && controller.includes('saveLLMConfig'), '记忆同意必须写入现有 LLM 配置，不建立第二套业务状态。');
assert(store.includes('alice_experience_intro_v1'), 'LocalConfigStore 必须保存欢迎流程完成状态。');

assert(!app.includes('[SYSTEM] 模型装载完毕'), '角色加载完成后不得再朗读开发者系统文案。');
assert(app.includes('handleAvatarReady'), 'Avatar ready 后必须把焦点交给普通用户体验入口。');
assert(app.includes('完整对话服务') === false, 'AppController 不应直接暴露 provider 技术状态文案。');
assert(!/(指挥官|机体|装甲|赛博空间|系统全功率)/.test(dialogues), '点击台词不得继续使用与 Alice Persona 冲突的机甲设定。');
assert(!errorView.includes('SYSTEM ERROR: FAILED TO LOAD ASSETS'), '普通加载失败不得显示英文系统错误文案。');
assert(sceneRuntime.includes('enabled: false'), 'SceneRuntime 的包围框和坐标轴必须默认关闭。');
assert(sceneRuntime.includes('setDebugEnabled'), 'Debug/QA 入口必须能显式恢复场景辅助物。');
assert(app.includes('setDebugEnabled(this.developerExperience)'), 'AppController 必须只在开发入口启用场景辅助物。');

const parsedManifest = JSON.parse(manifest);
assert(parsedManifest.id === 'alice', '正式默认 manifest 必须仍是 alice。');
assert(parsedManifest.model?.url === 'assets/avatars/test-vrm/girl.vrm', '正式 Alice 入口必须继续加载 girl.vrm。');

if (failures.length) {
  console.error('[check-experience-entry] 单一 Alice 入口检查失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-experience-entry] ok');

function assert(condition, message) {
  if (!condition) failures.push(message);
}
