# Alice Demo Runtime

`demo:*` 是本地完整演示的统一入口。它同时管理 Alice Web / Backend、DeepSeek LLM 配置和本机 CosyVoice2 官方 FastAPI runtime，不需要手动打开多个 Terminal，也不会修改 `.env`。

## 使用方式

```bash
npm run demo:start
npm run demo:status
npm run demo:stop
```

启动成功后打开：

```text
http://localhost:3000
http://localhost:3000?debug=1
```

页面加载后会读取 `/api/providers`。正式 Demo 入口以“打开即可演示”为准：只要后端报告 DeepSeek 与 CosyVoice2 ready，每次加载都会在 UI 初始化前选用 `deepseek` / 后端默认 model 与 `cosyvoice`，避免历史 localStorage 把演示静默带回 Stub / Mock。开发设置仍可用于当前页面排障，但刷新后会重新采用 ready 的正式 Demo provider。

普通 `/`、`/?debug=1` 和刷新入口默认使用 registry 的 `alice`，其正式 Demo 模型为 `assets/avatars/test-vrm/girl.vrm`。历史 `avatar_id` 不再改变默认入口；只有显式 `?avatar=<registry-id>` 才作为本次加载的 QA 覆盖。`demo:start` / `demo:status` 会校验 `alice` manifest、模型文件和 Web 模型 URL，缺失时不会把服务误报为完整 ready。

### `demo:start`

- 使用根目录 Git-ignored `.env` 读取 DeepSeek Key 和其他后端配置，但不会写回文件。
- 无论 `.env` 中 `COSYVOICE_BASE_URL` 是空值还是 TTS 默认仍为 `mock`，Demo 子进程都会把 Alice 指向本脚本托管的 `http://127.0.0.1:50000`，并启用 `cosyvoice`。
- Demo 子进程会忽略 `replace_with_*`、`example.invalid` 等 credential / optional URL placeholder，避免示例配置被误报为真实 provider；真实值和 `.env` 文件本身不受影响。
- 启动一个 detached Node supervisor；supervisor 持续持有 Alice 与 CosyVoice 子进程，所以调用命令退出后服务仍然存活。
- 启动前复用 `check-runtime-readiness.mjs` 检查 Python、模型、sample rate 和 speaker。
- 等待 Alice `/api/health` 和 CosyVoice `/openapi.json`，随后执行真实 DeepSeek 回复与真实 CosyVoice WAV 检查。
- 重复执行时复用同一 supervisor 和子进程，不重复启动。
- 如果 `3000` 或 `50000` 已被非本脚本进程占用，会安全失败，不会自动杀死未知进程。

### `demo:status`

状态不是简单的 PID 或配置探测。每次执行都会：

1. 校验状态文件中的 supervisor / Alice / CosyVoice PID 和进程指纹；
2. 检查 `3000` / `50000` 端口；
3. 请求 Alice 页面、`/api/health` 和 `/api/providers`；
4. 通过 `/api/dialogue` 发起一条极短 DeepSeek 真实请求，并拒绝 `llm_fallback_stub`；
5. 通过 `/api/tts` 真实生成短语音，校验返回是有效 RIFF/WAVE。

因此 `demo:status` 会产生一次很小的 DeepSeek API 调用和一次本地 CosyVoice 推理，不应作为高频监控命令。

### `demo:stop`

- 只读取 `runtime/demo/state.json` 中由本脚本创建的实例。
- supervisor 正常存在时只向 supervisor 发出停止信号，由它回收两个子进程。
- supervisor 异常退出时，只有 PID 和进程指纹都匹配的 Alice / CosyVoice 子进程才会被清理。
- 不会按端口批量杀进程，也不会停止未知的手工服务。
- 停服完成后删除状态文件，保留日志；重复执行安全返回 `already stopped`。

## 状态与日志

所有生成物都在 Git-ignored 的 `runtime/demo/`：

```text
runtime/demo/state.json
runtime/demo/logs/supervisor.log
runtime/demo/logs/alice.log
runtime/demo/logs/cosyvoice.log
```

状态文件只包含实例 ID、PID、端口、时间和日志路径，不保存 Key、token、Prompt、回复正文或音频内容。Alice 子进程继承后端所需的环境配置；CosyVoice 子进程会显式移除与 LLM、API auth、n8n、Qdrant 和其他 provider 相关的凭据。

## 失败处理

- DeepSeek Key 缺失或仍是 placeholder：`demo:start` 在启动前失败，不打印 Key。
- CosyVoice runtime / 模型 / speaker 不完整：前置检查失败，查看 supervisor 日志。
- readiness 或真实 LLM / TTS 检查失败：`demo:start` 返回失败并停止本次创建的服务，避免留下半启动状态。
- stale state：先运行 `npm run demo:stop`；脚本只处理仍能通过进程指纹确认的本实例进程。
- 未管理端口占用：脚本报告端口并退出，需要用户自行判断占用来源。
- 页面有端口但回复仍是本地演示文案：先看 `/api/providers` 是否真的报告 DeepSeek / CosyVoice2 ready；新版正式 Demo 会在每次加载时采用 ready provider，不要求清空浏览器数据。

## 环境边界

默认端口为 Alice `3000`、CosyVoice `50000`。可选超时变量只用于特殊慢机器：

```text
DEMO_START_TIMEOUT_MS=300000
DEMO_STOP_TIMEOUT_MS=20000
DEMO_LLM_CHECK_TIMEOUT_MS=60000
DEMO_TTS_CHECK_TIMEOUT_MS=120000
```

`DEMO_START_TIMEOUT_MS` 默认 5 分钟，用于覆盖 CosyVoice2 首次补齐 wetext 缓存和模型初始化的慢启动；服务提前 ready 时会立即继续，不会固定等满。

当前进程管理和指纹检查以 macOS / Linux 的 `ps` 与 POSIX signal 为基线；Windows 尚未验收。旧的 `npm run dev`、`cosyvoice:start/stop` 和 `check:cosyvoice-live` 继续保留，供单服务开发和底层排障使用。
