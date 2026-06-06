# Asset Inventory

本文整理当前角色、模型、动画、音频和 UI 资源中哪些可作为 iOS 参考，哪些不建议直接复用。

## 总结

- iOS 第一版优先复用资源语义，不直接迁移 Web runtime。
- Alice / Shiro / Wambo 的角色 ID、名称、人格、tone、motion slot 可直接作为产品配置参考。
- GLB / VRM / FBX 是否进入 iOS，需要单独做授权、体积、性能和 native 渲染方案评估。
- CSS、DOM、Three.js、FBX 播放代码不建议直接复用。

## 角色 Registry

来源：`public/avatars/registry.json`

| avatarId | 名称 | iOS 建议 |
| --- | --- | --- |
| `alice` | Alice | 默认角色，优先复用人格和状态语义 |
| `osa_shiro` | Shiro（CC0 动漫风） | 可作为移动端第二角色参考 |
| `osa_wambo` | Wambo（CC0 风格化） | 可作为移动端第三角色参考 |

## 角色 Manifest

来源：

- `public/avatars/alice/manifest.json`
- `public/avatars/osa_shiro/manifest.json`
- `public/avatars/osa_wambo/manifest.json`

可复用字段：

- `id`
- `name`
- `type`
- `interactions`
- `voice.defaultEngine`
- `license`
- `integrations` 中非密钥的 provider/model 偏好

不建议 iOS MVP 直接复用：

- `model.url`
- `motionManifest`
- `skeletonMap`
- `transform`
- `camera`
- `hitRegions`
- `retargeting`

这些字段和 Web 3D runtime 强绑定。iOS 如果选择 SceneKit / RealityKit 再单独设计 native manifest。

## 模型资源

| 路径 | 类型 | iOS 建议 |
| --- | --- | --- |
| `public/models/characters/avatar_v2.glb` | Alice GLB | 可作视觉参考；直接复用前需评估授权、体积、骨骼、材质 |
| `public/models/characters/avatar.glb` | GLB | 历史/备用资源，先不进入 iOS |
| `public/models/characters/character1.obj` | OBJ | 静态模型格式，不适合作为首版 companion |
| `public/avatars/osa_shiro/model.vrm` | VRM | Shiro 视觉参考；iOS 原生支持需额外方案 |
| `public/avatars/osa_wambo/model.vrm` | VRM | Wambo 视觉参考；iOS 原生支持需额外方案 |

## 动画资源

| 路径 | MotionSlot | iOS 建议 |
| --- | --- | --- |
| `public/models/animations/boot.fbx` | `intro` | 不直接复用，先映射为 `boot` / `entering` 状态 |
| `public/models/animations/idle.fbx` | `idle` | 不直接复用，先用 SwiftUI 呼吸动效 |
| `public/models/animations/head.fbx` | `headTap` | 不直接复用，先用头像反馈 |
| `public/models/animations/leg.fbx` | `legTap` | 不直接复用，先用状态反馈 |
| `public/models/animations/arm_stretch.fbx` | `armTap` | 不直接复用，先用按钮/手势反馈 |

Shiro / Wambo 当前 `motions.json` 使用 procedural fallbacks，说明现有 FBX 尚未为这些 VRM 调好 retarget。iOS 不应把这些 FBX 当成可直接移植的稳定资产。

## 环境与物体资源

| 路径 | 类型 | iOS 建议 |
| --- | --- | --- |
| `public/models/environments/city.gltf` | 环境 GLTF | 桌面 Web 背景参考，iOS 首版不迁移 |
| `public/models/objects/car.obj` | 物体 OBJ | 非核心 companion 资产，iOS 首版不迁移 |

## UI 与品牌资源

| 路径 | 类型 | iOS 建议 |
| --- | --- | --- |
| `assets/logo.png` | Logo | 可作为 App icon / splash 方向参考，正式上架需重新出多尺寸图标 |
| `css/style.css` | Web CSS | 不迁移代码，只提炼色彩、信息层级、暗色 AI 产品感 |
| `index.html` | Web DOM | 不迁移 |
| `js/ui/*` | Web UI Controller | 不迁移，实现 SwiftUI View |

## 音频资源

当前仓库没有可直接复用的固定音频素材。语音主要来自：

- 浏览器本机语音 fallback。
- 后端 `/api/tts` 代理 OpenAI TTS 或 MiniMax TTS。

iOS 建议：

- 首版可用 `AVSpeechSynthesizer` 快速兜底。
- 需要高质量声音时调用后端 `/api/tts`。
- 不在 iOS 保存 TTS provider key。

## 配置资源

| 路径 | 内容 | iOS 建议 |
| --- | --- | --- |
| `backend/config/avatarPersonas.js` | Alice / Shiro / Wambo 人格 | 迁移为 Swift 静态配置或后端 persona API |
| `js/config/dialogues.js` | 点击反馈短句 | 可作为 iOS 轻量交互文案参考 |
| `js/config/voicePresets.js` | TTS voice label | 可参考，但 voice availability 以后端为准 |
| `js/config/providers.js` | 默认 provider/TTS 设置 | 可参考默认值，不迁移密钥 |
| `data/knowledge/` | 本地知识源 | 继续留后端，iOS 只消费 RAG sources |

## 授权注意

- Shiro / Wambo manifest 标注为 CC0，来源为 Open Source Avatars / 100Avatars。
- Alice 和 `public/models/characters/*` 的授权需要在进入 iOS 商业分发前再次确认。
- App Store 上架需要检查所有模型、纹理、字体、声音、图标、第三方库授权。

## iOS 资产策略

第一版：

- 不迁移 3D 模型。
- 用原生 SwiftUI 轻量 Avatar 状态表达。
- 复用角色名、人格、motion slot、emotion schema。

第二版：

- 选择 Rive / Lottie 做高质量 2D 动效，按 AvatarState 出状态图。
- 或选择 SceneKit / RealityKit 做受控 3D 方案。

第三版：

- 如果确实需要模型级复用，再评估 GLB / VRM 转换、骨骼兼容、性能和包体。

## 迁移前检查清单

- 确认资产授权可用于 iOS 和可能的商业展示。
- 确认模型体积是否适合移动端包体。
- 确认是否需要离线资源还是远程下载。
- 确认所有素材不包含密钥、证书、隐私信息。
- 确认不把 Web runtime 当成 iOS 运行依赖。

