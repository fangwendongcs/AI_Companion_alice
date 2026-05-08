# 可替换人物模型架构

当前项目已经从“写死 Alice 模型”改为“通过角色注册表 + 角色 meta 配置加载”。旧交互方式保留：点击头部、腿部、手臂、身体仍然触发对应动作和台词。

## 目录结构

```text
public/
  avatars/
    registry.json
    alice/
      meta.json
      motions.json
      skeleton.mixamo.json
      model.vrm            # 新角色推荐放这里；Alice 当前复用 models/characters/avatar_v2.glb

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
3. 写 `meta.json`：声明模型路径、缩放、位置、命中区域、动作配置路径
4. 写 `motions.json`：把动作文件映射到标准槽位
5. 如果动作来源骨骼和模型骨骼不同，写 `skeleton.mixamo.json`
6. 在 `public/avatars/registry.json` 里追加：

```json
{
  "id": "new_avatar",
  "name": "New Avatar",
  "meta": "public/avatars/new_avatar/meta.json"
}
```

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
