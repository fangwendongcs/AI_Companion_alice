# ANIMATION ARCHITECTURE

日期：2026-05-14  
范围：第二轮动画系统工程化重构

## 1. 当前动画系统结构

```text
js/animation/
  AnimationController.js       # 动画运行时总控：mixer、状态请求、播放、结束回调
  AnimationRegistry.js         # 动作注册表：动作实例和动作元数据
  AnimationFactory.js          # 程序化动作工厂：idle/speaking/listening/点击反馈
  AnimationRetargeter.js       # 骨骼重定向：Mixamo/VRM/GLB humanoid 骨骼适配
  AnimationBlender.js          # 分层播放和混合：base/gesture/expression/lipsync
  AnimationStateMachine.js     # 动画状态机：状态流转规则和状态到动作映射
  AnimationQueue.js            # 动作队列：优先级、冷却、打断、去重
  ActionQueue.js               # 兼容导出，避免旧 import 立即失效
  MotionManager.js             # 角色动作 manifest 加载与 motion slot 请求门面
  MotionSlotRegistry.js        # 标准槽位、默认参数、slot -> state、manifest 解析
  states.js                    # AvatarState 常量
  animationTypes.js            # 动作类型、来源、layer 常量
```

保留原有入口：

```text
MotionManager -> AnimationController
```

所以 `script.js`、`InteractionManager`、`CharacterManager` 不需要知道内部拆分细节。

## 2. 每个模块职责

### AnimationController

职责：

- 初始化 `THREE.AnimationMixer`
- 加载 FBX 文件动作
- 调用 `AnimationRetargeter` 做骨骼适配
- 调用 `AnimationRegistry` 注册动作
- 调用 `AnimationFactory` 注册程序化 fallback 动作
- 接收状态请求并执行动作
- 监听 mixer `finished` 事件
- 动作结束后回到 idle
- 释放 mixer listener、action cache、timer、queue

它不再直接包含大量程序化动作细节，也不再直接维护骨骼候选表。

### AnimationRegistry

职责：

- 保存 `name -> AnimationAction`
- 保存 `name -> actionMeta`
- 标准化动作元数据

动作元数据包含：

```js
{
  name,
  type,                 // loop / once
  source,               // file / procedural
  path,
  factory,
  loop,                 // repeat / once
  layer,                // base / gesture / expression / lipsync
  priority,
  interrupt,
  interruptible,
  fadeIn,
  fadeOut,
  baseWeightWhileActive,
  returnToIdle,
  applicableAvatarTypes,
  cooldown,
  clipDuration,
  tags
}
```

### AnimationFactory

职责：

- 生成程序化动作 clip。
- 为缺少真实动作资源的角色提供 fallback。
- 当前内置：

```text
idle
speaking
listening
intro
headTap
legTap
armTap
bodyTap
chat
```

这保证 Shiro / Wambo 即使没有绑定 Alice 的 FBX，也能有默认姿态、待机和点击反馈。

### AnimationRetargeter

职责：

- 维护 humanoid 骨骼候选名称。
- 将源动作 track 的骨骼名映射到当前角色骨骼。
- 支持传入 `skeleton.mixamo.json`。
- 预留 `retargetAdapter` 入口，后续可按角色接入更专业的 retarget profile。

如果命中骨骼数量过少，会返回 `null`，避免强行动作导致姿态异常。

### AnimationBlender

职责：

- 播放 base layer 循环动作。
- 播放 gesture layer 一次性动作。
- 设置 layer weight。
- 处理基础 fadeIn/fadeOut。

当前 layer：

```text
base        idle / speaking / listening
gesture     intro / headTap / legTap / armTap / bodyTap / chat
expression  预留表情层
lipsync     预留口型层
```

### AnimationStateMachine

职责：

- 定义状态切换规则。
- 定义状态对应的动作计划。
- 判断临时状态是否需要自动回 idle。

### MotionSlotRegistry

职责：

- 维护标准动作槽位：`idle`、`intro`、`headTap`、`legTap`、`armTap`、`bodyTap`、`chat`、`speaking`、`listening`。
- 维护每个槽位的默认优先级、layer、fade、interrupt 等元数据。
- 维护 `motionSlot -> AvatarState` 映射。
- 将角色 `motions.json` 解析为 `AnimationController` 可消费的 action manifest。

这样 `MotionManager` 不再直接承担 slot 配置和 manifest 解析细节，交互层也不需要依赖完整的 `MotionManager` 模块才能拿到 `MotionSlot` 常量。

### AnimationQueue

职责：

- 按 layer 维护 active action 和 pending actions。
- 支持优先级排序。
- 支持高优先级打断低优先级。
- 支持 action cooldown。
- 防止循环动作重复堆叠。
- 限制每个 layer 的队列长度。

## 3. 状态机规则

当前支持的状态：

```text
idle
entering
listening
thinking
speaking
reacting
interrupted
error
boot
interacting
arm_action
head_action
leg_action
```

其中 `boot/interacting/arm_action/head_action/leg_action` 是为了兼容旧逻辑保留的状态。

核心规则：

```text
idle -> entering -> idle
idle -> listening -> thinking -> speaking -> idle
idle -> reacting -> idle
speaking -> interrupted -> idle
any -> error -> idle
```

实际状态到动作映射：

```text
entering / boot      -> intro
idle                 -> idle
listening / thinking -> listening
speaking             -> speaking
reacting/interacting -> bodyTap
head_action          -> headTap
arm_action           -> armTap
leg_action           -> legTap
interrupted/error    -> idle
```

一次性动作播放结束后，如果当前状态是临时状态，会自动请求 `idle`。

## 3.1 动作请求链路

当前主链路：

```text
InteractionManager
  -> motionSlot(headTap/legTap/armTap/bodyTap)
  -> MotionManager.requestSlot()
  -> MotionSlotRegistry 解析 state/defaults
  -> AnimationController.requestAction()
  -> AnimationStateMachine 校验状态切换
  -> AnimationQueue 决定立即播放/排队/打断/忽略
  -> AnimationBlender 分层播放
  -> mixer finished / fallback timer
  -> returnToIdle
```

重要约束：

- 交互层请求标准 slot，不直接请求 `AvatarState.HEAD_ACTION`。
- `AnimationController.requestAction()` 是动作进入队列前的统一入口。
- 如果动作被 cooldown/去重策略忽略，会回滚刚刚尝试进入的临时状态，避免内部状态卡在 `head_action` 之类的状态。
- 如果连续快速点击不同部位，gesture queue 会保留 active 动作和最新 pending 动作，减少长时间排队。

## 4. 队列和优先级策略

队列维度是 layer。

```text
base layer     主要播放循环状态动作
gesture layer  主要播放一次性点击/反应动作
```

策略：

- 如果当前 layer 没有 active action，立即播放。
- 如果新动作 `interrupt=true` 且优先级高于当前 active action，则打断当前动作。
- 否则进入队列。
- 队列按 `priority desc`、`createdAt asc` 排序。
- 同名 pending action 会去重，避免连续点击把队列堆满。
- 交互触发的 gesture slot 默认会替换旧的 pending gesture，只保留最新意图，避免快速点击后延迟播放一串过期动作。
- 循环动作如果已经 active，不重复入队。
- 每个动作可设置 `cooldown`，防止连续快速点击导致状态混乱。

当前程序化点击反馈的 cooldown 是 240ms，外层 `InteractionManager` 还有 260ms 点击冷却。

## 5. 动作注册方式

动作来源有两类。

### 文件动作

来自角色的 `motions.json`：

```json
{
  "slots": {
    "headTap": {
      "file": "models/animations/head.fbx",
      "loop": "once",
      "priority": 10,
      "layer": "gesture",
      "interrupt": true,
      "fadeIn": 0.15,
      "fadeOut": 0.2,
      "tags": ["interaction", "head"]
    }
  }
}
```

加载流程：

```text
MotionManager.loadForCharacter()
  -> load motions.json
  -> toActionManifest()
  -> AnimationController.registerFileActions()
  -> AnimationRetargeter.retargetClipToAvatar()
  -> AnimationRegistry.register()
```

### 程序化动作

来自 `AnimationFactory.js`。

如果某个 slot 没有可用 FBX，且 `proceduralFallbacks[slot] = true`，就注册程序化动作。

示例：

```json
{
  "proceduralFallbacks": {
    "idle": true,
    "headTap": true,
    "legTap": true
  }
}
```

## 6. 如何新增一个动作

优先路径：新增标准 slot 或复用已有 slot。

### 方式 A：给角色绑定文件动作

在角色的 `motions.json` 中增加：

```json
{
  "slots": {
    "wave": {
      "file": "public/avatars/alice/motions/wave.fbx",
      "loop": "once",
      "priority": 9,
      "layer": "gesture",
      "interrupt": true,
      "fadeIn": 0.15,
      "fadeOut": 0.2,
      "tags": ["interaction", "greeting"]
    }
  }
}
```

然后需要在 `MotionManager` 中把业务 slot 映射到状态，或者在后续版本扩展为完全配置化 slot-state 映射。
如果是新增标准 slot，现在优先在 `MotionSlotRegistry.js` 中补充默认参数和 slot-state 映射，再在角色 `interactions` 中绑定。

### 方式 B：新增程序化动作

在 `AnimationFactory.js`：

1. 在 `PROCEDURAL_ACTION_DEFS` 增加动作元数据。
2. 在 `getFactory()` 增加 name -> method 映射。
3. 新增 `createXxxClip()`。
4. 在角色 `motions.json` 里启用 `proceduralFallbacks.xxx = true`。

## 7. 如何给某个角色绑定动作

角色配置入口：

```text
public/avatars/{avatarId}/meta.json
public/avatars/{avatarId}/motions.json
public/avatars/{avatarId}/skeleton.mixamo.json
```

`meta.json` 推荐结构：

```json
{
  "id": "avatar_id",
  "name": "Avatar Name",
  "model": {
    "url": "public/avatars/avatar_id/model.vrm",
    "format": "vrm"
  },
  "thumbnail": "",
  "skeleton": {
    "type": "humanoid",
    "map": "public/avatars/avatar_id/skeleton.mixamo.json"
  },
  "animations": {
    "manifest": "public/avatars/avatar_id/motions.json",
    "standardSlots": true
  },
  "motionManifest": "public/avatars/avatar_id/motions.json",
  "skeletonMap": "public/avatars/avatar_id/skeleton.mixamo.json",
  "interactions": {
    "head": { "motionSlot": "headTap" },
    "body": { "motionSlot": "bodyTap" },
    "arm": { "motionSlot": "armTap" },
    "leg": { "motionSlot": "legTap" }
  },
  "voice": {
    "defaultEngine": "browser"
  }
}
```

旧字段 `motionManifest` 和 `skeletonMap` 仍然保留，保证当前代码和旧角色配置兼容。

## 8. 与事件系统/状态基座联动

当前已同步到 `CompanionStateStore` 的动画相关状态：

```text
animationState
currentAnimation
isAnimating
isSpeaking
isThinking
lastInteractionAt
currentAvatarId
```

当前动画相关事件：

```text
interaction:hit
animation:state
animation:action:start
animation:action:complete
audio:start
audio:end
dialogue:user
dialogue:assistant
dialogue:error
```

交互模块现在先发出 `interaction:hit`，再由事件监听触发反应动作，避免点击模块直接强耦合动画控制器。

## 9. 生命周期清理

`AnimationController.destroy()` 和 `reset()` 会清理：

- mixer `finished` event listener
- 当前 action
- action cache
- completion fallback timer
- queue
- layer active 状态
- retargeter/factory 引用

`MotionManager.destroy()` 会进一步释放 controller，并清空当前角色动作配置引用。

角色切换时仍走：

```text
motionManager.unload()
characterManager.switchCharacter()
motionManager.loadForCharacter()
```

UI 触发的角色切换通过 `requestAvatarSwitch()` 串行化执行，避免快速连续选择角色时多个异步加载流程互相覆盖。

## 10. 如何排查动画不播放

按这个顺序查：

1. 确认角色是否加载成功：`public/avatars/registry.json` 和对应 `meta.json`。
2. 确认 `meta.json` 的 `motionManifest` 或 `animations.manifest` 路径正确。
3. 确认 `motions.json` 的 slot 名是否是标准槽位。
4. 如果是 FBX 动作，确认路径存在并能被静态服务访问。
5. 如果控制台出现 `骨骼映射命中太少`，说明 FBX 与当前角色骨骼不匹配，需要调整 `skeleton.mixamo.json` 或启用程序化 fallback。
6. 如果没有真实动作，确认 `proceduralFallbacks[slot] = true`。
7. 如果连续点击无反应，确认是否被 `InteractionManager.cooldownMs` 或 action `cooldown` 拦截。
8. 如果动作结束后没有回 idle，确认动作 meta 的 `returnToIdle` 是否为 `true`，以及当前状态是否是临时状态。
9. 切换角色后异常，确认 `motionManager.unload()` 和 `AnimationController.reset()` 是否被调用。

## 11. 当前仍然保留的技术债

- 标准 slot 默认配置和 slot-state 映射已经从 `MotionManager` 拆到 `MotionSlotRegistry`，但 slot schema 还没有外置成 JSON。
- `AnimationBlender` 当前只是基础 fade/weight 管理，还没有真正的 avatar-specific mask。
- `expression/lipsync` layer 仍是预留，没有接表情和口型同步。
- Retarget 仍是名称映射方案，后续更专业的 VRM/Humanoid retarget 可以接到 `retargetAdapter`。
