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

## 验证

```bash
npm run check:tts-provider-flow
npm run check:tts-live
npm run check:cosyvoice-live
npm run smoke
```

`check:tts-provider-flow` 使用 fake endpoint 覆盖 provider selection、CosyVoice2 请求映射、缺配置、超时、统一 Audio Result 和 secret 不泄漏。真实 CosyVoice2 服务的视觉 / 听感验收需要在本地服务启动后单独执行。

`check:tts-live` 是可选真实服务检查：未设置 `COSYVOICE_BASE_URL` 时会跳过；设置后会直接调用后端 provider adapter，并只输出状态、格式和音频长度，不打印音频内容、服务地址密钥或请求正文。

## Web Settings 状态

- Mock：始终可用，用于无本地 TTS 服务的开发演示。
- CosyVoice2：后端配置 `COSYVOICE_BASE_URL` 且本地 FastAPI runtime 可达时显示可用。
- CosyVoice2 未启动：Settings 显示“本地语音服务未启动”，文字对话继续可用，TTS 播放走现有 fallback。
- 非开发模式：前端不允许切换 provider。
