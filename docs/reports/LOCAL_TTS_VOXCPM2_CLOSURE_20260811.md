# VoxCPM2 本地 Provider 代码收口记录

日期：2026-08-11

## 范围决定

本轮在既有 `local / remote / selfHosted` TTS 抽象上增加 `voxcpm2` 本地候选，并保留 `cosyvoice` 为默认与本地 fallback。用户随后明确暂缓真实 TTS 对照，因此本报告只收口代码、自动化、复现脚本与项目记忆；不下载模型、不启动推理、不生成真实音频、不填写延迟或听感结论。

## 架构审计结论

既有链路无需重写：

```text
TTSService / utterance session
  -> POST /api/tts
  -> TTSOrchestrator
  -> TTSProviderRegistry / descriptor
  -> local adapter
  -> unified Audio Result
  -> existing AudioManager / LipSync / Presentation / final idle
```

`TTSService` 已负责分段、预取、session epoch、取消和静音；`AudioManager` 已负责唯一播放生命周期；表现层已消费同一 audio 事件。新增模型的正确位置是后端 adapter 与独立运行时，不是 AppController 或第二套播放器。

## 代码收口

- 新增 `VoxCPM2TTSProvider`，调用本机 `/v1/audio/speech`，返回现有完整 WAV Audio Result。
- Registry、descriptor、readiness、Settings、前端 provider registry 和状态标签增加 `voxcpm2`。
- `voxcpm2` 标记为 `local / selectable / experimental`；默认 provider 与 `TTS_LOCAL_FALLBACK_PROVIDER` 仍为 `cosyvoice`。
- Orchestrator 允许非默认本地候选失败时回退默认 CosyVoice2；CosyVoice2 自身失败后仍走既有 Web 系统语音。
- capability 记录 streaming、voice clone、emotion；运行结果可带 device、模型加载、首 chunk、完整生成、音频时长、RTF、峰值 RSS 等安全 metadata。
- 新增官方包安装、模型下载、MPS readiness、启停、live 和顺序对照脚本；受限 command wrapper 用 Node 原生 `.env` 加载把配置传给 runtime，不直接 source 配置文件。运行时、模型、日志和音频证据全部位于 Git-ignored `runtime/voxcpm2/`。
- 没有修改 `AppController / TTSService / AudioManager / LipSync / Presentation / TTSTextSegmenter`。

## Apple Silicon 可行性结论

官方 VoxCPM 代码和文档提供 `device=auto` / `mps` 路径；官方当前 MPS 实现使用 float32，并只在 CUDA 启用 compile 优化。因此 VoxCPM2 具备“值得在本机做真实可行性验收”的官方路径，但 2B 模型在 16 GB Apple Silicon 上的速度、峰值内存、稳定性和中文听感仍未知，不能由文档支持直接推断为可用。

当前本机已确认 Apple Silicon、16 GB 统一内存、可用 Python 3.11；本轮只准备了忽略目录和脚本，官方 `voxcpm==2.0.3` 依赖与模型权重没有完成安装。因此没有 VoxCPM2 live 证据。

## Qwen3-TTS Mac 探针止损

本轮没有继续部署 Qwen3-TTS 0.6B。本次复核时，[Qwen3-TTS 官方仓库](https://github.com/QwenLM/Qwen3-TTS) 的主线安装与推理示例仍以 CUDA/FlashAttention 为主，没有已合并的官方 MPS 或 MLX 运行路径；相关 MPS/MLX 工作仍处于未合并变更阶段。按任务止损规则，不采用社区转换仓库，不下载第二套大模型，也不把云端 `qwen3_tts` identity 混成本地模型。

## Self-hosted 长期路径

[vLLM-Omni 官方 Speech API 文档](https://github.com/vllm-project/vllm-omni/blob/main/docs/serving/speech_api.md) 已提供 OpenAI-compatible `/v1/audio/speech` 边界，并列出 Qwen3-TTS、Fish S2 Pro、CosyVoice3、VoxCPM2 等支持项。Alice 现有 `self_hosted` adapter 可以作为这类 GPU 部署的首选最低公共契约；某模型需要额外 clone/emotion 参数时，只在 adapter/gateway 增加薄映射，不改播放与表现层。

未在该官方列表中核实的模型不能写成已兼容。LongCat、dots.tts、Higgs、FireRed 等仍需逐项确认其真实服务契约。

## 实际支持矩阵

| Provider | 代码已接入 | 凭据/本地依赖 | 真实 API/live | Mock/自动化 |
| --- | --- | --- | --- | --- |
| `cosyvoice` | 是，默认 local | 本机既有 runtime/模型曾可用；不需要云 Key | 既有真实中文、连续轮次、取消/静音/fallback/idle 已验收；本轮未重跑 | 通过 |
| `voxcpm2` | 是，实验 local | 不需要 Key；本轮未完成官方依赖和模型安装 | 未验证 | fake HTTP、request mapping、metadata、Vox→Cosy fallback 通过 |
| `qwen3_tts` | 是，DashScope remote | 当前无可证明有效 Key | 未验证 | 通过 |
| `fish_audio` | 是，Fish remote | 当前无可证明有效 Key/voice | 未验证 | 通过 |
| `self_hosted` | 是，OpenAI-compatible | 当前无真实服务配置 | 未验证 | 通过 |
| `mock` | 是，隐藏 test-only | 不需要 | 不适用 | 通过 |
| OpenAI / MiniMax / Higgs | 历史隐藏实验 adapter | 不作为本轮判断 | 未验收为公开 Provider | 仅既有实验覆盖 |

## 本轮已执行验证

- Node syntax：Vox provider 与全部 `scripts/voxcpm2/*.mjs` 通过。
- Python `py_compile`：`server.py`、`download-model.py` 通过；首次系统缓存目录权限失败后，改用 `/tmp` 字节码缓存复跑通过。
- Bash `bash -n`：setup/start/stop/local-race 通过。
- `npm run check:tts-provider-flow`：通过。
- `npm run check:provider-config`：通过。
- `npm run check:js`：通过。
- `npm run check`：全量通过，含既有 Dialogue、Memory、安全、配置、TTS、Demo lifecycle 和 VRM 回归；没有调用真实 TTS。
- `git diff --check`：通过。

尚未执行且不得宣称完成：`voxcpm2:setup`、`check:voxcpm2-runtime`、`voxcpm2:start`、`check:voxcpm2-live`、真实浏览器切换、真实取消/静音/fallback/idle、CosyVoice2 vs VoxCPM2 延迟/听感对照。

## 后续最小工作量

1. 经用户确认磁盘、下载量和 16 GB 内存风险后运行 `npm run voxcpm2:setup`。
2. 运行 readiness/start/live，确认实际 `device=mps`、48 kHz WAV 和两轮中文。
3. 在 Settings 切换到 Vox，完成取消、静音、故障回退和最终 idle 浏览器验收。
4. 只有用户恢复对照要求时，再运行顺序 local race 和盲听，不同时加载两个本地模型。

在 VoxCPM2 live 完成前，不值得继续部署第三个本地候选；Qwen3-TTS Mac 路径也应等官方稳定支持后再复核。
