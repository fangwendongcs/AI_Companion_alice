# Changeset Boundaries

本文件记录的是阶段 1 已完成的一组连续重构边界，便于回看审查逻辑和提交顺序；它不是当前工作区 diff 的实时描述。

## 当前状态

- 入口拆分、动画链路、目录治理、静态资源/TTS 统一都已经完成并进入主分支。
- 当前阶段已经从“拆分综合 diff”切换到“阶段 2 MVP 闭环与稳定性验收”。
- 如果需要判断当前真实状态，应优先阅读 `README.md`、`ARCHITECTURE.md`、`MVP_ACCEPTANCE.md` 和最新 `REFACTOR_NOTES.md`。

## 1. App / Backend Entry Split

范围：

- `js/app/`
- `js/ui/`
- `js/core/lifecycle/`
- `backend/routes/`
- `backend/services/`
- `backend/utils/`
- `backend/middleware/`
- `backend/server.js`

核心目的：

- 拆薄 `script.js`
- 拆薄 `server.js`
- 建立 DOM listener 生命周期管理
- 建立 API response 兼容层

## 2. Animation Pipeline

范围：

- `js/animation/`
- `js/interaction/InteractionManager.js`
- `docs/architecture/ANIMATION_ARCHITECTURE.md`

核心目的：

- 标准动作槽位
- 动作请求统一入口
- 队列、优先级、快速点击收口

## 3. Repository Structure Governance

范围：

- `README.md`
- `docs/**`
- `archive/**`
- `.gitignore`

核心目的：

- 清理根目录
- 按主题整理文档
- 归档旧配置、旧脚本和原始素材

## 4. Runtime Resource / TTS Unification

范围：

- `js/core/loadJson.js`
- `js/core/resources/`
- `js/services/api/ApiClient.js`
- `js/avatar/AvatarLoader.js`
- `js/voice/TTSService.js`

核心目的：

- 统一 JSON 资源加载错误模型
- 统一静态模型/动画路径解析
- 让 TTS 二进制响应也走 `ApiClient.response()`，但保留 `Blob -> Audio` 播放流程

## Suggested Commit Order

如果后续要拆成多个提交，建议顺序：

1. `refactor: split app and server entry flows`
2. `refactor: tighten animation request pipeline`
3. `chore: reorganize project files and clean root directory`
4. `refactor: unify static resources and tts transport`

当前没有自动提交；这份文档只用于把综合 diff 的边界写清楚，降低审查成本。
