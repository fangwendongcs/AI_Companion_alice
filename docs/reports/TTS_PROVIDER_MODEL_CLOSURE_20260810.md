# TTS Provider 三类模型收口记录

日期：2026-08-10—2026-08-11

## 本轮范围

本轮把 Alice TTS 正式收口为三类长期 Provider：

```text
local       默认本机语音，不需要云 API Key
remote      可选托管云语音，由用户 Test → Save → Switch
selfHosted  可选自建 GPU / 本地服务，由用户填写 Server URL 后 Test → Save → Switch
```

核心规则是：**Local-first，Remote-optional，Self-hosted-ready，Local fallback always available。**

用户明确要求本轮不做真实本地/远程语音对照。因此本文只记录架构、自动化假上游、浏览器 UI 和既有本地证据；Qwen3-TTS / Fish Audio 的真实中文、连续两轮、听感、成本和延迟对比仍是未完成项。

## 改动前审计

| 模块 | 已有能力 | 缺口 |
| --- | --- | --- |
| `TTSProviderRegistry` | 已注册 Mock、CosyVoice2、Qwen3-TTS、Fish Audio 和历史隐藏 adapter | 没有统一 descriptor/type，也没有 selfHosted identity；默认仍是 Mock |
| `TTSOrchestrator` | 统一 Audio Result、capability/metadata、错误归一 | Remote 失败只交给 Web 浏览器 fallback，没有先回退默认 Local Provider |
| `TTSService` | 分段、utterance session、取消、浏览器 fallback、统一 Audio Result 播放 | 不识别后端已完成的 local fallback metadata |
| `AudioManager / LipSync / Presentation` | 已有唯一播放和表现生命周期 | 无需重写；必须保持唯一链路 |
| Settings | 可静态选择四个 provider，选择立即写 `tts_engine` | 没有 descriptor 驱动字段，没有 Test → Save → Switch，没有 selfHosted 配置 |
| Secret 边界 | `.env` 和后端 adapter 不向前端返回 Key | 没有供本地 Settings 安全保存 provider 配置的持久化边界 |

结论：现有播放、分段、取消、静音、口型和 idle 链路已经足够。本轮只补 Provider 描述、配置服务、回退策略与 Settings 产品流程，没有建立第二套 AudioManager 或 Presentation。

## 最终架构

```text
Alice dialogue text
  -> TTSService / existing utterance session
    -> POST /api/tts
      -> TTSOrchestrator
        -> TTSProviderRegistry + descriptor
          -> local: cosyvoice
          -> remote: qwen3_tts / fish_audio
          -> selfHosted: self_hosted
        -> unified Audio Result
      -> remote/selfHosted failed?
        -> retry default local cosyvoice in the same Orchestrator
      -> local runtime also failed?
        -> existing browser/system speech fallback
    -> existing AudioManager
      -> existing LipSync / Presentation / final idle
```

`mock` 仍保留用于自动化和 Audio Result contract，但不再作为产品默认选项。历史 Higgs / OpenAI / MiniMax adapter 仍隐藏，本轮没有扩展或删除它们。

## Provider descriptor

每个正式 Provider 由统一 descriptor 表达：

```text
id
displayName
technicalName
type: local | remote | selfHosted
requiredFields
optionalFields
capabilities
models
voices
selectable
```

Settings 从 `/api/providers` 的安全 descriptor 动态生成选项和表单。后续新增 provider 不需要再把字段、产品类型或 capability 散落到 `AppController`。

## 用户实际流程

### 默认语音

1. 新用户默认 `tts_engine=cosyvoice`。
2. `demo:start` 下由本机 CosyVoice2 生成真实语音，不需要云 Key。
3. 单独 `npm run dev` 且 CosyVoice2 runtime 未启动时，现有浏览器/系统语音作为本机最后兜底，Alice 仍可说话。

### 云端语音

1. 在 `?debug=1` 的 Settings 选择 Qwen3-TTS 或 Fish Audio。
2. 填写云平台颁发的 API Key、Model、Voice；URL 有官方默认值，也可覆盖。
3. 点击“测试声音”。测试使用临时配置真实调用 adapter，但不保存、不切换、不做 local fallback，从而不会把失败误报为通过。
4. 测试返回真实可播放 Audio Result 后，“保存并切换”才启用。
5. 保存成功后 provider 配置在 Alice 后端加密落盘，浏览器只把选中的 provider id 写入 localStorage。
6. 刷新页面时会先保留已保存 provider id，等 descriptor 就绪后恢复对应选项；不会被初始化阶段的 CosyVoice 占位项误覆盖。

Qwen3-TTS 的 Key 来自阿里云 Model Studio / DashScope；Fish Audio 的 Key 和 voice/reference id 来自 Fish Audio 平台。开源模型代码本身不颁发云 Key。

### 自建语音服务

1. 选择“自建语音服务”。
2. 填 `Server URL / Model / Voice`；访问 Key 可选。
3. 当前通用 adapter 约定服务提供 OpenAI-compatible `POST /v1/audio/speech`；API Path、格式和采样率可配置。
4. Test 成功后保存并切换。

未来 Qwen3-TTS、CosyVoice3、dots.tts、VoxCPM、LongCat 等如果通过这个兼容契约部署，不需要为播放器写模型逻辑；原生契约则新增薄 adapter 和 descriptor。

## Secret 与持久化边界

- Key 只存在于临时 password 输入、同源 HTTPS/localhost 请求和 Alice 后端内存中；不写前端 localStorage。
- `GET /api/providers` 和 Provider config 读取接口只返回字段 schema、非敏感值及 `configured=true/false`，从不回显 Key。
- Settings 保存内容使用 Node 内置 `AES-256-GCM` 整体加密，默认放在 Git-ignored 的 `runtime/tts/provider-config/`，文件权限为 `0600`。
- 本地首次保存会生成同目录 `0600` key 文件；production 应使用 Secret Manager 注入长随机 `TTS_CONFIG_ENCRYPTION_KEY`，不要依赖数据目录旁的本地 key。
- 配置 GET/Test/Save API 纳入现有 API auth；请求日志只记录 method/path/status/duration，不记录 body。
- `.env` 仍是部署和自动化的有效配置来源；Settings 保存值只作为该机器的运行时覆盖。
- 加密配置损坏或密钥不匹配时，错误被隔离在 remote 配置链路；Registry 仍注册默认 CosyVoice，避免凭据存储故障拖垮 Local fallback。

## Fallback 规则

1. `local` 请求失败：返回原失败，由现有 Web 系统语音兜底。
2. `remote` / `selfHosted` 请求失败：`TTSOrchestrator` 先调用 `TTS_LOCAL_FALLBACK_PROVIDER`，默认 `cosyvoice`。
3. Local 成功：返回实际 `provider=cosyvoice` 的统一 Audio Result，并写入安全 `metadata.fallback`。
4. `TTSService` 识别该 metadata，继续发出现有 `audio:fallback` 事件；AudioManager、LipSync、Presentation 和最终 idle 生命周期不变。
5. Local 也失败：保留原 remote/selfHosted 错误和 fallback attempt metadata，再进入原有浏览器/系统语音兜底。
6. Provider Test 显式禁用 local fallback；测试成功只代表所选 provider 自己真实返回了可播放音频。

## 当前 Provider 状态矩阵

| Provider | 类型 | 代码已接入 | 可确认有效凭据 | 真实 API/live | Mock/自动化 |
| --- | --- | --- | --- | --- | --- |
| `cosyvoice` | local | 是 | 不需要云 Key | 既有本机 CosyVoice2 live 与两轮基线已通过；本轮未重跑 | contract 通过 |
| `qwen3_tts` | remote | 是，DashScope 原生 API | 否；现有值不能证明有效 | 未通过 | fake HTTP contract + 加密 Test/Save 通过 |
| `fish_audio` | remote | 是，Fish 原生 API | 否 | 未通过 | fake HTTP contract 通过 |
| `self_hosted` | selfHosted | 是，OpenAI-compatible speech | 未配置 | 未通过 | fake HTTP contract + URL/model/voice 映射通过 |
| `mock` | local/test-only | 是，Settings 隐藏 | 不需要 | 不适用 | 通过 |
| Higgs / OpenAI / MiniMax | 历史隐藏实验 | 代码仍在 | 不作为本轮范围判断 | 未验收为公开 provider | 既有 contract 覆盖 |

## 本轮验证

已执行并通过：

- `npm run check:js`
- `npm run check:tts-provider-flow`
- `npm run check:provider-config`
- `npm run check:security-boundaries`
- `npm run check:api-auth-boundaries`
- `npm run check:mvp-flow`
- `npm run check`（全量）
- 清空真实 Provider 凭据的 `127.0.0.1:3105` 隔离服务上执行 `npm run smoke`
- `git diff --check`
- 本地 Playwright `http://127.0.0.1:3000/?debug=1`：三类选项和动态表单可见；默认 Local 不显示配置区；选择 Fish 不立即切换且 Save disabled；临时已保存 Fish 选择刷新后正确恢复；请求列表没有 `/test` 或 `/api/tts` POST；`tts_engine` 验收后恢复 `cosyvoice`；Console 0 error、1 个既有 warning。

自动化覆盖：descriptor 三类、Self-hosted request mapping、Remote 故障回退 CosyVoice、fallback 后既有 AudioManager 生命周期、未保存 Remote Test、测试后配置未变化校验、AES-GCM Save/Reload、损坏配置隔离、Key 不回显/不出现在加密文件、API auth、已保存 Remote 选择恢复、无系统 voice 列表时最终本地 fallback 不悬挂。

本轮没有执行：真实 Qwen3/Fish/selfHosted 合成、本地/远程延迟对照、真实远程连续两轮、远程音质/账单验收。因此不能宣称这些 live 项已完成。

## 新增 Provider 的最小范围

### 与 selfHosted 兼容契约一致

只需要部署服务并填写 `Server URL / Model / Voice`；Alice 代码无需修改。

### 新的原生 HTTP 契约

最小代码范围：

1. 新增一个 `backend/services/tts/providers/*Provider.js` adapter。
2. 在 `TTSProviderDescriptors.js` 增加 descriptor。
3. 在 Registry factory 增加 adapter constructor/config mapping。
4. 在 `check-tts-provider-flow` 增加 request/response/failure contract。
5. 更新 `LOCAL_TTS.md`、API contract、project memory，并完成真实 live 后再标记可用。

不需要修改 `AppController / AudioManager / LipSync / Presentation / TTSTextSegmenter`。

## 仍未解决

- `npm run dev` 不负责自动启动 CosyVoice2 模型；真实本地模型开箱体验应使用 `demo:start`。普通 `dev` 只有系统语音最后兜底。
- Qwen3/Fish 没有真实 API 验收和延迟/成本数据。
- 自建 adapter 当前选择 OpenAI-compatible speech 作为最低公共契约；不同开源项目的原生 streaming/voice clone API 仍可能需要薄 adapter 或部署侧 gateway。
- production 的 Settings 管理需要正式用户/管理员鉴权；当前仍是本地/私有单 token 基线。
- 浏览器播放仍消费完整 Audio Result；descriptor 可记录上游 streaming capability，但本轮没有重写播放器。

## 是否继续接第二个候选

暂时不值得继续增加新的 remote provider。Qwen3-TTS 与 Fish Audio 已占两个云候选，但都没有 live 数据；应先任选一个获得有效凭据，完成真实中文、连续两轮、取消/静音/fallback/idle、首音/完整耗时、听感和成本，再决定是否保留两个云入口。Self-hosted 已有通用位置，不需要现在按模型名继续堆 adapter。
