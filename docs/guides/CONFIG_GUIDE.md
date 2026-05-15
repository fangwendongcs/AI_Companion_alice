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
  manifest.json
  meta.json              # 可选 legacy fallback，不再由新流程生成
  motions.json
  skeleton.mixamo.json
  model.vrm | model.glb | model.gltf
```

`manifest.json` 推荐字段：

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

当前规则：

- `manifest.json` 是新角色配置唯一主入口。
- 新增角色流程只写 `manifest.json`，不再新增 `meta.json`。
- `meta.json` 只保留给历史角色配置使用；旧 registry 条目只有 `meta` 时，运行时会 fallback。
- `registry.json` 的新条目只写 `manifest` 字段。
- `manifest + meta` 双轨条目不再允许；`check:config` 会直接拦截。
- `meta.json` 与 `loadMeta()` 的兼容窗口为 `2026-05-15` 至 `2026-08-15`；`2026-08-16` 起满足迁移条件后可删除，详见 [AVATAR_META_DEPRECATION_PLAN.md](../refactor/AVATAR_META_DEPRECATION_PLAN.md)。
- 旧字段 `motionManifest` 和 `skeletonMap` 暂时保留，便于现有运行时代码平滑过渡。

## 新增角色

1. 新建 `public/avatars/{avatarId}/`
2. 放入模型与资源文件。
3. 新增 `manifest.json`，填写 `model`、`animations`、`skeleton`、`interactions`、`voice`。
4. 在 `registry.json` 中新增：

```json
{
  "id": "avatar_id",
  "name": "Avatar Name",
  "manifest": "public/avatars/avatar_id/manifest.json"
}
```

历史角色如果还没有迁移，旧 registry 仍可暂时保留：

```json
{
  "meta": "public/avatars/avatar_id/meta.json"
}
```

新增角色后优先运行：

```bash
npm run check:config
npm run check:assets
```

## 检查命令

```bash
npm run check:config
npm run check:assets
npm run check:legacy-avatar
```

配置错误会在开发模式或检查脚本里给出明确提示。
