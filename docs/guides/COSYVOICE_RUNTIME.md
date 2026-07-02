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

启动 runtime 和验证 Alice 接入是两条不同命令。`cosyvoice:start` 只启动 CosyVoice FastAPI 服务；`check:cosyvoice-live` 只探测已经存在的服务。

启动前可以先跑本地前置检查：

```bash
COSYVOICE_MODEL_DIR="$PWD/runtime/cosyvoice/pretrained_models/CosyVoice2-0.5B-hf" \
COSYVOICE_VOICE_ID=中文女 \
COSYVOICE_SAMPLE_RATE=24000 \
npm run check:cosyvoice-runtime
```

该检查会验证模型目录、`llm.pt / flow.pt / hift.pt / cosyvoice2.yaml / spk2info.pt`、目标 speaker 和 sample rate。`cosyvoice:start` 也会在启动前执行同类检查，避免服务看似启动但 speaker 或模型不完整。

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
