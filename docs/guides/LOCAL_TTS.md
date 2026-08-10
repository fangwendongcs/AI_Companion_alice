# 本地与可替换 TTS Provider

当前 Web Settings 展示 `Mock`、本地 `CosyVoice2`、官方 DashScope 托管的 `Qwen3-TTS` 和 `Fish Audio`，用于在同一条 AudioManager / LipSync / Presentation 链路上切换“稳定演示”“真实本地语音”和“第三方云语音”。浏览器/系统内置声线仍作为播放失败后的最后兜底，但不再作为 Settings 中的可选 Provider。

## 当前策略

1. **Mock**：默认开发 provider，无外部服务时返回统一 Audio Result，适合 smoke、Web Settings 和 iOS contract 验证。
2. **CosyVoice2**：当前真实本地 TTS 主线，默认通过后端 `COSYVOICE_BASE_URL` 调用官方 FastAPI runtime。
3. **Qwen3-TTS**：通过阿里云 Model Studio / DashScope 官方原生 HTTP API 调用 `qwen3-tts-*` 模型；非流式结果的临时签名 URL 由后端下载并转换为统一 Audio Result，不下发到 Web。
4. **Fish Audio**：通过 Fish Audio 原生 `POST /v1/tts` 调用；`model` header 和 `reference_id` voice 都只在 adapter 内生成。
5. **浏览器兜底**：仅在后端语音不可用时由 Web 端自动 fallback，保证文字对话和状态链路不被 TTS 阻断。
6. **其他 provider**：Higgs / OpenAI / MiniMax 历史 adapter 保留在后端实验层，但 Web Settings 和 `GET /api/providers` 不公开它们。

2026-08-10 复核发现上一版把公开远程目标误写并实现为 SiliconFlow，且其默认模型实际是 CosyVoice2，并非 Qwen3-TTS。当前已纠正为 Qwen3-TTS 官方 DashScope adapter 与 Fish Audio 原生 adapter；通用 Remote TTS、统一 Audio Result、capability/metadata、单段 utterance session/cancel 补强均保留。没有修改现有分段、AudioManager、LipSync 或 Presentation 链路。代码级映射、故障 fallback、安全边界和静态回归已通过。当前机器的 `QWEN_API_KEY` 只是 `replace_with_*` placeholder，Qwen3 live 预检正确拒绝为 `missing_key`；Fish 也没有有效凭据/配置。因此两者真实中文音频、连续两轮和远程延迟对比仍未完成，不得把“adapter 已接入”写成“remote live 已通过”。详见 `docs/reports/REMOTE_TTS_PROVIDER_AUDIT_20260810.md`。

名称必须按“运行位置/服务商”理解，而不能只看模型名：当前 `qwen3_tts` 是 **DashScope 托管 API**，当前 `fish_audio` 是 **Fish Audio 云 API**，所以需要各自的云 Key。Qwen3-TTS 官方开源模型或 Fish Speech 本地 API server 是另外的 self-hosted 路线，本地推理不需要厂商云 Key；若以后接入，应使用独立 provider identity 和本地 URL/模型配置，不能把本地与云端的 readiness、成本和延迟混在同一个 provider 状态中。Open-LLM-VTuber 当前也是让本地 `cosyvoice2_tts` 与云端 `fish_api_tts` 并列注册，其当前主分支没有 Qwen3-TTS adapter。

## 后端边界

后端结构：

```text
POST /api/tts
  -> TTSOrchestrator
  -> TTSProviderRegistry
  -> Mock / CosyVoice2 Local / Qwen3-TTS Remote / Fish Audio Remote / future self-hosted adapter
  -> unified Audio Result
  -> existing TTSService / AudioManager / LipSync / Presentation
```

统一输入语义：

```text
text
voiceId
locale
emotion
tone
prosody
stream
```

统一输出：

```text
tts_status
provider
format
audioUrl 或 audioBase64
durationMs
sampleRate
streaming
upstreamStreaming
metadata.provider
metadata.model
metadata.voice
metadata.supportsStreaming
metadata.supportsVoiceClone
metadata.supportsEmotion
metadata.sampleRate
metadata.latency
```

Provider 的 prompt、instruction、speaker/voice、runtime endpoint 和鉴权只在后端 adapter 内处理。Dialogue、Memory、Persona、Emotion、Web 和 iOS 都不依赖 provider 私有字段。`supportsStreaming=true` 记录的是 provider 能力；本轮 Web 仍接收完整 Audio Result，`streaming=false`，不会因此建立第二套播放器。

## CosyVoice2 配置

```bash
TTS_PROVIDER=cosyvoice
COSYVOICE_BASE_URL=http://localhost:50000
COSYVOICE_API_STYLE=official_fastapi
COSYVOICE_API_MODE=sft
COSYVOICE_SPEECH_PATH=
COSYVOICE_MODEL=iic/CosyVoice2-0.5B
COSYVOICE_VOICE_ID=中文女
COSYVOICE_SAMPLE_RATE=24000
COSYVOICE_API_KEY=replace_with_optional_key
```

要求：

- 官方 FastAPI runtime 使用 `/inference_sft`、`/inference_zero_shot`、`/inference_cross_lingual`、`/inference_instruct`、`/inference_instruct2`。
- Alice 默认使用 `COSYVOICE_API_MODE=sft`，请求字段为 `tts_text` 和 `spk_id`。
- 官方 runtime 返回 raw int16 PCM，Alice provider 会包装成 WAV `audioBase64`。
- Alice 后端完整接收 raw PCM 后再返回 WAV/Base64，因此客户端 Audio Result 的 `streaming=false`；如需记录上游 HTTP 流式来源，使用 `upstreamStreaming=true`。
- `/v1/audio/speech` 仅适用于你自己额外部署的 OpenAI-compatible proxy，不是官方默认契约。
- 服务不可用时，`/api/tts` 返回 `tts_status=unavailable/failed`，Web 端继续 fallback 到浏览器语音。

详见 [COSYVOICE_RUNTIME.md](./COSYVOICE_RUNTIME.md)。

## Qwen3-TTS 远程配置

把真实值只写入本地忽略的 `.env` 或部署平台 Secret Manager：

```bash
QWEN3_TTS_API_KEY=replace_with_your_key
QWEN3_TTS_BASE_URL=https://dashscope-intl.aliyuncs.com/api/v1
QWEN3_TTS_PATH=/services/aigc/multimodal-generation/generation
QWEN3_TTS_MODEL=qwen3-tts-flash
QWEN3_TTS_VOICE=Cherry
QWEN3_TTS_LANGUAGE_TYPE=Chinese
QWEN3_TTS_OUTPUT_FORMAT=wav
QWEN3_TTS_SAMPLE_RATE=24000
```

说明：

- `QWEN3_TTS_API_KEY` 优先；也接受后端已有的 `DASHSCOPE_API_KEY` 或 `QWEN_API_KEY`，前提是它确实是与该 endpoint 同 region 的 Model Studio Key。国际与北京 region 的 Key/endpoint 必须匹配，具体 base URL 由部署环境配置。
- 前端只发送 `provider=qwen3_tts` 和 Alice 的统一语义，不能覆盖 model、voice、URL 或 Key。
- `qwen3-tts-flash` 非流式接口返回 24 小时有效的签名音频 URL；adapter 校验其为 `aliyuncs.com` 资源并在后端下载为 Base64，临时 URL 不进入前端或日志。
- `supportsEmotion` 仅对 `qwen3-tts-instruct-*` 为真；`supportsVoiceClone` 仅对 `qwen3-tts-vc-*` 为真。streaming capability 先记录，本轮播放器仍消费完整 Audio Result。
- 官方文档：[Qwen3-TTS 非实时语音](https://www.alibabacloud.com/help/en/model-studio/non-realtime-tts-user-guide)、[Qwen-TTS API](https://www.alibabacloud.com/help/en/model-studio/qwen-tts-api)。

## Fish Audio 远程配置

```bash
FISH_AUDIO_API_KEY=replace_with_your_key
FISH_AUDIO_TTS_BASE_URL=https://api.fish.audio
FISH_AUDIO_TTS_PATH=/v1/tts
FISH_AUDIO_TTS_MODEL=s2.1-pro-free
FISH_AUDIO_TTS_VOICE=replace_with_voice_model_id
FISH_AUDIO_TTS_OUTPUT_FORMAT=mp3
FISH_AUDIO_TTS_SAMPLE_RATE=44100
FISH_AUDIO_TTS_LATENCY=balanced
```

说明：

- Fish Audio 官方接口不是 OpenAI-compatible；adapter 使用原生 `model` header 和 JSON `reference_id`。
- `FISH_AUDIO_TTS_VOICE` 是 Fish Audio voice model id。当前 JSON 路径不接收前端上传 reference 音频，也不会把 clone 逻辑散落到 AppController。
- Fish 支持 HTTP/WebSocket streaming、voice clone 和 `low / balanced / normal` 延迟档位；本轮只记录 capability 并读取完整音频，不新增播放器。
- 官方文档：[Fish Audio Text to Speech](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)。

## 客户端调用

推荐 Web / iOS 请求统一 JSON：

```json
{
  "text": "你好，我是 Alice。",
  "provider": "cosyvoice",
  "locale": "zh-CN",
  "emotion": "warm",
  "tone": "gentle",
  "prosody": {
    "rate": 1.05,
    "pitch": 1.1,
    "volume": 1
  },
  "stream": false,
  "responseFormat": "json"
}
```

当前 Web Settings 只传 `provider=mock|cosyvoice|qwen3_tts|fish_audio` 和统一语义参数，不传模型路径、服务端口、API Key、内部请求参数或错误堆栈。旧二进制播放路径仍保留，但新客户端优先消费 `{ ok, data }` Audio Result。

Web 播放生命周期约束：

- 后端音频开始播放时，`TTSService` 只把本地 `HTMLAudioElement` 作为非敏感 `audioSource` 交给表现层，用于 VRM 振幅口型；该对象不会进入全局状态或 API。
- `audio:start` 后由真实媒体结束事件控制 speaking / lip-sync 生命周期，文本长度估算 timer 不再提前结束长音频。
- 新语音会使旧播放 session 失效；旧请求即使稍后返回，也不能发出陈旧 start/end 覆盖新语音状态。
- 取消中的媒体 Promise 会完成并清理引用；`audio:end` / `audio:error` 统一停止采样、归零口型并恢复 idle。

## 首音延迟优化

CosyVoice2 官方 FastAPI 会先生成完整 raw PCM，Alice 后端再包装为 WAV/Base64。旧链路必须等整段音频完成后 Web 才能播放，因此长回复的首音等待会随完整音频长度一起增长。

当前 Web 端对 `cosyvoice` 启用连续性优先的分段调度：

- `24` 字以内保持单段，避免为了更早首音人为制造短回复断点。
- `25–84` 字进入 `balanced` 档：首段上限约 `16–18` 字，后续段目标约 `22` 字，减少过多短段耗尽缓冲。
- `85` 字以上进入 `extended` 档：首段上限约 `18–20` 字，后续段目标约 `24` 字。
- 所有默认分段回复都立即预取第二段；显式 `first-ready` 仍保留为兼容选项，但不再是默认。并发窗口保持 `2`，因为 3 路实测会加重本机 CPU 争抢。
- `25` 字以上在首段 ready 后等待第二段 ready 或最多 `5000ms` 再开始播放。这个等待是可提前结束的 promise gate，不是固定睡眠，用首音延迟换取足够的早期音频缓冲。
- 后续段根据当前段已知音频时长和 `playbackAwareLeadMs` 调度，继续保持最多 2 路窗口。
- 分段器优先保留自然停顿并避免切断常见中文词，也不会产生孤立标点语音段。
- 整个回答仍是同一个 utterance session：中间段结束不会触发 `audio:end`、不会反复恢复 idle；只有最后一段结束、取消或错误后才统一清理 lip-sync 和 motion。
- 每段仍复用现有 `/api/tts`、统一 Audio Result、`HTMLAudioElement`、AudioManager 和 PresentationOrchestrator，不引入第二套播放器。
- Mock、极短回复和浏览器 fallback 不强制分段。

这不是客户端 PCM streaming，也不是 LLM streaming。它使用已有完整 WAV/Base64 传输方式，在不改变 `/api/tts` 的前提下优先收口播放连续性。

本机 CosyVoice2 + Alice `/api/tts` 探针实测：

| 样本 | 当前策略 | 真实结果 | 备注 |
| --- | ---: | ---: | --- |
| 16 字短回复 | 单段 | Node 两次最大 gap `0ms`；浏览器首段 ready `2694ms`、gap `0ms` | 不再拆成 `9+7`。 |
| 26 字中回复 | `6+20` | Node 三次首次播放 p50 `6903ms`、最大 gap `3ms` | 进入 balanced 档并等待第二段建立缓冲。 |
| 54 字中回复 | `14+24+16` | Node 三次最大 gap `5ms`；浏览器最大 gap `24ms` | Node 首次播放 p50 `12497ms`。 |
| 95 字长回复 | `20+19+14+21+21` | Node 三次最大 gap `4ms`；浏览器最大 gap `236ms` | 浏览器总播放链路 `31415ms`。 |

相对 2026-07-24 正式 Demo 的最大 gap `6271ms`，真实浏览器长回复最大 gap 已下降约 `96.2%`，达到当前“不超过 `1s` 且至少下降 `80%`”的门槛。代价是中长回复首音变慢：54 字 Node p50 首次播放约 `12.5s`。完整对比、PCM 流式结论和剩余风险见 `docs/reports/P5_CONTINUOUS_TTS_DECISION_20260728.md`。

2026-07-22 的 adaptive / `first-ready` 结果保留为历史基线：它能缩短首音，但 16 字和中长回复仍出现 `1–2s` 甚至更大的空洞。2026-07-28 已改为连续性优先策略。

2026-07-31 又对“延后第二段、预测第二段 ready、限制 CPU 线程”做了真实回归。最快方案虽可将 54 字首音 p50 提前到约 `6.5s`，但同时带回 `5.367s` 最大 gap；线程限制又在 95 字上出现 `16.871–25.119s` 首音长尾。因此正式 Demo 不采用这些不稳定调参，继续保留 P5 策略。

短回复专项结论：

- 官方 FastAPI endpoint 使用 `StreamingResponse`，但 `/inference_sft` 没有接收或传递 `stream=True` 到模型层；`stream=true` form 字段不会改变当前 HTTP contract。
- 本轮当前 runtime 复测中，FastAPI 4 字 p50 约 `1.43–1.49s`，8 字 p50 约 `3.25–3.37s`，16 字 p50 约 `1.96–2.57s`，30 字 p50 约 `9.83–10.05s`，且 `runtimeRequestToFirstPcmMs` 基本等于 `runtimeRequestToAllPcmMs`。
- Direct Python `stream=True` 对 30 字能产生提前 chunk，但 4–16 字通常仍是一块或首块时间接近完整完成时间。也就是说，短回复首音主要受模型首块生成速度限制，不是浏览器播放或 WAV/Base64 包装阻塞。
- `cosyvoice:start` 现在默认等待 endpoint ready，并通过一次 `你好。` 短合成完成预热；这能消除“服务进程已启动但首个用户请求承担冷启动”的体验问题，但不能突破当前模型在 8–20 字上的本机推理上限。

2026-07-15 真实浏览器验收补充：

- 16 字无自然停顿短回复：单段播放，`textVisibleToFirstPlayMs=1966ms`，`firstAudioReadyToPlayStartMs=3ms`，结束后 `ONLINE / IDLE`。
- 53 字真实浏览器中回复：分 5 段，`textVisibleToFirstPlayMs=5276ms`，`fullAudioReadyMs=12747ms`，播放完成约 `17.6s`，`underrunCount=1`，`maxEstimatedGapMs=557ms`，结束后回 idle。
- 74 / 95 字由 `cosyvoice:probe-web-tts` 复用真实 `TTSService` 与 `/api/tts` 稳定复查：分段首音约 `4.9s / 4.4s`，完整音频 ready 约 `19.0s / 20.1s`。
- 连续快速两次：第一条在 `700ms` 左右被取消，仅第二条进入 `audio:start`，最终回 idle。
- 播放中取消：`1.2s` 取消后没有旧 `audio:start`，只发出 cancelled `audio:end`，最终回 idle。
- 静音：不会发起 `audio:request`。
- CosyVoice runtime 停止：`6ms` 内触发 `audio:fallback`，走浏览器 fallback，文字链路不阻塞，最终回 idle。

2026-07-22 浏览器补充：

- DeepSeek 对话产生 12 字 CosyVoice2 单段回复，`llmDoneToTTSRequestMs=0ms`，`textVisibleToFirstPlayMs=4765ms`，其中 `ttsRequestToFirstAudioReadyMs=4761ms`，`firstAudioReadyToPlayStartMs=4ms`；说明本轮实际听到声音的等待主要在 CosyVoice2 生成。
- 直接通过现有 `AudioManager.speak()` 验证 26 字分段：`6+8+12`，首音 `3482ms`，完整音频 ready `7840ms`，最大 `segmentGapMs=1085ms`，结束后页面回 `ONLINE / IDLE`。
- 74 字分段在首段 ready 前取消：`AudioManager.stop()` 返回 `true`，页面回 `ONLINE / IDLE`，未出现旧音频串音。
- 本轮没有重新完整覆盖 60–120 秒长音频听感和口型视觉；Playwright console 仍有既有 favicon 404 和 VRM LookAt warning，不属于本轮 TTS 分段改动。

2026-07-28 P5 连续播放验收：

- 官方 FastAPI 的 `stream=true` form 对 4 / 8 / 16 / 26 字三次重复均没有 true streaming evidence；HTTP transport chunk 不能当成模型级 PCM chunk。
- Direct Python `stream=True` 对 26 字能提前到 p50 `2503ms` 首块，但完成 p50 `10050ms`，模拟连续播放最大 gap p50 `2662ms`；`500ms` 缓冲后仍有 `2162ms`。
- `3000ms` 首段连续性等待在三次 54 字重复中仍出现一次 `1674ms` gap，因此最终采用 `5000ms` 有界等待。
- Node 真实 `/api/tts` 探针：16 字两次最大 gap `0ms`；26 / 54 / 95 字各三次最大 gap `3 / 5 / 4ms`，均无 underrun。
- 真实浏览器：16 / 54 / 95 字最大 gap 分别为 `0 / 24 / 236ms`；所有分段开始时 `isSpeaking=true`、lip-sync 为 `audio-driven`，最后统一恢复 `idle`，无 fallback/error。

可通过浏览器控制台查看最近一次播放指标：

```js
window.__aliceApp.audioManager.ttsService.getLastMetrics()
```

关键字段包括 `llmDoneToTTSRequestMs`、`ttsRequestToFirstAudioReadyMs`、`firstAudioReadyToPlayStartMs`、`textVisibleToFirstPlayMs`、`fullAudioReadyMs`、`segmentGapMs`、`segmentContinuityProfile`、`segmentInitialNextSegmentWaitMs`、`initialContinuityBufferWaitMs`、`playbackAwarePrefetchDelayMs` 和每段的 provider timing。

## 验证

```bash
npm run check:tts-provider-flow
npm run check:tts-live
npm run check:cosyvoice-live
npm run check:qwen3-tts-live
npm run check:fish-audio-live
npm run check:tts-compare-live
npm run cosyvoice:probe-web-tts
npm run smoke
```

`check:tts-provider-flow` 使用 fake endpoint 覆盖 provider selection、CosyVoice2 / Qwen3-TTS / Fish Audio 原生请求映射、后端 model/voice 优先级、缺配置、上游故障、超时、统一 Audio Result、capability/latency metadata 和 secret 不泄漏。fake endpoint 只证明 adapter contract，不证明第三方服务真实可调用。

`check:tts-live` 是可选真实服务检查；`check:cosyvoice-live`、`check:qwen3-tts-live` 和 `check:fish-audio-live` 分别固定 provider。它们直接调用后端 adapter，按 WAV / MP3 / OGG / PCM 做最小音频签名与长度验证，只输出 provider、model、voice、格式、采样率、音频长度以及首 chunk / 完整生成 / Audio Result ready 耗时，不打印音频内容、服务地址、密钥或请求正文。

2026-08-10 当前环境重新采集的 CosyVoice2 两轮短中文基线均通过有效 WAV 检查：第 1 轮首 chunk/完整/Audio Result ready `4653/4658/4658ms`，第 2 轮 `6018/6020/6020ms`，p50 `5336/5339/5339ms`。Qwen3/Fish 因没有有效 Key 尚无同条件远程数据，不得计算或填写远程差值。

`check:tts-compare-live` 会先严格检查 CosyVoice2、Qwen3-TTS 和 Fish Audio 配置，然后以同一中文文本交替执行三个 provider、每个两轮。也可使用 `check:tts-compare-qwen3-live` 或 `check:tts-compare-fish-live` 做单个远程候选与本地对照。成功后汇总各自首 chunk、完整生成、Audio Result ready 的 p50，以及每个 remote 与 local 的差值。需要保留机器可读证据时使用：

```bash
COSYVOICE_BASE_URL=http://127.0.0.1:50000 \
TTS_LIVE_JSON_OUT=runtime/tts/live-comparison.json \
npm run check:tts-compare-live
```

报告 schema 为 `alice.tts-live-comparison.v2`，只包含 provider/model/voice/capability、文本长度、音频字节、非敏感 latency 和错误码，不保存 Key、URL、请求正文或音频 Base64。任一 provider 未配置时严格失败且不会先产生另一端的无效对照调用。

`cosyvoice:probe-web-tts` 复用真实 Web `TTSService` 和本地 `/api/tts`，用 WAV 时长模拟 `HTMLAudioElement` 播放，输出 single / segmented 的首音、段间 gap、完整生成和 provider timing。它不等同于浏览器视觉验收，但可稳定复查分段调度是否退化。

## Web Settings 状态

- Mock：始终可用，用于无本地 TTS 服务的开发演示。
- CosyVoice2：后端配置 `COSYVOICE_BASE_URL` 且本地 FastAPI runtime 可达时显示可用。
- CosyVoice2 未启动：Settings 显示“本地语音服务未启动”，文字对话继续可用，TTS 播放走现有 fallback。
- Qwen3-TTS / Fish Audio：配置完整时显示 model / voice / capability；Settings 不展示 Key 或 URL。未配置或真实调用失败时仍走现有浏览器 fallback。
- 非开发模式：前端不允许切换 provider。
