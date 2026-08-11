# VoxCPM2 本地运行时

最后更新：2026-08-11

VoxCPM2 是 Alice 的第二个本地 TTS 候选，Provider id 为 `voxcpm2`。它不需要云 API Key：模型和推理进程都运行在 Alice 所在机器上。当前仍以 `cosyvoice` 为默认，本页只说明可选运行时、配置和验收边界。

## 当前状态

| 项目 | 状态 |
| --- | --- |
| Alice adapter / descriptor / Settings 选择 | 代码已接入，自动化 contract 通过 |
| 官方 Python 依赖 | 本轮未安装 |
| `openbmb/VoxCPM2` 模型权重 | 本轮未下载 |
| Apple Silicon MPS live | 未验证 |
| 中文真实音频、连续两轮、取消/静音/idle | 未验证 |
| CosyVoice2 延迟与听感对照 | 按用户决定后置，暂无数据 |

不得把 `configured=true`、fake HTTP 测试或脚本存在解释为模型已经能在本机生成语音。

## 为什么不需要 Key

VoxCPM2 是开源模型，本地运行时只需要 Python 依赖和模型权重。`VOXCPM2_BASE_URL` 是 Alice 后端访问本机进程的地址，不是云平台地址；默认绑定 `127.0.0.1:55000`。只有将来把同一接口部署到受保护的远程 GPU 服务时，才可能由部署方自行增加鉴权。

官方资料：

- [OpenBMB/VoxCPM 官方仓库](https://github.com/OpenBMB/VoxCPM)
- [VoxCPM Quick Start](https://voxcpm.readthedocs.io/en/latest/quickstart.html)
- [openbmb/VoxCPM2 模型页](https://huggingface.co/openbmb/VoxCPM2)

官方 `device=auto` 会按可用设备选择 CUDA、MPS 或 CPU。Alice 的启动检查在当前 Mac 上进一步要求实际结果为 `mps`，避免误把 CPU fallback 当成 MPS 验收。MPS 路径不启用 CUDA 专用 `torch.compile` 优化，并沿用官方针对 MPS 的 float32 路径。

## Alice 边界

```text
Settings provider=voxcpm2
  -> POST /api/tts
  -> VoxCPM2TTSProvider
  -> http://127.0.0.1:55000/v1/audio/speech
  -> complete 48 kHz PCM16 WAV Audio Result
  -> existing TTSService / utterance session
  -> existing AudioManager / LipSync / Presentation / final idle
```

模型的 `generate_streaming()` 能力记录为 `supportsStreaming=true`，但当前本地 HTTP 边界会先拼成完整 WAV，Alice Audio Result 仍为 `streaming=false`。本轮没有改播放器、分段、口型或 Presentation。

`emotion / tone / prosody` 先由 Alice 的统一 voice policy 转为 adapter 内 instruction；是否达到可接受的中文情绪效果必须由真实试听确认。Voice clone 只允许通过运行时环境变量引用用户已同意使用的本地音频路径，浏览器请求不能提交任意文件路径。

## 配置

默认值已写入 `.env.example`：

```bash
VOXCPM2_BASE_URL=http://127.0.0.1:55000
VOXCPM2_SPEECH_PATH=/v1/audio/speech
VOXCPM2_MODEL=openbmb/VoxCPM2
VOXCPM2_VOICE_ID=default
VOXCPM2_OUTPUT_FORMAT=wav
VOXCPM2_SAMPLE_RATE=48000
VOXCPM2_TIMEOUT_MS=600000
VOXCPM2_DEVICE=auto
VOXCPM2_MODEL_DIR=runtime/voxcpm2/models/VoxCPM2
```

可选 voice clone：

```bash
VOXCPM2_REFERENCE_WAV=/absolute/consented/reference.wav
# 或同时提供：
VOXCPM2_PROMPT_WAV=/absolute/consented/prompt.wav
VOXCPM2_PROMPT_TEXT=参考音频对应文本
```

路径只保存在本机忽略配置或启动环境中，不应提交到仓库。当前 adapter 固定接受 WAV / 48 kHz；其他值会明确报告 `unsupported_output_format` 或 `unsupported_sample_rate`，不会把 metadata 与真实音频格式写成两套事实。

## 安装与启动

以下命令会下载较大的 Python/PyTorch 依赖和约 5 GB 模型，执行前应确认磁盘、网络和 16 GB 统一内存压力。本轮没有执行：

```bash
npm run voxcpm2:setup
npm run check:voxcpm2-runtime
npm run voxcpm2:start
npm run check:voxcpm2-live
npm run voxcpm2:stop
```

这些 npm 命令与 `npm run dev` 一样通过 Node 原生 `--env-file-if-exists=.env` 注入本地忽略配置，再把环境传给受限的 shell 脚本；不直接 `source` `.env`。`voxcpm2:setup` 使用独立 `runtime/voxcpm2/` Python 环境并固定 `voxcpm==2.0.3`；整个目录被 Git ignore，不修改全局 Python。`voxcpm2:start` 在 health 返回 `ready=true / device=mps / sampleRate=48000` 后才报告 ready，且不会自动把 `TTS_PROVIDER` 从 CosyVoice2 切走。

## 后续真实验收

后续只有在用户重新要求真实对照时才执行：

```bash
npm run check:tts-local-race-live
```

该脚本会顺序运行 CosyVoice2 和 VoxCPM2，避免两个模型同时占用 16 GB 统一内存；使用同一组短、中、长中文与连续 10 轮语料，保存 request-to-Audio-Result、完整生成、RTF、峰值 RSS 和盲听 WAV。由于当前播放器仍消费完整 Audio Result，模型首 chunk 只能作为诊断值，不能伪称为浏览器首音。

真实验收还必须单独覆盖 Settings 切换、取消、静音、Vox 故障回退 CosyVoice2、Cosy 也故障后的系统语音、最终口型归零与 idle。客户端取消会中止 Alice fetch；当前串行模型进程可能继续完成已开始的单次推理，这是待实测和后续按需要优化的运行时风险。
