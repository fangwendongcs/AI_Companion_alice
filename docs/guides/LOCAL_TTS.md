# 本地与可替换 TTS Provider

当前 Web Settings 按运行位置展示三类能力：`默认语音`（本地 CosyVoice2 与实验性 VoxCPM2）、`云端语音`（Qwen3-TTS / Fish Audio）和`自建语音服务`（通用 self-hosted adapter）。默认选择始终是本地 CosyVoice2；云端或自建服务必须先 Test、再 Save、最后 Switch。所有 provider 继续复用同一条 AudioManager / LipSync / Presentation 链路。浏览器/系统内置声线仍是最终兜底，不是第二套 Provider 链路。

## 当前策略

1. **CosyVoice2 / local**：当前默认 TTS，使用 Alice 所在机器的官方 FastAPI runtime，不需要厂商云 Key。Registry 只允许可选择的 `local` descriptor 成为产品默认；把 `TTS_PROVIDER` 误设为 remote 或隐藏 Mock 时会收敛回 CosyVoice2。
2. **VoxCPM2 / local experimental**：第二个本机候选，不需要 Key；adapter、descriptor、运行脚本与自动化已接入，但本轮没有安装依赖/模型或完成 live。它失败时先回退默认 CosyVoice2。
3. **Qwen3-TTS、Fish Audio / remote**：两个既有目标云 adapter；URL、Key、model、voice 可由后端环境变量或受保护的 Settings 配置流程提供。
4. **Self-hosted / selfHosted**：面向未来自建 GPU TTS 的通用 OpenAI-compatible adapter；配置 server URL、model、voice，可选 API Key，不绑定 Qwen、Fish 或某个开源模型。
5. **Mock**：保留为隐藏的测试 provider，只用于 smoke / contract，不再是产品默认项，也不出现在 Settings 选择器中。
6. **两级 fallback**：任何非默认 Provider（含 VoxCPM2、remote、selfHosted）失败时，后端先尝试默认本地 CosyVoice2；CosyVoice2 也不可用时，Web 再走既有浏览器语音 fallback。
7. **其他 provider**：Higgs / OpenAI / MiniMax 历史 adapter 仍保留在后端实验层，但不进入 Settings 选择面和正式验收范围。

2026-08-10 复核发现上一版把公开远程目标误写并实现为 SiliconFlow，且其默认模型实际是 CosyVoice2，并非 Qwen3-TTS。当前已纠正为 Qwen3-TTS 官方 DashScope adapter 与 Fish Audio 原生 adapter；通用 Remote TTS、统一 Audio Result、capability/metadata、单段 utterance session/cancel 补强均保留。没有修改现有分段、AudioManager、LipSync 或 Presentation 链路。代码级映射、故障 fallback、安全边界和静态回归已通过。当前机器的 `QWEN_API_KEY` 只是 `replace_with_*` placeholder，Qwen3 live 预检正确拒绝为 `missing_key`；Fish 也没有有效凭据/配置。因此两者真实中文音频、连续两轮和远程延迟对比仍未完成，不得把“adapter 已接入”写成“remote live 已通过”。详见 `docs/reports/REMOTE_TTS_PROVIDER_AUDIT_20260810.md`。

名称必须按“运行位置/服务商”理解，而不能只看模型名：当前 `qwen3_tts` 是 **DashScope 托管 API**，当前 `fish_audio` 是 **Fish Audio 云 API**，所以需要各自的云 Key。Qwen3-TTS 开源模型或 Fish Speech 本地 API server 则走 `self_hosted`，本地推理本身不需要厂商云 Key，但自建服务可选择自己的鉴权 Key。云端与自建服务不会共享 readiness、成本或验收状态。Open-LLM-VTuber 当前也是让本地 `cosyvoice2_tts` 与云端 `fish_api_tts` 并列注册，其当前主分支没有 Qwen3-TTS adapter。

## 后端边界

后端结构：

```text
POST /api/tts
  -> TTSOrchestrator
  -> TTSProviderRegistry
  -> CosyVoice2 Local / VoxCPM2 Local / Qwen3-TTS Remote / Fish Audio Remote / Self-hosted TTS
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

## Provider descriptor 与配置闭环

Registry 为 Settings 和 readiness 提供统一 descriptor：

```text
id / displayName / type
requiredFields / optionalFields
capabilities / models / voices
```

其中 `type` 只能是 `local`、`remote` 或 `selfHosted`。运行结果 metadata 继续包含 `provider / model / voice / supportsStreaming / supportsVoiceClone / supportsEmotion / sampleRate / latency`。新增 provider 的主要工作是提供一个 adapter 和一个 descriptor，不需要修改 AppController、AudioManager、LipSync 或 Presentation。

远程与自建配置遵循同一流程：

1. 用户在 Debug Settings 选择 provider 并填写字段；此时不会改变当前 provider。
2. `POST /api/tts/providers/:id/test` 使用未保存配置调用目标 adapter，且禁止本地 fallback，避免“本地有声音”被误判为远程测试成功。
3. Test 返回统一 Audio Result，并由现有 `TTSService` 播放；成功后才允许 Save。
4. `PUT /api/tts/providers/:id/config` 将配置加密保存在后端 runtime 目录，刷新 Registry 后切换 provider。
5. `GET /api/tts/providers/:id/config` 只返回非敏感字段和 `apiKeyConfigured` 状态，从不回传 Key 明文。

Test 完成后，Settings 还会核对 provider 与配置 fingerprint；测试过程中或测试后字段发生变化，就必须重新 Test，不能把旧测试结果用于保存新配置。页面刷新时先保留已保存 provider id，等 descriptor 就绪后再恢复对应选择，不会被初始化占位项覆盖。

运行时配置文件使用 AES-256-GCM 加密，配置文件和自动生成的本机 key 文件权限为 `0600`，且都位于 Git ignore 的 `runtime/tts/provider-config/`。生产部署应通过 `TTS_CONFIG_ENCRYPTION_KEY` 注入独立加密密钥，并为这些配置 API 建立正式管理员访问控制；不要把自动生成的本机 key 文件当作生产 Secret Manager。

如果加密配置损坏或密钥不匹配，remote 配置链路会报告 `TTS_CONFIG_STORE_INVALID`，但 Registry 仍可注册默认 CosyVoice2，避免凭据存储故障拖垮 Local fallback。浏览器系统 voice 列表尚未加载且没有触发 `voiceschanged` 时，Web 会短暂等待后直接使用系统默认声线，避免最终本地 fallback Promise 悬挂。

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
- 默认 CosyVoice2 不可用时，`/api/tts` 返回 `tts_status=unavailable/failed`，Web 端继续 fallback 到浏览器语音；VoxCPM2、remote 或 selfHosted 失败时则先由后端尝试默认 CosyVoice2。

详见 [COSYVOICE_RUNTIME.md](./COSYVOICE_RUNTIME.md)。

## VoxCPM2 本地配置

VoxCPM2 本地进程使用 Alice 提供的薄 HTTP boundary：

```bash
VOXCPM2_BASE_URL=http://127.0.0.1:55000
VOXCPM2_SPEECH_PATH=/v1/audio/speech
VOXCPM2_MODEL=openbmb/VoxCPM2
VOXCPM2_VOICE_ID=default
VOXCPM2_OUTPUT_FORMAT=wav
VOXCPM2_SAMPLE_RATE=48000
VOXCPM2_DEVICE=auto
```

它是开源本地模型，不需要云 Key。官方 runtime 支持 `device=auto` / MPS；Alice 当前仍读取完整 48 kHz WAV，不重写播放器。代码与 fake HTTP contract 已通过，但本轮按用户决定没有执行依赖/模型下载、MPS live、真实中文或本地对照。运行和后续验收见 [VOXCPM2_RUNTIME.md](./VOXCPM2_RUNTIME.md)，收口事实见 [LOCAL_TTS_VOXCPM2_CLOSURE_20260811.md](../reports/LOCAL_TTS_VOXCPM2_CLOSURE_20260811.md)。

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
- 普通 `/api/tts` 请求只发送 `provider=qwen3_tts` 和 Alice 的统一语义，不能按单次合成覆盖 model、voice、URL 或 Key；受保护的 Settings Test/Save 配置接口是唯一例外，Key 只短暂经过请求并由后端处理。
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

## 自建语音服务配置

自建 provider 适用于已经部署成 OpenAI-compatible `POST /v1/audio/speech` 的本地或 GPU 服务：

```bash
SELF_HOSTED_TTS_BASE_URL=http://127.0.0.1:8000
SELF_HOSTED_TTS_PATH=/v1/audio/speech
SELF_HOSTED_TTS_MODEL=replace_with_model
SELF_HOSTED_TTS_VOICE=replace_with_voice
SELF_HOSTED_TTS_API_KEY=replace_with_optional_private_key
SELF_HOSTED_TTS_OUTPUT_FORMAT=wav
SELF_HOSTED_TTS_SAMPLE_RATE=24000
```

也可在 Debug Settings 中填写同等字段并执行 Test → Save → Switch。Alice 不负责启动或下载该模型服务；若目标服务不是 OpenAI-compatible，只新增对应 adapter，仍复用 descriptor、配置存储、Audio Result 和现有播放链路。

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

普通合成时，Web 只传选中的 `provider` 和统一语义参数，不传模型路径、服务端口、API Key、内部请求参数或错误堆栈。只有受保护的 Test/Save 配置请求可以提交配置字段；Key 不进入 LocalConfigStore / localStorage，保存后后端也不会返回明文。旧二进制播放路径仍保留，但新客户端优先消费 `{ ok, data }` Audio Result。

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

`check:tts-provider-flow` 使用 fake endpoint 覆盖 provider selection、CosyVoice2 / VoxCPM2 / Qwen3-TTS / Fish Audio / self-hosted 请求映射、后端 model/voice 优先级、缺配置、非默认 Provider → CosyVoice2 fallback、上游故障、超时、统一 Audio Result、descriptor、capability/latency/runtime metadata 和 secret 不泄漏。`check:provider-config` 另外覆盖临时 Test、加密 Save/Reload、secret 不回传及配置后 Registry 刷新。fake endpoint 只证明 adapter contract，不证明本地模型或第三方服务真实可调用。

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

- 默认语音：始终是 `cosyvoice`。本地 runtime ready 时播放 CosyVoice2；未启动时明确显示“系统语音兜底”，文字对话继续可用。
- 本地实验语音：`voxcpm2` 可直接从同一 Settings 选择并切换；当前未完成 runtime 安装/live，因此选择后应预期先回退 CosyVoice2，不能视为已可用产品声线。
- 云端语音：Qwen3-TTS / Fish Audio 按 descriptor 展示字段。选择本身不会切换；Test 真正调用目标 adapter 成功后才允许 Save 并切换。
- 自建语音服务：填写 server URL / model / voice，可选 Key；同样必须 Test → Save → Switch。
- API Key 输入为 password，不进入 LocalConfigStore / localStorage；刷新页面后只显示后端返回的“已配置”状态，不回填明文。
- Mock：仍可由自动化和显式 API 使用，但不进入产品选择器。
- 非开发模式：当前 Settings 配置界面不展示；生产部署还必须在后端启用 API auth，并补正式管理员访问控制。

2026-08-11 新增 VoxCPM2 本地候选后，本轮仍只完成架构、配置、运行脚本和非 live 闭环；没有执行 VoxCPM2 安装/真实生成、CosyVoice2 vs VoxCPM2 对照，也没有改变 Qwen3-TTS / Fish Audio / self-hosted 的待验收状态。完整三类模型收口见 [TTS_PROVIDER_MODEL_CLOSURE_20260810.md](../reports/TTS_PROVIDER_MODEL_CLOSURE_20260810.md)，VoxCPM2 增量见 [LOCAL_TTS_VOXCPM2_CLOSURE_20260811.md](../reports/LOCAL_TTS_VOXCPM2_CLOSURE_20260811.md)。
