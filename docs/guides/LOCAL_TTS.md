# 本地与可替换 TTS Provider

当前 Web Settings 只展示 `Mock` 和 `CosyVoice2`，用于本地开发阶段在“稳定演示”和“真实本地语音服务”之间切换测试。浏览器/系统内置声线仍作为播放失败后的最后兜底，但不再作为 Settings 中的可选 Provider。

## 当前策略

1. **Mock**：默认开发 provider，无外部服务时返回统一 Audio Result，适合 smoke、Web Settings 和 iOS contract 验证。
2. **CosyVoice2**：当前真实本地 TTS 主线，默认通过后端 `COSYVOICE_BASE_URL` 调用官方 FastAPI runtime。
3. **浏览器兜底**：仅在后端语音不可用时由 Web 端自动 fallback，保证文字对话和状态链路不被 TTS 阻断。
4. **其他 provider**：旧 adapter 可以保留在后端实验层，但当前 Web Settings 和 `GET /api/providers` 只暴露 Mock / CosyVoice2。

## 后端边界

后端结构：

```text
POST /api/tts
  -> TTSOrchestrator
  -> TTSProviderRegistry
  -> Mock / CosyVoice2 provider
  -> unified Audio Result
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
```

CosyVoice2 的 prompt、instruction、speaker、runtime endpoint 只在后端 adapter 内处理。Dialogue、Memory、Persona、Emotion、Web 和 iOS 都不依赖 provider 私有字段。

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

当前 Web Settings 只传 `provider=mock|cosyvoice` 和统一语义参数，不传模型路径、服务端口、API Key、内部请求参数或错误堆栈。旧二进制播放路径仍保留，但新客户端优先消费 `{ ok, data }` Audio Result。

Web 播放生命周期约束：

- 后端音频开始播放时，`TTSService` 只把本地 `HTMLAudioElement` 作为非敏感 `audioSource` 交给表现层，用于 VRM 振幅口型；该对象不会进入全局状态或 API。
- `audio:start` 后由真实媒体结束事件控制 speaking / lip-sync 生命周期，文本长度估算 timer 不再提前结束长音频。
- 新语音会使旧播放 session 失效；旧请求即使稍后返回，也不能发出陈旧 start/end 覆盖新语音状态。
- 取消中的媒体 Promise 会完成并清理引用；`audio:end` / `audio:error` 统一停止采样、归零口型并恢复 idle。

## 首音延迟优化

CosyVoice2 官方 FastAPI 会先生成完整 raw PCM，Alice 后端再包装为 WAV/Base64。旧链路必须等整段音频完成后 Web 才能播放，因此长回复的首音等待会随完整音频长度一起增长。

当前 Web 端对 `cosyvoice` 长文本启用低风险分段调度：

- `TTSService` 会把需要 CosyVoice2 生成的较长回复拆成多个自然语义段，首段会被控制为很短的快速响应段并优先请求。
- 40 字以内且没有早期自然停顿的短/中短回复默认不硬切。10 次 16 字实测显示机械切成 `5+5+5+1` 会让首音和段间空洞变差。
- 24 字以内且有早期自然停顿的短回复使用更小 follow-up 段和最多 2 路受控窗口，优先减少段间空洞；更长回复保持较大自然段，第二段立即预取，第三段默认延迟进入，之后保持最多 3 路受控窗口，避免本地 CosyVoice2 被无限并发拖慢。
- 整个回答仍是同一个 utterance session：中间段结束不会触发 `audio:end`、不会反复恢复 idle；只有最后一段结束、取消或错误后才统一清理 lip-sync 和 motion。
- 每段仍复用现有 `/api/tts`、统一 Audio Result、`HTMLAudioElement`、AudioManager 和 PresentationOrchestrator，不引入第二套播放器。
- Mock、极短回复和浏览器 fallback 不强制分段。

这不是客户端 PCM streaming，也不是 LLM streaming。它只是用已有完整 WAV/Base64 传输方式降低首音等待。后续若继续优化，可在保持同一契约的前提下评估 LLM streaming、服务端音频队列或 WebSocket/PCM streaming。

本机 CosyVoice2 + Alice `/api/tts` 探针实测：

| 样本 | 单段首音 | 分段首音 | 备注 |
| --- | ---: | ---: | --- |
| 16 字无自然停顿短回复 | p50 `2.52s`，p90 `3.22s` | 机械分段 p50 `3.20s`，p90 `4.81s` | 10 次实测后默认不再硬切这类短句。 |
| 15 字带自然停顿短回复 | 约 `3.6–4.4s` | 约 `2.0–2.6s` | 会切成约 `5+5+5`；一次真实浏览器播放首音约 `2.0s`，但仍观测到约 `1.1s` 段间空洞。 |
| 74 字中回复 | Node 探针最新约 `22.2s` | Node 探针最新约 `4.9s` | 首音不再等待完整音频；完整音频 ready 约 `19.0s`，播放完成约 `25.2s`，仍可能出现一次数秒级 underrun。 |
| 95 字长回复 | Node 探针最新约 `28.2s` | Node 探针最新约 `4.4s` | 完整音频 ready 约 `20.1s`，播放完成约 `25.5s`；段间空洞最大约 `2.1s`，仍需后续听感优化。 |

这些结果说明当前优化主要降低“文字出现到听到第一声”的等待，并让首音不再随完整回复长度同比增长；它不会显著降低 CosyVoice2 的整段生成成本，也不能完全消除本机生成波动导致的段间空洞。Mac 本机无 CUDA，官方 FastAPI 也没有暴露真正可消费的首块 PCM streaming，因此 1.5 秒目标在当前机器上不稳定。

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

可通过浏览器控制台查看最近一次播放指标：

```js
window.__aliceApp.audioManager.ttsService.getLastMetrics()
```

关键字段包括 `llmDoneToTTSRequestMs`、`ttsRequestToFirstAudioReadyMs`、`firstAudioReadyToPlayStartMs`、`textVisibleToFirstPlayMs`、`fullAudioReadyMs` 和每段的 provider timing。

## 验证

```bash
npm run check:tts-provider-flow
npm run check:tts-live
npm run check:cosyvoice-live
npm run cosyvoice:probe-web-tts
npm run smoke
```

`check:tts-provider-flow` 使用 fake endpoint 覆盖 provider selection、CosyVoice2 请求映射、缺配置、超时、统一 Audio Result 和 secret 不泄漏。真实 CosyVoice2 服务的视觉 / 听感验收需要在本地服务启动后单独执行。

`check:tts-live` 是可选真实服务检查：未设置 `COSYVOICE_BASE_URL` 时会跳过；设置后会直接调用后端 provider adapter，并只输出状态、格式和音频长度，不打印音频内容、服务地址密钥或请求正文。

`cosyvoice:probe-web-tts` 复用真实 Web `TTSService` 和本地 `/api/tts`，用 WAV 时长模拟 `HTMLAudioElement` 播放，输出 single / segmented 的首音、段间 gap、完整生成和 provider timing。它不等同于浏览器视觉验收，但可稳定复查分段调度是否退化。

## Web Settings 状态

- Mock：始终可用，用于无本地 TTS 服务的开发演示。
- CosyVoice2：后端配置 `COSYVOICE_BASE_URL` 且本地 FastAPI runtime 可达时显示可用。
- CosyVoice2 未启动：Settings 显示“本地语音服务未启动”，文字对话继续可用，TTS 播放走现有 fallback。
- 非开发模式：前端不允许切换 provider。
