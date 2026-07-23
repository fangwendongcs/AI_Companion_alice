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

当前 Web 端对 `cosyvoice` 启用低风险分段调度：

- 12 字以内很短回复保持单段，避免过度切碎。
- 13–24 字短回复允许首段优先：优先选择自然中文停顿；没有自然停顿时回退到约 `8–10` 字首段，避免 16–24 字回复必须等待整句音频完成。
- 25 字以上继续首段优先分段：优先取 `8–14` 字自然停顿；没有自然停顿时回退到语义 cue，例如 `想听`、`陪我`、`然后`，尽量避免把“声音”“心情”这类常见中文词切断。
- 初始预取采用 adaptive 策略：短两段默认 `first-ready`，首段 ready 前不预取第二段，优先保证首音；三段以上默认 `delay`，第二段立即进入 2 路受控预取，减少首段后的大空洞。
- 后续段根据当前段已知音频时长和 `playbackAwareLeadMs` 调度，最多保持 2 路窗口，避免本地 CosyVoice2 被无限并发拖慢。
- 当前默认不人为等待首段播放；如果首段非常短，可能保留一次可观测的 `segmentGapMs`，但中间段不会反复触发 idle。
- 首个 follow-up 的强停顿会被保留，避免中文短句被重新合并成过长第二段；同时分段器会避免产生孤立标点语音段。
- 整个回答仍是同一个 utterance session：中间段结束不会触发 `audio:end`、不会反复恢复 idle；只有最后一段结束、取消或错误后才统一清理 lip-sync 和 motion。
- 每段仍复用现有 `/api/tts`、统一 Audio Result、`HTMLAudioElement`、AudioManager 和 PresentationOrchestrator，不引入第二套播放器。
- Mock、极短回复和浏览器 fallback 不强制分段。

这不是客户端 PCM streaming，也不是 LLM streaming。它只是用已有完整 WAV/Base64 传输方式降低首音等待。后续若继续优化，可在保持同一契约的前提下评估 LLM streaming、服务端音频队列或 WebSocket/PCM streaming。

本机 CosyVoice2 + Alice `/api/tts` 探针实测：

| 样本 | 调整前 | 当前 adaptive 分段 | 备注 |
| --- | ---: | ---: | --- |
| 4 字短回复 | `1.29s` | `1.64s` | 保持单段；差异主要来自本机 runtime 波动。 |
| 8 字短回复 | `2.55s` | `2.70s` | 保持单段；首音主要由 CosyVoice2 首块生成决定。 |
| 16 字无自然停顿短回复 | `2.64s`，gap `1ms` | `9+7` 语义分段 `1.68s`，gap `1.76s` | 更快听到第一声，但第二段可能因 `first-ready` 保护首段而产生一次空洞。强制并发可把 gap 压到 `2ms`，但首音会退到 `3.15–3.76s`，因此未作为默认。 |
| 26 字中回复 | `3.60s`，最大 gap `1.79s` | `6+8+12` 语义分段 `3.27s`，最大 gap `1.13s` | 第二段立即受控预取；本机推理抖动仍可能留下约 1 秒空洞。 |
| 74 字中长回复 | `2.77s`，最大 gap `3.13s` | `7+13+9+10+14+9+12`，首音 `4.31s`，最大 gap `1.49s` | 首音本轮慢于旧样本，但段间大空洞明显下降；长回复仍不等完整音频。 |
| 95 字长回复 | `3.10s`，最大 gap `1.53s` | `7+13+9+10+14+9+12+13+8`，首音 `4.02s`，最大 gap `2.08s` | 首音不随完整回复长度同比增加；少数段仍会因本地生成追不上而 underrun。 |

这些结果说明当前优化主要降低“长回复必须等完整音频”的等待，并把中等回复的早期大空洞收敛到更可控范围；它不会显著降低 CosyVoice2 的单段生成成本，也不能完全消除本机生成波动导致的段间空洞。Mac 本机无 CUDA，官方 FastAPI 也没有暴露真正可消费的首块 PCM streaming，因此 1.5 秒目标在当前机器上不稳定。对 25–60 字中文回复，当前默认在“短首段”和“后续连续性”之间取中；如果强行把长回复全局切到 12 字级别，26 字样本 gap 可以降到 `2ms`，但 74 / 95 字会因为段数过多和推理抖动出现 `2.3s` 甚至 `18s` 级空洞，因此已回退为更稳的 18 字 follow-up 自然段。

2026-07-22 以前台长会话重启官方 FastAPI 后再次复测，`check:cosyvoice-live` 通过。连续压测证明：早期并发预取会和首段争抢本地推理资源；完全等首段 ready 又会让短两段的第二段跟不上播放。当前采用 adaptive 折中：短两段优先 `first-ready`，三段以上第二段立即受控预取，后续按播放时长窗口补齐。结论是：前端分段调度已经能避免“长回复等完整音频”，但不能用当前 FastAPI/WAV/Base64 链路稳定保证 300–500ms 内的所有段间衔接。

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

可通过浏览器控制台查看最近一次播放指标：

```js
window.__aliceApp.audioManager.ttsService.getLastMetrics()
```

关键字段包括 `llmDoneToTTSRequestMs`、`ttsRequestToFirstAudioReadyMs`、`firstAudioReadyToPlayStartMs`、`textVisibleToFirstPlayMs`、`fullAudioReadyMs`、`segmentGapMs`、`playbackAwarePrefetchDelayMs`、`shortInitialBufferWaitMs` 和每段的 provider timing。

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
