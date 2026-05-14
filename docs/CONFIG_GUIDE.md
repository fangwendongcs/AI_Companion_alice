# Config Guide

## 前端配置

主要文件：

```text
js/config/appConfig.js
js/config/dialogues.js
js/config/providers.js
js/config/voicePresets.js
js/config/validateConfig.js
```

`appConfig.js` 包含：

- `APP_MODE`
- `APP_VERSION`
- avatar registry URL
- 请求超时
- UI timing
- 交互阈值
- 上传模型扩展名

## 角色配置

角色目录：

```text
public/avatars/{avatarId}/
  meta.json
  motions.json
  skeleton.mixamo.json
  model.vrm | model.glb | model.gltf
```

`meta.json` 推荐字段：

```json
{
  "id": "avatar_id",
  "name": "Avatar Name",
  "model": { "url": "public/avatars/avatar_id/model.vrm", "format": "vrm" },
  "thumbnail": "",
  "skeleton": { "type": "humanoid", "map": "public/avatars/avatar_id/skeleton.mixamo.json" },
  "animations": { "manifest": "public/avatars/avatar_id/motions.json", "standardSlots": true },
  "motionManifest": "public/avatars/avatar_id/motions.json",
  "skeletonMap": "public/avatars/avatar_id/skeleton.mixamo.json",
  "interactions": {
    "head": { "motionSlot": "headTap" },
    "body": { "motionSlot": "bodyTap" },
    "arm": { "motionSlot": "armTap" },
    "leg": { "motionSlot": "legTap" }
  },
  "voice": { "defaultEngine": "browser" }
}
```

旧字段 `motionManifest` 和 `skeletonMap` 暂时保留。

## 检查命令

```bash
npm run check:config
npm run check:assets
```

配置错误会在开发模式或检查脚本里给出明确提示。
