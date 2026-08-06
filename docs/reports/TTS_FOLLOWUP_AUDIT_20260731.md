# TTS 后续审计与 Provider 决策

日期：2026-07-31

## 结论

TTS 的基础链路、连续播放、取消 / 替换 / fallback 和 VRM 口型联动已经可用，但还不能认定为“没有问题”。当前主要剩余问题是：

1. 本机 CPU 上的 CosyVoice2 中长回复首音仍有约 `10–13s` 的可感知等待。
2. 首次启动可能需要补齐 wetext 缓存，原有单服务 `24 次 × 5s` 和 Demo `180s` 等待窗口不足。
3. 现有 OpenAI / MiniMax / Higgs adapter 未获得可用的本地凭据与完整 live 验收，现在将它们暴露到正式 Demo 会把已收口的稳定链路变成未验证分支。

本轮只落地确定性修复：将单服务和完整 Demo 的 CosyVoice2 冷启动默认等待窗口统一提升到约 5 分钟，且保留 endpoint ready 后立即返回。未改动播放策略，未新增公开 provider。

## CosyVoice2 复测

采用当前 P5 正式策略（完整 WAV/Base64、平衡分段、2 路预取、最多 5 秒首段连续性等待）对 54 字中文回复重复 3 次：

- 首次播放 p50 `12010ms`，p90 `15337ms`。
- 首段音频 ready p50 `7299ms`。
- 完整音频 ready p50 `14415ms`。
- 最大段间 gap `6ms`，0 underrun。

这证明“播放连续性”已稳定，“首音”仍是主要瓶颈。

### 拒绝的首音实验

| 方案 | 结果 | 判断 |
| --- | --- | --- |
| 第二段延后 1500ms、首段立即播放 | 54 字首音 p50 `6499ms`，但最大 gap `5367ms`，3 次 underrun | 恢复明显断句，拒绝 |
| 根据首段推理时间预测第二段 ready | 首音可提前约 1s，但最大 gap `1382–1818ms` | CPU 长尾无法稳定预测，拒绝 |
| 限制 PyTorch / BLAS 为 4 线程 | 54 字 p50 约提前 `403ms`，但 95 字复测首音 `16871ms` | 中文本收益小，长文本回归，不采用 |
| 4 线程 + inter-op 2 | 54 字 p50 约提前 `999ms`，但 95 字出现 `25119ms` 首音长尾 | 不适合正式 Demo，拒绝 |

因此，当前不用“平均更快但尾部更差”的运行时调参换取纸面首音收益。

## 冷启动问题与修复

本机缓存不完整时，CosyVoice2 在启动期间补齐 `MODELSCOPE_CACHE` 中的 wetext 资源，超过原默认的约 120 秒才 endpoint ready。这会导致进程本身没有崩溃，启动脚本却提前判定失败。

修复后：

- `cosyvoice:start` 默认 readiness 从 `24 × 5s` 提升为 `60 × 5s`。
- `demo:start` 默认基础服务 readiness 从 `180s` 提升为 `300s`。
- 两者仍使用 polling；endpoint ready 并完成短合成预热后立即返回，不会固定增加热启动时间。
- 自动检查锁定两个默认值，防止后续回归到过短窗口。

## 其他 Provider 审计

仓库已有 OpenAI、MiniMax 和 Higgs 的后端 adapter，但它们尚不在 Web Settings、`GET /api/providers` 和公开 `/api/tts` provider 集合内。本轮只做最短的安全 live 前置检查，不记录凭据内容：

| Provider | 当前结果 | 结论 |
| --- | --- | --- |
| OpenAI | 现有本地值未通过 adapter 的 secret 格式检查，未发起成功合成 | 不公开 |
| MiniMax | 上游返回登录 / Authorization 失败，未获得音频 | 不公开 |
| Higgs | 未配置必需的 base URL | 无法 live 验收，不公开 |

OpenAI 官方的 [Text-to-Speech 指南](https://developers.openai.com/api/docs/guides/text-to-speech) 说明 `gpt-4o-mini-tts` 支持 Speech endpoint、多语言输入、chunked streaming，并建议需要最快响应时使用 `wav` 或 `pcm`；同时官方也提醒内置声线目前主要为英语优化。这使它适合作为下一个候选对照，但不足以在没有中文声线听感和延迟数据时取代 CosyVoice2。

## 新 Provider 的进入门槛

下一个 provider 应先作为后端对照实验，而不是立即加入正式 Settings。至少需要：

1. 用有效后端凭据完成短 / 中 / 长中文各 3 次 live，记录首音 p50 / p90、完整耗时、音频格式和错误分类。
2. 盲听对比 Alice 中文人设、情绪 / tone 一致性、声线稳定性，不只看速度。
3. 通过统一 Audio Result、timeout / upstream error、fallback、取消 / 替换、秘密不泄露、口型和结束归零回归。
4. 只有数据明确优于 CosyVoice2 的主要痛点，再同步更新 `/api/providers`、`/api/tts`、Web Settings、API 契约和 smoke。

## 边界

- 未修改 `/api/tts`、Audio Result 或 `dialogue.v1`。
- 未修改 TTS 分段、播放、fallback、VRM 口型、Persona、Memory 或 LLM。
- 未修改 `.env`，未记录或输出任何 API Key。
- 没有成功调用付费 TTS 合成。

## 验证

- `bash -n scripts/cosyvoice/start-official-fastapi.sh`：通过。
- `npm run check:demo-lifecycle`、`check:mvp-flow`、`check:tts-provider-flow`：通过。
- `npm run check`：通过。
- `npm run smoke`：使用独立 `3102` 端口、Stub / Mock 和临时 SQLite 通过；临时服务与数据已清理。
- `npm run cosyvoice:verify`：热缓存下第 3 次 readiness polling 完成 endpoint 预热；Alice live 返回 `4.32s / 207404 bytes / 24000Hz` 有效 WAV，随后停机降级检查通过。
- `npm run check:deployment-readiness`、`git diff --check`：通过。
