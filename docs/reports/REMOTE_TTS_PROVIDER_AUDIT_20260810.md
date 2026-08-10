# Alice 远程 TTS Provider 纠偏审计

日期：2026-08-10

## 结论

上一版实现范围有误：它把 SiliconFlow 作为公开远程 Provider，且默认模型为 `FunAudioLLM/CosyVoice2-0.5B`。这既不是 Qwen3-TTS，也没有完成 Fish Audio，因此不能算完成“Qwen3-TTS Remote API + Fish Audio API”目标。

本次纠偏保留已经合理的通用 Remote TTS 架构、统一 Audio Result、capability/metadata、latency 采集、Settings/readiness、安全与 fallback 补强，只把公开 Provider 范围纠正为：

```text
mock / cosyvoice / qwen3_tts / fish_audio
```

- `qwen3_tts` 使用阿里云 Model Studio / DashScope 官方原生 HTTP API，不经过 SiliconFlow。
- `fish_audio` 使用 Fish Audio 官方原生 `POST /v1/tts`，不是 OpenAI-compatible 代理。
- SiliconFlow adapter 和配置已从当前代码删除，不再是公开或已注册 Provider。
- Higgs / OpenAI / MiniMax 是仓库已有的隐藏实验 adapter；本次未扩展、未公开，也没有用它们替代 Qwen3/Fish。

代码与 fake contract 已接入并通过；当前机器没有有效 Qwen3-TTS 或 Fish Audio 凭据。现有 `QWEN_BASE_URL` 指向官方 DashScope，但 `QWEN_API_KEY` 是 `replace_with_*` placeholder，两轮 live 在预检阶段正确拒绝为 `missing_key`，没有发出计费请求。因此两者真实中文音频、连续两轮和真实远程延迟仍未验收，不能宣称远程闭环完成。

### 本阶段收口口径

用户于 2026-08-10 决定本阶段先不执行真实远程 TTS 对照，任务按“可插拔架构与两个目标 adapter 代码收口”交接。收口包含 Registry/Settings/统一 Audio Result/capability/metadata/取消/静音/fallback/安全边界、fake contract、全量回归，以及 CosyVoice2 本地两轮 live；不包含 Qwen3/Fish 的成功真实 API 调用、远程连续两轮、听感和 `remote - local` 延迟差值。这些项目明确后置，adapter 存在仍不能被表述为真实云端已验收。

## 开源模型、托管 API 与 Key 的区别

2026-08-10 对 Open-LLM-VTuber 当前 `main` 复核后确认：它的做法不是“开源 TTS 也要从本地拿 Key”，而是把本地引擎和云 API 并列放进同一个 TTS factory。`cosyvoice2_tts` 只配置本地 `client_url` 与模型参数；`fish_api_tts` 明确配置 Fish Audio 的 `api_key / reference_id / base_url`；当前 factory/config 中没有 Qwen3-TTS provider。它体现的是 provider adapter 思路，不是 Qwen3-TTS 的现成实现。

- Qwen3-TTS 官方代码和权重可下载到本地，用 `qwen-tts` Python 包或本地 Web UI 推理；这种模式不需要 DashScope Key。Alice 若采用它，应新增/复用一个指向本地运行时的 self-hosted adapter，Key 只在 Alice 自己决定保护该服务时才是可选的内部鉴权。
- DashScope 是阿里云托管的 Qwen3-TTS 推理服务。Alice 当前 `qwen3_tts` adapter 接的是这条远程路线，所以必须从 Model Studio 控制台创建同 region API Key；不是先在本地部署再向本地模型索取 Key。
- Fish Speech 也可自建本地 API server，不使用 Fish Audio 云 Key；Alice 当前 `fish_audio` adapter 接的是 Fish Audio 托管 `/v1/tts`，因此需要 Fish 账号生成的 Key。当前 Fish Speech 代码/权重采用 Fish Audio Research License，且官方 S2 本地 GPU 指南以 Linux/WSL、约 24GB VRAM 为基线，不能因仓库公开就默认等于无条件商用或适合当前 Mac 本地运行。

因此当前代码中的准确含义是 `qwen3_tts = Qwen3-TTS via DashScope`、`fish_audio = Fish Audio Cloud API`。未来自建 Qwen3/Fish 应作为独立 local/self-hosted provider identity 接入，但继续返回同一个 Audio Result，不改播放器。

## 上一版问题复核

| 问题 | 复核结论 |
| --- | --- |
| Qwen3-TTS 是否已真实接入 | 纠偏前没有。原 `qwen` 仅是 LLM provider；SiliconFlow TTS adapter 也默认调用 CosyVoice2。纠偏后代码接入 DashScope 官方 Qwen3-TTS，但尚无凭据，未完成真实 API 验收。 |
| Fish Audio 是否已真实接入 | 纠偏前没有。纠偏后代码接入官方原生 API，但尚无凭据，未完成真实 API 验收。 |
| SiliconFlow 是否是 Qwen3-TTS 托管入口 | 不是当时实现中的 Qwen3 入口。其 adapter/model 明确指向 SiliconFlow 的 CosyVoice2，因此属于目标范围替换。 |
| MiniMax / OpenAI 为什么出现 | 它们是仓库已有隐藏实验 adapter。上一轮为寻找可用凭据做了真实探针，但这偏离了 Qwen3/Fish 目标；本次不再以它们推进公开远程 TTS。 |

## 当前架构审计

| 层 | 当前职责 | 纠偏结果 |
| --- | --- | --- |
| Backend provider adapter | 配置校验、Alice 语义到上游协议映射、鉴权、响应归一 | 新增 Qwen3/Fish 原生 adapter；provider 特有字段不进入 AppController。 |
| `TTSProviderRegistry` | 注册 provider、按 id 选择 | 保留 CosyVoice2/历史实验 adapter，新增 Qwen3/Fish；公开集合另设白名单。 |
| `TTSOrchestrator` | 统一输入、异常归一、Audio Result metadata | 统一输出 provider/model/voice/capability/sampleRate/latency。 |
| `TTSHttp` | 超时、二进制音频读取、Base64、非敏感 timing | 记录 headers、首 chunk、完整读取、chunk evidence 和 Audio Result ready。 |
| `/api/tts` / `/api/providers` | 后端 TTS 与安全 readiness | 只公开 mock/cosyvoice/qwen3_tts/fish_audio；不返回 Key/URL。 |
| Web `TTSProviderRegistry` / Settings | 只发送公开 provider id 和统一语义 | 可切换本地与两个目标远程 Provider；model/voice/Key 不由前端覆盖。 |
| `TTSService` | utterance session、分段、完整音频播放、abort、浏览器 fallback | 复用原链路；后端请求等待期也登记到 session，防止取消后晚到播放。 |
| `AudioManager` / Presentation / LipSync | audio 生命周期、口型、motion、最终 idle | 没有新增第二套实例或 provider 分支。 |

```text
Alice semantic TTS request
  -> backend TTS Provider Registry
     -> CosyVoice2 Local
     -> Qwen3-TTS via official DashScope
     -> Fish Audio native API
     -> future self-hosted adapter
  -> unified Audio Result + safe capability/metadata
  -> existing TTSService / AudioManager
  -> existing LipSync / Presentation / final idle
```

## Qwen3-TTS 官方接入

接入方式：

- Endpoint：`POST {QWEN3_TTS_BASE_URL}{QWEN3_TTS_PATH}`
- 默认示例：`https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
- 鉴权：后端 Bearer `QWEN3_TTS_API_KEY`，兼容已有后端 `DASHSCOPE_API_KEY` / `QWEN_API_KEY`；Key 与 endpoint region 必须一致
- Model/voice：`QWEN3_TTS_MODEL` / `QWEN3_TTS_VOICE`
- 原生 payload：`model` 与 `input.text / voice / language_type`
- 非流式响应：读取 `output.audio.url`；后端校验 `aliyuncs.com` host、下载音频并转成 Base64，临时签名 URL 不下发 Web
- Capability：所有 Qwen3-TTS 记录 streaming 能力；仅 `*-vc-*` 标记 voice clone；仅 `*-instruct-*` 标记 emotion/instruction

官方资料：[Qwen3-TTS 非实时语音](https://www.alibabacloud.com/help/en/model-studio/non-realtime-tts-user-guide)、[Qwen-TTS API](https://www.alibabacloud.com/help/en/model-studio/qwen-tts-api)。

## Fish Audio 官方接入

接入方式：

- Endpoint：`POST https://api.fish.audio/v1/tts`
- 鉴权：后端 Bearer `FISH_AUDIO_API_KEY`
- Model：必须放在原生 `model` header；默认示例使用官方 free developer tier `s2.1-pro-free`
- Voice：`FISH_AUDIO_TTS_VOICE` 作为 JSON `reference_id`
- Alice prosody：在 adapter 内映射为 Fish `prosody.speed / volume / normalize_loudness`
- 输出：完整 WAV/PCM/MP3/Opus 二进制归一为 Audio Result；当前默认 MP3 44.1kHz
- Capability：streaming=true、voice clone=true、emotion=false；本轮不改播放器

Fish 官方接口没有被当作 OpenAI-compatible。官方资料：[Fish Audio Text to Speech](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)。

## 统一 capability / metadata

成功和失败 Audio Result 都由 Orchestrator 归一为：

```json
{
  "provider": "qwen3_tts",
  "model": "qwen3-tts-flash",
  "voice": "Cherry",
  "supportsStreaming": true,
  "supportsVoiceClone": false,
  "supportsEmotion": false,
  "sampleRate": 24000,
  "latency": {
    "synthesisMs": 0,
    "upstreamFirstChunkMs": 0,
    "fullGenerationMs": 0,
    "audioResultReadyMs": 0
  }
}
```

`supportsStreaming=true` 只描述上游能力；当前 `Audio Result.streaming=false`，继续使用完整音频、既有分段器和播放器。

## 配置与安全

所有配置均在后端 `.env` 或部署 Secret Manager：

```text
QWEN3_TTS_API_KEY / DASHSCOPE_API_KEY / QWEN_API_KEY
QWEN3_TTS_BASE_URL
QWEN3_TTS_PATH
QWEN3_TTS_MODEL
QWEN3_TTS_VOICE
QWEN3_TTS_LANGUAGE_TYPE
QWEN3_TTS_OUTPUT_FORMAT
QWEN3_TTS_SAMPLE_RATE

FISH_AUDIO_API_KEY
FISH_AUDIO_TTS_BASE_URL
FISH_AUDIO_TTS_PATH
FISH_AUDIO_TTS_MODEL
FISH_AUDIO_TTS_VOICE
FISH_AUDIO_TTS_OUTPUT_FORMAT
FISH_AUDIO_TTS_SAMPLE_RATE
FISH_AUDIO_TTS_LATENCY
```

前端只传 provider/text/locale/emotion/tone/prosody/stream。客户端提交的 model/voice 不覆盖后端配置；公开 readiness、错误与 live 报告不返回 Key、Authorization、上游 URL、签名 URL、请求正文或音频 Base64。

## 当前 Provider 实际状态

本表的“凭据”只表示当前被忽略的本地环境中是否存在非空 Key，不表示 endpoint/model/voice 配置完整，也不表示鉴权有效。

| Provider | 代码已接入 | 当前已有凭据/配置 | 真实 API 已验收 | Mock/自动化 |
| --- | --- | --- | --- | --- |
| Mock | 是；公开 | 无需凭据 | 不适用 | 通过，生成本地 WAV |
| CosyVoice2 Local | 是；公开 | runtime/模型/speaker 可用；`.env` base URL 未持久化 | **本次重新两轮通过**，均为有效 WAV | provider contract、fallback、分段/取消自动化通过 |
| Qwen3-TTS / DashScope | 是；公开 | 官方 Qwen base 存在；Key 是 placeholder，专用 model/voice 未配置 | **否** | 官方请求/响应 fake contract、故障、安全、metadata 通过；live 预检拒绝 placeholder |
| Fish Audio | 是；公开 | Key/base/model/voice 均缺失 | **否** | 原生 header/payload/binary fake contract、故障、安全、metadata 通过 |
| Higgs Audio | 是；隐藏实验 | Key 存在，base URL 缺失 | 否 | fake request mapping 通过 |
| OpenAI TTS | 是；隐藏实验 | Key/base URL 存在 | 否；先前官方 endpoint TLS 连接失败，无音频 | 没有进入当前公开专项验收 |
| MiniMax TTS | 是；隐藏实验 | Key/base URL 存在 | 否；先前官方请求被鉴权拒绝，无音频 | 没有进入当前公开专项验收 |
| Browser speechSynthesis | 是；仅 Web fallback | 无需凭据 | 浏览器 fallback 历史验收通过 | 取消/静音/fallback/idle 自动化通过 |
| SiliconFlow | **否；纠偏后已移除** | 无 | 否 | 旧目标错误 adapter/测试已移除 |

## 本次验证

| 验收项 | 结果 |
| --- | --- |
| Qwen3-TTS 官方协议 mapping | 通过 `npm run check:tts-provider-flow` fake contract |
| Fish Audio 原生协议 mapping | 通过同一 fake contract |
| Provider Settings / readiness / 前端白名单 | 通过 provider-config、regression |
| 密钥和集成边界 | 通过 security-boundaries、integration-boundaries |
| CosyVoice2 当前两轮 live | 通过：第 1 轮首 chunk/完整/ready `4653/4658/4658ms`，第 2 轮 `6018/6020/6020ms` |
| Qwen3-TTS live | **预检失败：missing_key**；现有 Qwen Key 是 placeholder，没有发出计费请求 |
| Fish Audio live | **失败：TTS_NOT_CONFIGURED**，没有发出计费请求 |
| CosyVoice vs 两个远程候选 live compare | **预检失败**：本次 Cosy base URL、Qwen、Fish 配置不完整；没有产生半边对照调用 |
| 远程真实中文 / 连续两轮 / 真实延迟 | **未完成** |

本次使用当前官方 FastAPI runtime、`iic/CosyVoice2-0.5B`、`中文女`、24kHz 和同一 live 检查文本重新采集两轮：第 1 轮生成 `174764 bytes` WAV，首 chunk/完整/Audio Result ready 为 `4653/4658/4658ms`；第 2 轮 `228524 bytes`，对应 `6018/6020/6020ms`。p50 为 `5336/5339/5339ms`。Qwen/Fish 没有有效 Key，因此仍没有同条件远程数据，差值必须留空，不能拿 fake timing 或旧 Provider 数据代替。

## 后续 live 验收

1. 在忽略的 `.env` 配置 Qwen3-TTS，运行 `npm run check:qwen3-tts-live`。
2. 配置 Fish Audio Key 与 voice model id，运行 `npm run check:fish-audio-live`。
3. 启动 CosyVoice2 后分别运行 `check:tts-compare-qwen3-live` 与 `check:tts-compare-fish-live`；每个 provider 连续两轮，记录首 chunk、完整生成、Audio Result ready p50。
4. Web Settings 分别验证正常两轮、播放前/播放中取消、静音抑制、故障 fallback、口型归零和最终 idle。
5. 试听中文自然度、Alice 角色匹配度，并记录真实账单/限流。

完成以上 live 前，`qwen3_tts` 与 `fish_audio` 只能标记为“代码已接入、待真实验收”。本阶段已按用户决定完成代码/架构交接，不再以缺少 remote live 阻止本次 changeset 收口，但后续任何发布可用性声明仍必须重新打开并完成这些验收项。

## 接入未来 TTS 的最小工作量

新增模型只需：

1. 新增一个 adapter，完成配置校验、上游 payload/response 映射和 capability。
2. 在 `serverConfig` / `.env.example` 增加后端配置并在 Registry 注册。
3. 通过 fake mapping、故障、安全与 live check；确认后才加入公开白名单/Settings。

无需修改 AudioManager、LipSync、Presentation、utterance session、分段器或 AppController。当前不建议继续接第三个远程候选；先完成 Qwen3/Fish 的真实闭环，再根据延迟、音质、地域、稳定性和成本决定是否保留两个或淘汰一个。
