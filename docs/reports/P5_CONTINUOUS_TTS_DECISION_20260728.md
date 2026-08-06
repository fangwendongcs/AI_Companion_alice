# P5 CosyVoice2 连续播放决策与验收

日期：2026-07-28

## 结论

本轮选择继续使用现有 `/api/tts` 完整 WAV/Base64 Audio Result，在 Web 端采用“长度分档 + 两路即时预取 + 首段有界连续性缓冲”。不引入自定义 PCM endpoint、WebSocket、AudioWorklet，也不把官方 FastAPI 的 `StreamingResponse` 误认为真正可边收边播的模型流式。

最终策略：

- `24` 字以内保持单段，避免为了更早首音人为制造短回复断点。
- `25–84` 字使用 `balanced` 分段档，首段上限约 `16–18` 字，后续段目标约 `22` 字。
- `85` 字以上使用 `extended` 分段档，首段上限约 `18–20` 字，后续段目标约 `24` 字。
- 所有分段回复默认立即启动第二段，最多保持 `2` 路受控请求；显式 `first-ready` 仍保留为兼容配置，但不再是默认。
- `25` 字以上在首段音频 ready 后，等待第二段 ready 或最多 `5000ms` 再播放首段，建立早期音频缓冲；不是固定睡眠，第二段提前 ready 时会立即继续。
- 中间分段不发 `audio:end`；取消、替换、静音、失败 fallback 和自然结束仍沿用同一个 utterance session 与既有清理路径。

相对 2026-07-24 正式 Demo 的最大 gap `6271ms`，真实浏览器长回复最大 gap 已降到 `236ms`，下降约 `96.2%`，达到“最大不超过 `1s` 且至少下降 `80%`”的验收门槛。

## 根因

段间空白不是单一的浏览器问题，而是以下因素叠加：

1. 官方 FastAPI 在当前 `/inference_sft` 路径中没有接收或传递 `stream=True`；虽然响应类型是 `StreamingResponse`，首个 HTTP 数据块仍在完整模型推理结束后才出现。
2. Alice 后端必须读完 raw PCM、包装 WAV 并返回 Base64；WAV 包装和 Base64 只占毫秒级，主要耗时在 CosyVoice2 推理。
3. 旧的细分策略产生过多短音频段；首段很快耗尽，而下一段在 CPU 上仍未完成，形成 underrun。
4. 增加到 3 路并发会让共享模型争抢 CPU，反而扩大首音和后续段的长尾。
5. 模型层 `stream=True` 确实能对中长文本提前吐出 PCM，但当前 CPU 的 chunk 生成速度仍慢于播放消耗速度，真实 chunk 之间本身存在多秒空洞。

## 流式能力实测

### 官方 FastAPI

三次重复中，4 / 8 / 16 / 26 字样本无论是否额外提交 `stream=true`，`firstPcmMs` 都基本等于 `allPcmMs`，`streamingEvidenceCount=0`。26 字样本 p50 为：

- 未请求 stream：首块 / 完成均约 `10152ms`。
- 请求 stream：首块 / 完成均约 `9661ms`。

HTTP 被拆成多个 transport chunk 不算真正流式；这些 chunk 的间隔为 `0ms`，都在完整推理结束后连续读出。

### 模型层 Direct Python

对同一 26 字样本，以每轮重置 `token_hop_len=25`、`stream_scale_factor=2` 的方式重复两次：

- `stream=false`：首块 / 完成 p50 `9035ms`。
- `stream=true`：首块 p50 `2503ms`，完成 p50 `10050ms`，p90 `15422ms`，可确认是真实多 chunk。
- 但模拟连续播放最大 gap p50 为 `2662ms`；增加 `500ms` 初始缓冲后仍为 `2162ms`。

MPS 单次对照没有改善：`stream=true` 首块 `3831ms`、完成 `11926ms`、最大 gap `3293ms`，并出现无效浮点转 int16 的告警。因此当前机器不采用 MPS 或 PCM streaming 主线。

另外，CosyVoice2 模型会在 stream 调用中修改共享 `token_hop_len`。诊断脚本已支持每轮显式重置，避免把前一轮的模型内部状态误当成稳定配置；这也是不直接把并发模型流式接入正式 Demo 的原因之一。

## 方案对比

| 方案 | 真实结果 | 判断 |
| --- | --- | --- |
| 旧细分 + 2 路预取 | 正式 Demo 最大 gap `6271ms`；受控 99.48 秒音频最大 `6088ms` | 不通过 |
| 固定首段缓冲 `1200ms` | 74 字样本最大 gap `4377ms` | 只是把空洞后移，拒绝 |
| 提升为 3 路并发 | 74 字样本最大 gap `2283ms` | CPU 争抢加重，拒绝 |
| 模型层 PCM `stream=true` | 首块可提前，但 26 字最大理论 gap p50 `2662ms` | 当前 CPU 吞吐不足，拒绝 |
| 平衡分段 + 第二段即时预取 | 74 / 95 字探针可到 `2–3ms` 级 gap，但首音约 `11–13s` | 连续性有效，继续加有界门控收口 |
| 最终 5 秒有界连续性缓冲 | Node 三次重复最大 `5ms / 4ms`；真实浏览器最大 `24ms / 236ms` | 本轮采用 |

`3000ms` 缓冲也做了三次中等回复重复，其中一次仍出现 `1674ms` gap，因此没有为了较快首音接受这个不稳定折中。

## 最终实测

### Node 真实 `/api/tts` 探针

探针复用正式 `TTSService`、Alice 后端和真实 CosyVoice2，只用 WAV 时长模拟播放：

| 样本 | 重复 | 分段 | 首次播放 p50 / p90 | 最大 gap | underrun |
| --- | ---: | --- | ---: | ---: | ---: |
| 16 字短回复 | 2 | 单段 | `2144 / 2955ms` | `0ms` | 0 |
| 26 字中回复 | 3 | `6+20` | `6903 / 6969ms` | `3ms` | 0 |
| 54 字中回复 | 3 | `14+24+16` | `12497 / 12985ms` | `5ms` | 0 |
| 95 字长回复 | 3 | `20+19+14+21+21` | `13414 / 14537ms` | `4ms` | 0 |

本地原始 JSON 位于 Git-ignored 的 `runtime/cosyvoice/output/p5-final-*.json`，不会提交音频、用户正文或私有 runtime。

### 真实浏览器

使用正式页面、真实 `HTMLAudioElement`、当前 `alice/girl.vrm` 和 `AudioManager`，直接触发 TTS 以隔离 LLM：

| 样本 | provider / mode | 首段 ready | ready 到播放 | 完整音频 ready | 总时长 | 最大 gap |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 16 字 | `cosyvoice / single` | `2694ms` | `3ms` | `2694ms` | `4154ms` | `0ms` |
| 54 字 | `cosyvoice / segmented` | `9149ms` | `3477ms` | `16313ms` | `25796ms` | `24ms` |
| 95 字 | `cosyvoice / segmented` | `10371ms` | `326ms` | `25445ms` | `31415ms` | `236ms` |

每一个分段 `audio:start` 都捕获到：

- `isSpeaking=true`
- `lipSync.active=true`
- `lipSync.mode=audio-driven`

每个回答只在最后发出一次 `audio:end`；结束后 `isSpeaking=false`、`lipSync=idle`、mouth group 为 `-`，未出现 fallback 或 error。浏览器截图保存在本地 Git-ignored 的 `output/playwright/p5-continuous-tts/p5-final-idle.png`。

## 兼容性与回归

- `/api/tts`、统一 Audio Result 和 `dialogue.v1` 均未改变。
- Mock provider、浏览器语音 fallback、CosyVoice provider 映射未改变。
- 新增确定性回归覆盖首段等待第二段、第二段 ready 后继续播放、等待期间取消、AbortController 清理、单一 `audio:end` 和指标记录。
- 显式 `first-ready` 仍可配置；默认改为连续性优先的两路即时预取。
- 本轮未修改 LLM、Prompt、Persona、Memory、Emotion、AvatarDirective、iOS、RAG、Agent 或 Provider 列表。

已通过的验证命令：

- `npm run check:mvp-flow`
- `npm run check:tts-provider-flow`
- `npm run check:companion-state-flow`
- `npm run check:vrm-renderer-flow`
- `npm run cosyvoice:verify`：生成 `4.32s / 207404 bytes / 24000Hz` 有效 WAV，并通过停机降级检查。
- `npm run check`
- `npm run smoke`：使用独立 `3102` 端口、临时 SQLite、显式 Stub/Mock 和空 n8n 配置。
- `npm run check:deployment-readiness`
- `git diff --check`

## 剩余风险

1. 连续性改善以首音延迟为代价。54 字 Node p50 首次播放约 `12.5s`；这是等待第二段建立播放缓冲的明确取舍，不应隐藏。
2. 95 字真实浏览器仍出现一次 `236ms` 的可测 gap，内部 `underrunCount` 因现有 `100ms` 阈值记为 1，但低于本轮 `1s` 体验门槛。
3. 当前结论只适用于本机 CPU、当前 CosyVoice2-0.5B、speaker `中文女` 和正式 Alice。其他硬件、speaker 或 Avatar 需重新测量。
4. 如果后续首音成为新的主要投诉，应优先优化 CosyVoice 推理吞吐、串行调度或运行设备；只有 provider 能稳定以实时系数小于 1 提供 PCM 时，才重新评估流式协议。

## 下一阶段建议

P5 连续播放问题已达到本轮门槛，不继续扩张播放器协议。下一优先级回到真实用户 10 分钟角色感评测；TTS 只保留运行指标采集和回归。如果真实用户明确认为 `10–13s` 的中长回复首音不可接受，再以本报告数据建立“首音与连续性”的新目标，不直接重开 PCM streaming。
