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

需要先基于官方 `zero_shot_prompt.wav` 在本地模型目录生成一个测试 speaker：

```bash
MODELSCOPE_CACHE="$PWD/runtime/cosyvoice/modelscope-cache" \
PYTHONPATH="$PWD/runtime/cosyvoice/CosyVoice:$PWD/runtime/cosyvoice/CosyVoice/third_party/Matcha-TTS" \
runtime/cosyvoice/envs/cosyvoice-py310/bin/python - <<'PY'
import torch
from cosyvoice.cli.cosyvoice import AutoModel

model_dir = 'runtime/cosyvoice/pretrained_models/CosyVoice2-0.5B-hf'
prompt_wav = 'runtime/cosyvoice/CosyVoice/asset/zero_shot_prompt.wav'
prompt_text = '希望你以后能够做的比我还好呦。'
spk_id = '中文女'

cosyvoice = AutoModel(model_dir=model_dir)
cosyvoice.add_zero_shot_spk(prompt_text, prompt_wav, spk_id)
cosyvoice.save_spkinfo()

path = f'{model_dir}/spk2info.pt'
spk = torch.load(path, map_location='cpu', weights_only=True)
item = spk[spk_id]
if 'embedding' not in item and 'llm_embedding' in item:
    item['embedding'] = item['llm_embedding']
    spk[spk_id] = item
    torch.save(spk, path)
print(cosyvoice.list_available_spks())
PY
```

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
