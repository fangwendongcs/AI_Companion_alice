# 可替换人物模型架构

当前项目已经从“写死 Alice 模型”改为“通过角色注册表 + 角色 manifest 配置加载”。旧交互方式保留：点击头部、腿部、手臂、身体仍然触发对应动作和台词。

## 目录结构

```text
public/
  avatars/
    registry.json
    alice/
      manifest.json
      meta.json
      motions.json
      skeleton.mixamo.json
      model.vrm            # 新角色推荐放这里；Alice 当前复用 models/characters/avatar_v2.glb
    osa_shiro/
      model.vrm            # Open Source Avatars / 100Avatars, CC0
      manifest.json
      meta.json
      motions.json
      skeleton.mixamo.json
    osa_wambo/
      model.vrm            # Open Source Avatars / 100Avatars, CC0
      manifest.json
      meta.json
      motions.json
      skeleton.mixamo.json

js/
  avatar/
    CharacterManager.js    # 加载、卸载、切换角色，应用缩放/位置/朝向
    AvatarLoader.js        # 底层 GLB/GLTF/VRM 容器加载
  animation/
    MotionManager.js       # 标准动作槽位 -> AnimationController
    AnimationController.js # 动作队列、分层动画、重定向
  interaction/
    InteractionManager.js  # 点击部位 -> 标准动作槽位
```

## 当前内置角色

```text
alice      -> 项目原始角色
osa_shiro  -> Shiro，Open Source Avatars / 100Avatars，CC0
osa_wambo  -> Wambo，Open Source Avatars / 100Avatars，CC0
```

`osa_shiro` 和 `osa_wambo` 都走同一套 `CharacterManager -> MotionManager -> InteractionManager` 链路，切换角色后会重新加载模型、动作槽、骨骼映射和点击命中区域。上传角色功能仍然使用 `POST /api/avatars`，不会被内置角色影响。

## 标准动作槽位

业务代码不再写具体动作文件名，只识别这些槽位：

```text
idle, intro, headTap, legTap, armTap, bodyTap, chat, speaking, listening
```

其中用户要求的核心槽位是：

```text
idle, intro, headTap, legTap, speaking, listening
```

`armTap / bodyTap / chat` 是为了兼容当前项目已有交互。

## 角色配置示例

```json
{
  "id": "new_avatar",
  "name": "New Avatar",
  "type": "humanoid-gltf",
  "model": {
    "url": "public/avatars/new_avatar/model.vrm",
    "format": "vrm"
  },
  "motionManifest": "public/avatars/new_avatar/motions.json",
  "skeletonMap": "public/avatars/new_avatar/skeleton.mixamo.json",
  "transform": {
    "targetHeight": 120,
    "position": { "x": 0, "y": 0, "z": 0 },
    "rotation": { "x": 0, "y": 0, "z": 0 },
    "scale": 1
  },
  "hitRegions": {
    "head": ["head", "neck"],
    "leg": ["leg", "foot", "toe"]
  },
  "interactions": {
    "head": { "motionSlot": "headTap" },
    "leg": { "motionSlot": "legTap" }
  },
  "retargeting": {
    "adapter": "mixamoHumanoidMap"
  }
}
```

## 动作配置示例

```json
{
  "slots": {
    "idle": {
      "file": "public/avatars/new_avatar/motions/idle.fbx",
      "loop": "repeat",
      "layer": "base"
    },
    "intro": {
      "file": "public/avatars/new_avatar/motions/intro.fbx",
      "loop": "once",
      "layer": "gesture"
    },
    "headTap": {
      "file": "public/avatars/new_avatar/motions/headTap.fbx",
      "loop": "once",
      "layer": "gesture"
    },
    "legTap": {
      "file": "public/avatars/new_avatar/motions/legTap.fbx",
      "loop": "once",
      "layer": "gesture"
    },
    "speaking": {
      "fallbackSlot": "idle",
      "loop": "repeat",
      "layer": "base"
    },
    "listening": {
      "fallbackSlot": "idle",
      "loop": "repeat",
      "layer": "base"
    }
  }
}
```

## 新增角色步骤

1. 新建目录：`public/avatars/{avatarId}/`
2. 放入模型：推荐 `model.vrm`，也支持 humanoid `model.glb` / `model.gltf`
3. 写 `manifest.json`：声明模型路径、缩放、位置、命中区域、动作配置路径
4. 写 `motions.json`：把动作文件映射到标准槽位
5. 如果动作来源骨骼和模型骨骼不同，写 `skeleton.mixamo.json`
6. 在 `public/avatars/registry.json` 里追加：

```json
{
  "id": "new_avatar",
  "name": "New Avatar",
  "manifest": "public/avatars/new_avatar/manifest.json",
  "meta": "public/avatars/new_avatar/meta.json"
}
```

`manifest.json` 是新的主配置文件，`meta.json` 目前仅作为兼容旧角色和旧上传流程的保留字段。运行时优先读取 `manifest`，没有时才回退 `meta`。

## 前端上传角色

侧边栏 `3D 场景与渲染配置 -> 上传/替换角色` 已接入后端 `POST /api/avatars`。

支持格式：

```text
.vrm
.glb
.gltf
```

推荐优先使用自包含资源的 `.vrm` 或 `.glb`。如果上传 `.gltf`，需要确保它不依赖未上传的外部 `.bin` 或贴图资源。

上传时会自动完成：

1. 保存模型到 `public/avatars/{avatarId}/model.*`
2. 生成或保存 `motions.json`
3. 生成或保存 `skeleton.mixamo.json`
4. 生成 `manifest.json`，并同步保留一份 `meta.json` 兼容副本
5. 更新 `public/avatars/registry.json`
6. 前端刷新角色列表并切换到新角色

如果没有上传动作配置，后端会生成默认动作槽位，沿用当前 Alice 的动作文件：

```text
intro -> models/animations/boot.fbx
idle -> models/animations/idle.fbx
headTap -> models/animations/head.fbx
legTap -> models/animations/leg.fbx
armTap -> models/animations/arm_stretch.fbx
```

`manifest.json` 会同时记录接口关联信息：

```json
{
  "integrations": {
    "llm": {
      "provider": "openai",
      "model": "gpt-4o-mini"
    },
    "tts": {
      "engine": "browser"
    }
  }
}
```

这些字段只负责把角色与接口配置关联起来，不会写入或修改任何 API Key。

## 旧交互为什么不受影响

- 点击检测仍然使用骨骼权重判断部位。
- `InteractionManager` 把旧的 `head / leg / arm / body / chat` 映射到动作槽位。
- `MotionManager` 再把动作槽位映射到旧状态机需要的状态。
- 旧台词池仍在 `script.js` 中按 `head / leg / arm / body / chat` 取文本。

所以旧逻辑仍然是：

```text
点击头部 -> head -> headTap -> HEAD_ACTION -> 播放 headTap 动作
点击腿部 -> leg  -> legTap  -> LEG_ACTION  -> 播放 legTap 动作
无交互   -> idle -> idle    -> IDLE        -> 循环 idle
初次加载 -> intro -> BOOT   -> 播放 intro
```

## 重定向预留

`AnimationController` 已预留 `retargetAdapter` 接口。默认使用 `skeleton.mixamo.json` 做骨骼名映射；后续如果接 VRM humanoid 标准骨架或更复杂的动作重定向，可以通过 `MotionManager.setRetargetAdapter()` 注入适配器。
