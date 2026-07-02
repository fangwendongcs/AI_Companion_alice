# 本地与可替换 TTS Provider

当前默认语音仍保留浏览器/系统内置声线，保证不配置 API Key 也能出声。后端已经新增统一 TTS Provider 架构，用于后续接入本地或私有部署的高质量中文角色声线。

## 当前策略

1. **浏览器兜底**：Web 端最终 fallback，保证本地演示不断声。
2. **后端默认 provider**：`TTS_PROVIDER=mock`，无外部服务时返回统一 Audio Result，适合 smoke / iOS contract 验证。
3. **CosyVoice2**：当前开源主线 provider，默认通过后端 `COSYVOICE_BASE_URL` 调用官方 FastAPI runtime。
4. **Higgs Audio v3**：实验 provider，通过后端 `HIGGS_BASE_URL` 调用兼容 `/v1/audio/speech` 的服务；没有本地 5B 部署时不阻塞主线。
5. **OpenAI / MiniMax**：保留旧兼容 provider，仍然只在后端读取 key。

## 后端边界

后端结构：

```text
POST /api/tts
  -> TTSOrchestrator
  -> TTSProviderRegistry
  -> Mock / CosyVoice / Higgs / OpenAI / MiniMax provider
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

CosyVoice / Higgs 的 prompt、instruction、inline control token 只在后端 adapter 内生成。Dialogue、Memory、Persona、Emotion、Web 和 iOS 都不依赖这些 provider 私有字段。

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

## Higgs Audio v3 配置

```bash
TTS_PROVIDER=higgs
HIGGS_BASE_URL=http://localhost:8000
HIGGS_SPEECH_PATH=/v1/audio/speech
HIGGS_MODEL=higgs-audio-v3
HIGGS_VOICE_ID=alice
HIGGS_API_KEY=replace_with_optional_key
```

Higgs provider 会把 Alice 的 `emotion / tone` 映射为 inline control tokens 和兼容 API 参数。当前不负责下载权重、部署 GPU 服务、Docker / vLLM-Omni 或流式 PCM 播放。

## 客户端调用

推荐 Web / iOS 请求统一 JSON：

```json
{
  "text": "你好，我是 Alice。",
  "provider": "cosyvoice",
  "voiceId": "alice",
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

旧二进制播放路径仍保留，但新客户端优先消费 `{ ok, data }` Audio Result。

## 验证

```bash
npm run check:tts-provider-flow
npm run check:tts-live
npm run check:cosyvoice-live
npm run smoke
```

`check:tts-provider-flow` 使用 fake endpoint 覆盖 provider selection、CosyVoice/Higgs 请求映射、缺配置、超时、统一 Audio Result 和 secret 不泄漏。真实 CosyVoice/Higgs 服务的视觉 / 听感验收需要在本地服务启动后单独执行。

`check:tts-live` 是可选真实服务检查：未设置 `COSYVOICE_BASE_URL` / `HIGGS_BASE_URL` 时会跳过；设置后会直接调用后端 provider adapter，并只输出状态、格式和音频长度，不打印音频内容、服务地址密钥或请求正文。
