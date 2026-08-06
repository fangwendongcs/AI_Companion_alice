# CosyVoice2 Runtime Guide

Alice 的 `cosyvoice` TTS provider 默认对接 CosyVoice 官方 FastAPI runtime，而不是 OpenAI-compatible `/v1/audio/speech` 代理。

## 已确认的官方契约

CosyVoice 官方 FastAPI runtime 位于官方仓库的 `runtime/python/fastapi/server.py`，默认端口是 `50000`。它暴露：

- `/inference_sft`
- `/inference_zero_shot`
- `/inference_cross_lingual`
- `/inference_instruct`
- `/inference_instruct2`

官方 client 会把返回的 raw int16 PCM 流保存为 WAV。CosyVoice2-0.5B 的 `cosyvoice2.yaml` 标记 `sample_rate: 24000`，因此 Alice provider 在本地 CosyVoice2 验证时应使用 `COSYVOICE_SAMPLE_RATE=24000`，把 official FastAPI 返回的 raw PCM 包装成统一 Audio Result 中的 WAV `audioBase64`。

`/v1/audio/speech` 只适用于你自己额外部署的 OpenAI-compatible CosyVoice proxy。未验证该 proxy 前，不应把 `localhost:9880` 当成默认 CosyVoice2 端口。

## 本地运行时目录

推荐把 CosyVoice runtime 放在 Alice 仓库下的隔离目录：

```text
runtime/cosyvoice/
  CosyVoice/              # 官方仓库 clone，不提交
  envs/cosyvoice-py310/   # 隔离 Python 3.10 环境，不提交
  miniforge-root/         # 可选本地 Miniforge，不提交
  logs/                   # runtime 日志，不提交
  pretrained_models/      # 本地模型目录，不提交
  modelscope-cache/       # ModelScope 下载缓存，不提交
  hf-cache/               # Hugging Face 下载缓存，不提交
  hf-home/                # Hugging Face 本地 home/cache，不提交
  output/                 # 生成音频，不提交
```

这些路径已经写入 `.gitignore`。

## 准备官方运行时（macOS arm64 / 本地隔离）

如果系统没有 Conda，可以把 Miniforge 安装在 `runtime/cosyvoice/` 下，避免污染系统 Python：

```bash
mkdir -p runtime/cosyvoice/downloads runtime/cosyvoice/home
curl -L \
  https://mirrors.tuna.tsinghua.edu.cn/github-release/conda-forge/miniforge/LatestRelease/Miniforge3-MacOSX-arm64.sh \
  -o runtime/cosyvoice/downloads/Miniforge3-MacOSX-arm64.sh

HOME="$PWD/runtime/cosyvoice/home" \
bash runtime/cosyvoice/downloads/Miniforge3-MacOSX-arm64.sh \
  -b -p "$PWD/runtime/cosyvoice/miniforge-root"
```

创建隔离 Python 3.10 环境：

```bash
HOME="$PWD/runtime/cosyvoice/home" \
runtime/cosyvoice/miniforge-root/bin/conda create -y \
  -p "$PWD/runtime/cosyvoice/envs/cosyvoice-py310" \
  python=3.10
```

Clone 官方仓库和 submodule：

```bash
mkdir -p runtime/cosyvoice
git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git runtime/cosyvoice/CosyVoice
git -C runtime/cosyvoice/CosyVoice submodule update --init third_party/Matcha-TTS
```

安装依赖：

```bash
PIP_CACHE_DIR="$PWD/runtime/cosyvoice/pip-cache" \
runtime/cosyvoice/envs/cosyvoice-py310/bin/python -m pip install "setuptools<81" numpy==1.26.4

PIP_CACHE_DIR="$PWD/runtime/cosyvoice/pip-cache" \
runtime/cosyvoice/envs/cosyvoice-py310/bin/python -m pip install \
  --no-build-isolation \
  -r runtime/cosyvoice/CosyVoice/requirements.txt
```

## 下载模型

建议保留两套独立目录，运行时只通过 `COSYVOICE_MODEL_DIR` 选择其中一个，不混用半下载文件：

```text
runtime/cosyvoice/pretrained_models/CosyVoice2-0.5B-modelscope/  # 国内/ModelScope 路径
runtime/cosyvoice/pretrained_models/CosyVoice2-0.5B-hf/          # Hugging Face 路径
```

### Hugging Face 路径（当前已验证）

使用 Hugging Face 官方仓库下载完整模型：

```bash
HF_HOME="$PWD/runtime/cosyvoice/hf-home" \
HF_HUB_CACHE="$PWD/runtime/cosyvoice/hf-cache" \
runtime/cosyvoice/envs/cosyvoice-py310/bin/python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id='FunAudioLLM/CosyVoice2-0.5B',
    local_dir='runtime/cosyvoice/pretrained_models/CosyVoice2-0.5B-hf',
    cache_dir='runtime/cosyvoice/hf-cache',
    max_workers=2
)
PY
```

关键文件应至少包括：

```text
llm.pt
flow.pt
hift.pt
cosyvoice2.yaml
```

CosyVoice2-0.5B 的 Hugging Face 目录默认不带可直接用于 `/inference_sft` 的 `spk2info.pt`。如果本地验证要继续使用：

```bash
COSYVOICE_API_MODE=sft
COSYVOICE_VOICE_ID=中文女
```

需要先基于官方 `zero_shot_prompt.wav` 在本地模型目录生成一个测试 speaker。该步骤已经固化为可重复脚本，不需要手工编辑 `spk2info.pt`：

```bash
COSYVOICE_MODEL_DIR="$PWD/runtime/cosyvoice/pretrained_models/CosyVoice2-0.5B-hf" \
COSYVOICE_VOICE_ID=中文女 \
npm run cosyvoice:init-speaker
```

脚本会使用官方 `AutoModel.add_zero_shot_spk()` 生成 speaker，并检查 `spk2info.pt` 中是否存在目标 speaker、`embedding`、`llm_embedding` 和 `flow_embedding`。如果缺失，会给出可执行的修复命令。生成物仍位于 `runtime/cosyvoice/pretrained_models/`，不会进入 Git。

### ModelScope 路径

显式下载模型到本地目录，避免服务启动时隐式远程下载：

```bash
MODELSCOPE_CACHE="$PWD/runtime/cosyvoice/modelscope-cache" \
runtime/cosyvoice/envs/cosyvoice-py310/bin/python - <<'PY'
from modelscope.hub.snapshot_download import snapshot_download
snapshot_download(
    'iic/CosyVoice2-0.5B',
    local_dir='runtime/cosyvoice/pretrained_models/CosyVoice2-0.5B-modelscope'
)
PY
```

如果 `llm.pt` 下载中途因为 `SSLEOFError`、`IncompleteRead` 或 `Read timed out` 失败，可以先用单线程重试缺失的大文件，减少并发分片断流概率：

```bash
MODELSCOPE_CACHE="$PWD/runtime/cosyvoice/modelscope-cache" \
MODELSCOPE_DOWNLOAD_PARALLELS=1 \
runtime/cosyvoice/envs/cosyvoice-py310/bin/python - <<'PY'
from modelscope.hub.snapshot_download import snapshot_download
snapshot_download(
    'iic/CosyVoice2-0.5B',
    local_dir='runtime/cosyvoice/pretrained_models/CosyVoice2-0.5B-modelscope',
    allow_patterns=['llm.pt']
)
PY
```

如果机器没有可用 Python / conda / PyTorch / GPU 或无法下载模型权重，运行时启动会失败。失败日志在：

```text
runtime/cosyvoice/logs/fastapi.log
```

## 启动服务

完整 Alice + DeepSeek + CosyVoice2 Demo 优先使用：

```bash
npm run demo:start
npm run demo:status
npm run demo:stop
```

该入口由 Node supervisor 持续托管两个服务、覆盖本次 Alice 子进程的空 `COSYVOICE_BASE_URL`、等待 readiness，并做真实 DeepSeek / WAV 验证。详见 [DEMO_RUNTIME.md](./DEMO_RUNTIME.md)。本节下面的 `cosyvoice:*` 命令继续作为单独运行和排障入口。

启动 runtime 和验证 Alice 接入是两条不同命令。`cosyvoice:start` 只启动 CosyVoice FastAPI 服务；`check:cosyvoice-live` 只探测已经存在的服务。

启动前可以先跑本地前置检查：

```bash
COSYVOICE_MODEL_DIR="$PWD/runtime/cosyvoice/pretrained_models/CosyVoice2-0.5B-hf" \
COSYVOICE_VOICE_ID=中文女 \
COSYVOICE_SAMPLE_RATE=24000 \
npm run check:cosyvoice-runtime
```

该检查会验证模型目录、`llm.pt / flow.pt / hift.pt / cosyvoice2.yaml / spk2info.pt`、目标 speaker 和 sample rate。`cosyvoice:start` 也会在启动前执行同类检查，避免服务看似启动但 speaker 或模型不完整。启动脚本会在后台进程创建后先做短等待确认，默认 `COSYVOICE_STARTUP_GUARD_SECONDS=8`；随后默认继续等待 `/inference_sft` endpoint 真正可用，并用 `你好。` 完成一次短语音合成预热。这样 `npm run cosyvoice:start` 返回时，首个用户请求不再承担模型 endpoint ready 和第一次短合成的冷启动成本。

可调参数：

- `COSYVOICE_STARTUP_WAIT_ENDPOINT=0`：只启动进程，不等待 endpoint，也不做预热。
- `COSYVOICE_STARTUP_READY_ATTEMPTS=60`：endpoint ready 最大尝试次数；按默认 5 秒间隔，可覆盖约 5 分钟的首次启动。
- `COSYVOICE_STARTUP_READY_INTERVAL_SECONDS=5`：ready 检查间隔。

如果 FastAPI 进程立即退出，或在最大尝试次数内 endpoint 仍不可用，脚本会清理 pid 文件、打印 `runtime/cosyvoice/logs/fastapi.log` 尾部并失败，避免把失败启动误判为 ready。

首次在新机器启动时，中文文本前端还可能向 `MODELSCOPE_CACHE` 补齐 wetext 资源。2026-07-31 本机实测在缓存不完整时超过了原默认的 120 秒；因此单服务启动和 `demo:start` 现在都默认等待最多 5 分钟。缓存完成后的热启动不会固定等满该时间，endpoint ready 且短合成预热成功后会立即返回。

```bash
COSYVOICE_PYTHON="$PWD/runtime/cosyvoice/envs/cosyvoice-py310/bin/python" \
COSYVOICE_MODEL_DIR="$PWD/runtime/cosyvoice/pretrained_models/CosyVoice2-0.5B-hf" \
COSYVOICE_PORT=50000 \
npm run cosyvoice:start
```

脚本实际调用：

```bash
python runtime/python/fastapi/server.py \
  --port 50000 \
  --model_dir runtime/cosyvoice/pretrained_models/CosyVoice2-0.5B-hf
```

健康检查可以直接请求官方 endpoint：

```bash
curl -X POST http://127.0.0.1:50000/inference_sft \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "tts_text=你好，我是 Alice。" \
  --data-urlencode "spk_id=中文女" \
  --output runtime/cosyvoice/output/cosyvoice_sft.raw.pcm
```

## Alice 端到端验证

```bash
COSYVOICE_BASE_URL=http://127.0.0.1:50000 \
COSYVOICE_API_STYLE=official_fastapi \
COSYVOICE_API_MODE=sft \
COSYVOICE_VOICE_ID=中文女 \
COSYVOICE_SAMPLE_RATE=24000 \
npm run check:cosyvoice-live
```

通过时会输出 provider、格式、音频长度和 streaming 状态。它不会打印服务密钥、请求正文或完整音频内容。

如需保存一份可解析 WAV 证据：

```bash
COSYVOICE_BASE_URL=http://127.0.0.1:50000 \
COSYVOICE_API_STYLE=official_fastapi \
COSYVOICE_API_MODE=sft \
COSYVOICE_VOICE_ID=中文女 \
COSYVOICE_SAMPLE_RATE=24000 \
TTS_LIVE_OUTPUT_WAV=runtime/cosyvoice/output/alice-cosyvoice-live.wav \
npm run check:cosyvoice-live
```

Alice 后端会完整接收官方 FastAPI 返回的 raw PCM，再包装为完整 WAV/Base64 返回客户端。因此统一 Audio Result 中：

- `streaming=false`：客户端拿到的是完整音频，不能边收边播。
- `upstreamStreaming=true`：仅表示 CosyVoice 官方 runtime 的上游 HTTP 响应是流式 raw PCM。

不要把 `upstreamStreaming=true` 当成 Web / iOS 客户端可流式播放的语义。

由于 Web 拿到完整 WAV 后才开始播放，本机 30+ 秒音频的生成时间可以高于 45 秒。Alice 将 TTS 上游超时与 LLM 通用超时分开：

```bash
TTS_UPSTREAM_TIMEOUT_MS=90000
```

后端 TTS 默认等待 90 秒，Web TTS 请求窗口为 100 秒；`UPSTREAM_TIMEOUT_MS=45000` 和 Web LLM 30 秒时限保持不变。如果本地运行时在 90 秒内仍无法生成目标长度，应记录为运行时性能风险，不要用 browser fallback 冒充 audio-driven 验收。

## 首音延迟与分段调度

当前 CosyVoice2 provider 会在 `metadata.timings` 中记录上游音频读取、WAV 包装和 Base64 编码耗时，用于区分模型生成慢、Node 封装慢还是浏览器播放慢。

Web 端的首音优化发生在 `TTSService`：

1. 仅对 `cosyvoice` 且超过 `24` 字的回复启用文本分段；更短回复保持单段。
2. `25–84` 字使用 balanced 档，`85` 字以上使用 extended 档，减少容易耗尽缓冲的过短音频段。
3. 所有默认分段回复立即预取第二段，并保持最多 2 路受控窗口；3 路并发已被真实压测证实会加重 CPU 争抢。
4. `25` 字以上在首段 ready 后等待第二段 ready 或最多 `5000ms`，建立早期音频缓冲。显式 `first-ready` 只保留为兼容选项。
5. 后续段继续按已知音频时长与播放窗口补齐。
6. 中间段不会触发 `audio:end`，整个回复仍视为同一次 utterance。

这仍然使用现有 `/api/tts` 和完整 WAV/Base64 Audio Result，不是官方 FastAPI raw PCM 的浏览器流式播放。`upstreamStreaming=true` 仍只表示 CosyVoice official runtime 的上游响应形态。

可用 Web TTSService 探针复查 single / segmented 的首音、段间 gap 和 provider timing：

```bash
TTS_LATENCY_PROBE_TEXT='我在这儿，先陪你慢慢呼吸一下。' \
npm run cosyvoice:probe-web-tts

TTS_LATENCY_PROBE_MODE=segmented \
TTS_LATENCY_SEGMENT_MAX_IN_FLIGHT=3 \
npm run cosyvoice:probe-web-tts

TTS_LATENCY_PROBE_MODE=segmented \
TTS_LATENCY_SEGMENT_SHORT_MAX_IN_FLIGHT=2 \
TTS_LATENCY_SEGMENT_SHORT_FOLLOWUP_MAX_CHARS=5 \
npm run cosyvoice:probe-web-tts

TTS_LATENCY_PROBE_TEXT='我想听你用温柔声音回应我一下好吗' \
TTS_LATENCY_PROBE_REPEATS=10 \
TTS_LATENCY_PROBE_JSON_OUT=runtime/cosyvoice/output/probe-web-tts-16chars-both-10x.json \
npm run cosyvoice:probe-web-tts

TTS_LATENCY_PROBE_MODE=segmented \
TTS_LATENCY_SEGMENT_INITIAL_NEXT_WAIT_MS=5000 \
TTS_LATENCY_PROBE_REPEATS=3 \
npm run cosyvoice:probe-web-tts
```

该探针需要 Alice 后端和 CosyVoice2 runtime 已经启动。它复用真实 `TTSService` 与 `/api/tts`，但用 WAV 时长模拟 `HTMLAudioElement` 播放，不等同于浏览器听感或 VRM 视觉验收。

### 流式能力探测

本项目当前对接的是官方 `runtime/python/fastapi/server.py`。该 server 的 `/inference_sft` form contract 只有 `tts_text` 和 `spk_id`，内部调用 `cosyvoice.inference_sft(tts_text, spk_id)`，没有把 `stream=True` 暴露成 HTTP 参数。因此当前默认 FastAPI 路径需要被当成“返回 raw PCM 的 HTTP streaming wrapper”，不能直接等同于模型级 chunk streaming。

为避免把“完整音频单块返回”误判为真正流式，仓库提供两条诊断命令：

```bash
# 只探测已经启动的官方 FastAPI endpoint。
# 该命令不会启动 CosyVoice2 服务，也不会证明模型级 stream=True。
COSYVOICE_BASE_URL=http://127.0.0.1:50000 \
COSYVOICE_VOICE_ID=中文女 \
COSYVOICE_SAMPLE_RATE=24000 \
npm run cosyvoice:probe-fastapi

# 绕过 FastAPI，直接调用官方 Python API，对比 stream=false / stream=true。
# 需要已创建 runtime/cosyvoice/envs/cosyvoice-py310 且模型、speaker 已准备好。
COSYVOICE_MODEL_DIR="$PWD/runtime/cosyvoice/pretrained_models/CosyVoice2-0.5B-hf" \
COSYVOICE_VOICE_ID=中文女 \
npm run cosyvoice:probe-direct
```

`cosyvoice:probe-fastapi` 记录 `runtimeRequestToFirstPcmMs`、`runtimeRequestToAllPcmMs`、PCM chunk 数量和 chunk 间隔。如果 `stream=true` form 字段没有改变结果，这是当前官方 FastAPI contract 的预期现象。

`cosyvoice:probe-direct` 直接调用 `model.model.tts(..., stream=false|true)`，用于判断当前机器、当前模型和当前 Python runtime 是否真的能在模型层先吐出首个 PCM chunk。该命令可能触发模型加载、文本前端、CPU/MPS 计算和 ModelScope / wetext 依赖初始化；失败时应记录具体依赖或运行时错误，不要归因成 Alice 后端 provider 失败。

诊断脚本支持 `COSYVOICE_STREAM_PROBE_RESET_TOKEN_HOP=1`、`COSYVOICE_STREAM_PROBE_TOKEN_HOP_LEN`、`COSYVOICE_STREAM_PROBE_SCALE_FACTOR`、`COSYVOICE_STREAM_PROBE_LABELS` 和 `COSYVOICE_STREAM_PROBE_DEVICE=cpu|mps`。CosyVoice2 的 stream 调用会修改共享 `token_hop_len`，做重复对照时应显式重置，避免前一轮状态污染后一轮。

2026-07-15 本机 macOS arm64 / MPS 实测：

- `cosyvoice:probe-fastapi` 10 轮显示官方 FastAPI 在 4 / 8 / 16 / 30 字样本上均无 true streaming evidence；`stream=true` form 字段不会改变当前 HTTP contract。
- 30 字样本 FastAPI `stream=false` p50 首 PCM 约 `10.25s`，`stream=true` p50 约 `12.26s`，不适合作为低风险首音优化方案。
- 同日最新 3 轮复测仍为 `streamingEvidenceCount=0`；4 字样本 p50 约 `2.95s`，8 字样本 p50 约 `7.74s`，30 字样本 p50 约 `16.03s`，`firstPcm` 与 `allPcm` 基本相等，说明当前官方 FastAPI 路径仍需要等完整 PCM 生成。
- `cosyvoice:probe-direct` 10 轮显示 Python API 的 `stream=true` 对 30 字样本有模型层提前 chunk 证据，但 p50 首 PCM 仍约 `11.70s`，且总完成时间更长；短句没有稳定收益。
- 本轮当前 runtime 复测：FastAPI 3 轮中 4 字 p50 `1.43–1.49s`，8 字 p50 `3.25–3.37s`，16 字 p50 `1.96–2.57s`，30 字 p50 `9.83–10.05s`，`streamingEvidenceCount=0`。Direct Python 3 轮 warmup 后，4 字 p50 `1.69s`，8 字 p50 `2.57–2.63s`，16 字 p50 `2.53–3.36s`；`stream=True` 对 30 字能提前到 p50 `6.71s` 首块，但对 4–16 字仍基本不能产生稳定低延迟多 chunk。
- Alice `/api/tts` + Web `TTSService` 当时复测：74 字样本单段首音约 `22.2s`，分段首音约 `4.9s`；95 字样本单段约 `28.2s`，分段约 `4.4s`，但 Node 探针仍显示多秒级段间 gap 风险。
- 真实浏览器复测：16 字无自然停顿短句首音约 `1.97s`；53 字中回复首音约 `5.28s`、完整音频 ready 约 `12.75s`、播放完成约 `17.65s`；最终状态均回 idle；播放中取消、连续替换、静音和 runtime 停止 fallback 均未产生旧音频串音。
- 因此 2026-07-15 当时优先保留 Web 侧首段优先分段调度，并把 CosyVoice2 启动脚本改为 endpoint ready + 短合成预热；真正 PCM streaming / 自定义 FastAPI `stream=True` endpoint 对 5–20 字短回复收益有限，不应在未完成更多浏览器听感与多场景回归前替换现有 Audio Result 链路。

2026-07-28 P5 决策复测：

- 官方 FastAPI 三次重复仍无 true streaming evidence；26 字样本即使提交 `stream=true`，首块 / 完成 p50 均约 `9661ms`。
- Direct Python 对同一 26 字样本确认模型层 `stream=True` 可提前到 p50 `2503ms` 首块，但完整生成 p50 `10050ms`，无缓冲最大 gap p50 `2662ms`，`500ms` 缓冲后仍为 `2162ms`。
- MPS 单次对照为首块 `3831ms`、完成 `11926ms`、最大 gap `3293ms`，并出现无效浮点转 int16 告警；当前不把 MPS 当作加速路径。
- 采用 balanced / extended 分段、第二段即时 2 路预取和 `5000ms` 有界连续性等待后，Node 真实 `/api/tts` 探针在 26 / 54 / 95 字各三次重复中最大 gap 为 `3 / 5 / 4ms`。
- 真实浏览器 54 / 95 字最大 gap 为 `24 / 236ms`；相对正式 Demo `6271ms` 基线下降约 `96.2%`。完整证据见 `docs/reports/P5_CONTINUOUS_TTS_DECISION_20260728.md`。

候选方案评分（5 分最高）：

| 方案 | 短回复首音 | 中文音质 | Mac 可运行性 | 改造复杂度 | 中断能力 | 扩展性 | 结论 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 启动 ready + 短合成预热 | 3 | 5 | 5 | 1 | 5 | 4 | 本轮采用；消除冷启动误判和首个用户请求冷启动。 |
| 保留 WAV/Base64 + 平衡分段 / 有界缓冲 | 2 | 5 | 5 | 2 | 4 | 4 | P5 采用；真实浏览器最大 gap `236ms`，但中长回复首音约 `10–13s`。 |
| 自定义 FastAPI `stream=True` + PCM 转发 | 2 | 5 | 4 | 4 | 3 | 4 | 模型层首块可提前，但当前 CPU chunk gap 仍超过 `2s`，本轮拒绝。 |
| WebSocket/AudioWorklet PCM streaming | 2 | 5 | 3 | 5 | 4 | 4 | provider 实时系数仍大于 1，协议改造不能消除生成空洞，暂不实施。 |
| 换实时 TTS provider | 5 | 待验证 | 待验证 | 4 | 4 | 3 | 可后续评估，但不能在中文、音色、许可和设备性能未验证前替换 CosyVoice2。 |

## 一键回归流程

已经具备 runtime、模型和 speaker 后，可以用一条命令执行可复现回归：

```bash
COSYVOICE_MODEL_DIR="$PWD/runtime/cosyvoice/pretrained_models/CosyVoice2-0.5B-hf" \
COSYVOICE_VOICE_ID=中文女 \
COSYVOICE_SAMPLE_RATE=24000 \
npm run cosyvoice:verify
```

该流程会依次执行：

1. runtime 前置检查；
2. 启动官方 FastAPI；
3. 等待 `/inference_sft` 可用；
4. 执行 Alice `check:cosyvoice-live`；
5. 写出并解析 WAV 证据；
6. 停止 runtime；
7. 验证服务停止后 TTS 降级且 Dialogue 文本仍返回。

## Web 长音频口型验收

`check:cosyvoice-live` 证明 provider 能返回有效 WAV，但不能证明浏览器口型观感。完成 runtime 验证后，再打开：

```text
http://localhost:3000?debug=1&avatar=local_girl_vrm_test
```

发送一段预计 30–120 秒的中文文本，并确认：

1. 音频真正开始后，Debug Panel 的 `lipSync.mode` 为 `audio-driven`，`amplitude` 与 `mouth` 持续变化。
2. 播放时间超过文本估算时长后，口型和 speaking 动作仍随真实音频继续，不会提前回到 idle。
3. 播放中再次发送文本时，旧音频停止；旧请求不会在新音频期间延迟触发 `audio:end`。
4. 自然结束、播放错误和角色切换三条路径都应回到 `lipSync.mode=idle`，mouth influence 归零，动作回到 idle。
5. 浏览器控制台无 `createMediaElementSource`、AudioContext、morph target 或未处理 Promise 错误。

自动化已经覆盖 120 秒模拟振幅稳定性、`audioSource` 到当前 VRM controller 的对象级透传，以及旧播放 session 失效。2026-07-14 的真实浏览器验收中，`local_girl_vrm_test` 的 37.12 秒音频保持 `audio-driven`，并在自然结束后将 mouth/Avatar/motion 全部归零；快速替换、静音取消、CosyVoice2 停机 fallback 和重启恢复也通过。口型参数未调整。详细数据见 `docs/process/BROWSER_ACCEPTANCE_CHECKLIST.md`。

## 停止服务

```bash
npm run cosyvoice:stop
```

脚本只会停止 `runtime/cosyvoice/cosyvoice-fastapi.pid` 中记录的进程。

## API mode

默认模式：

```bash
COSYVOICE_API_MODE=sft
```

适用于官方 `/inference_sft`，请求字段为：

- `tts_text`
- `spk_id`

需要 prompt wav 的模式：

- `zero_shot`
- `cross_lingual`
- `instruct2`

这些模式必须配置：

```bash
COSYVOICE_PROMPT_WAV=/absolute/path/to/prompt.wav
```

`zero_shot` 还应配置 `COSYVOICE_PROMPT_TEXT`；`instruct2` 可配置 `COSYVOICE_INSTRUCT_TEXT`。

## OpenAI-compatible proxy

只有当你明确部署了自建兼容代理时，才使用：

```bash
COSYVOICE_API_STYLE=openai_compatible
COSYVOICE_BASE_URL=http://localhost:<your-proxy-port>
COSYVOICE_SPEECH_PATH=/v1/audio/speech
```

这不是官方 FastAPI runtime 的默认契约。
