# Risks And Todo

最后更新：2026-07-14

## 当前风险

| 风险 | 等级 | 当前处理 | 需要检查 |
| --- | --- | --- | --- |
| CosyVoice2 live 依赖本地 Python、模型、speaker、端口和官方 runtime。 | 中 | `mock` 保持默认可用；CosyVoice2 有独立脚本和文档。 | `docs/guides/COSYVOICE_RUNTIME.md`、`scripts/cosyvoice/*` |
| VRM / VRMA / FBX 动作质量无法只靠自动化证明。 | 中 | 外部动作进入 QA-only gate；产品动作需视觉验证。 | `docs/architecture/VRM_MOTION_READINESS.md`、`docs/architecture/VRM_MOTION_QUALITY_V1.md` |
| 部分早期文档是历史阶段记录，容易被误读为当前状态。 | 中 | 新建 project-memory 作为导航；docs index 标注历史参考。 | `docs/project-memory/DOCUMENT_AUDIT.md` |
| Alice 模型、测试模型、motion 素材授权需要正式分发前复核。 | 中 | 已有 motion license 目录；正式产品化前不能跳过授权检查。 | `docs/assets/licenses/MOTION_ASSET_LICENSES.md`、`docs/architecture/VRM_MOTION_READINESS.md` |
| 当前默认 Alice 依赖 Git-ignored 的本机 `assets/avatars/test-vrm/girl.vrm`。 | 高 | 普通页与 debug 页已固定加载该模型，缺失/损坏时明确报错并仅启用既有 fallback；不静默切回旧 GLB。 | 正式分发前确认模型授权，将二进制迁移到可发布资产路径并更新 manifest。 |
| `runtime/cosyvoice/` 是本地未提交 runtime，其他机器默认不存在。 | 低 | 文档和脚本说明准备流程。 | `.gitignore`、`docs/guides/COSYVOICE_RUNTIME.md` |
| 真实 CosyVoice2 长音频的振幅分布、口型观感和动作/表情并行质量仍依赖浏览器视觉 QA。 | 中 | 已修复 renderer 接线、旧播放竞争和 timer 提前结束；自动模拟 120 秒生命周期。 | `docs/architecture/VRM_RENDERER_MVP.md`、浏览器 Debug Panel |
| P1A/P1B 自动化只能证明 Prompt 与 Memory 的确定性逻辑，不会证明真实中文陪伴质量。 | 中 | 已建立零费用质量逻辑基线；真实模型评测必须另行授权，并使用固定用例/人工量表。 | `docs/product/DIALOGUE_QUALITY_BASELINE.md` |
| P1B 不做破坏性历史数据清洗；旧库中若曾写入敏感原文，记录不会被本轮自动删除。 | 中 | 新写入有 Service + Repository 双层拦截，检测到的旧敏感记录不会进入活动上下文；彻底擦除旧原文需要后续单独授权安全清理或重建本地库。 | `docs/architecture/PHASE5_MEMORY_ARCHITECTURE.md` |
| 完整 Demo 的 supervisor 进程管理目前以 macOS / Linux POSIX signal 与 `ps` 为基线。 | 低 | `demo:start/status/stop` 已统一托管、校验进程指纹和真实 readiness；未知端口占用时拒绝自动处理。 | `docs/guides/DEMO_RUNTIME.md`、`scripts/demo/demo-manager.mjs` |

## 2026-07-14 本地全服务启动现场记录

本次目标是同时启动 Alice Web / Backend、真实 DeepSeek LLM 和真实 CosyVoice2 TTS。最终链路可用，但暴露出以下启动可靠性问题：

| 现场问题 | 现象 / 判断 | 当前安全处理 |
| --- | --- | --- |
| 受控执行环境禁止直接监听端口 | Node 首次监听 `0.0.0.0:3000` 返回 `EPERM`；这是运行权限问题，不是 Alice 业务代码错误。 | 经明确授权后在本机环境启动；普通本地 Terminal 通常不受该限制。 |
| detached TTS 子进程不一定能跨任务存活 | `cosyvoice:start` 的 8 秒 guard 通过，但启动命令结束后，托管执行环境清理了 `nohup` 子进程；`50000` 端口随即消失，日志没有业务异常栈。 | 改用持续前台会话运行官方 FastAPI，并再次检查端口和 endpoint。 |
| “进程存在”不等于 provider 可用 | CosyVoice 模型加载和文本前端初始化需要时间；只看 PID 或短 guard 可能过早报告成功。 | 以 `GET /api/providers` 的 `cosyvoice.available=true / health.live=true` 和 `npm run check:cosyvoice-live` 为最终标准。 |
| Alice 与 CosyVoice 配置是两个边界 | FastAPI 已监听 `50000`，但 Alice 进程若仍读取 `.env` 中的空 `COSYVOICE_BASE_URL`，页面会显示 `missing_base_url`。 | 本次用不含 secret 的临时 env 覆盖文件启动 Alice；不修改或提交本地 `.env`。 |
| 本地 `.env` 的示例值会造成配置假阳性 | 示例 n8n URL 被当成真实配置，导致运行态 smoke 期望 `not_configured` 却得到其他状态；同类 readiness 的 `configured=true` 也不等于真实上游已验证。 | 本次运行覆盖中清空未使用的示例 n8n 配置；DeepSeek 和 CosyVoice 分别用真实短请求 / live WAV 验证。 |
| 重启时存在父子进程和端口竞态 | 中断 npm PTY 后，残留 `npm/node` 父子进程短时继续占用 `3000`，连续重启触发 `EADDRINUSE`。 | 先用 `lsof` 确认实际监听 PID，只终止本次启动的明确进程，确认端口释放后再启动。 |

### 后续优化点

以下 1、2、3、5、6、7 项已由 `demo:start/status/stop` 的 Node supervisor 完成；第 4 项已完成安全端口预检和拒绝误杀，但尚未自动报告未知监听 PID；第 8 项 placeholder 全局识别仍未扩张到所有业务 provider 配置。保留本节作为现场问题到实现结果的追踪记录。

1. 增加 `npm run dev:full`：由一个可控 supervisor 启动/停止 CosyVoice 与 Alice，统一转发退出信号，不依赖脱离终端的 `nohup` 子进程。
2. 增加 `npm run status`：安全输出 `3000/50000` 端口、PID、`/api/health`、LLM readiness、TTS live readiness，不打印 Key、Prompt、音频或 provider 私有地址。
3. 把 CosyVoice 启动 guard 从“等待固定秒数 + PID 存活”升级为有总超时的 endpoint readiness polling；失败时清理 PID 文件并输出精简日志尾部。
4. 启动前做端口预检；发现 `EADDRINUSE` 时报告监听 PID 和建议命令，不直接杀死未知进程。
5. 明确本地运行覆盖策略：保留 `.env` 的安全默认值，同时提供 Git-ignored 的 runtime override 入口，避免空 `COSYVOICE_BASE_URL` 与 one-shot shell 覆盖产生歧义。
6. 增加幂等的 `dev:stop` / `dev:restart`，记录并校验实际子进程，处理 stale PID，确保 Ctrl+C 能同时回收 Node 与 FastAPI。
7. 在启动成功提示中区分 `process_started`、`endpoint_ready`、`provider_ready`、`live_verified`，避免把端口开放误报为完整 LLM/TTS 链路可用。
8. 配置校验应识别 `replace_with_*`、`example.invalid` 等 placeholder，readiness 中按 `not_configured` 处理，并提供生成“最小本地 `.env`”的安全脚本，避免直接复制整份 `.env.example`。

## 2026-07-14 Demo 页面无回复 / 无声音排查记录

| 检查项 | 真实结果 | 处理 |
| --- | --- | --- |
| 浏览器是否发请求 | 页面确实发出 `/api/dialogue` 与 `/api/tts`，均为 HTTP 200。 | 不再用“端口已监听”推断页面链路可用，直接检查 Network 请求体与响应。 |
| Dialogue 是否真实 | 故障请求为 `provider=stub/model=stub`，约 3ms 返回固定本地演示文案，`meta.mode=llm_stub`。 | 后端 DeepSeek ready 且浏览器仍是历史默认时，一次性迁移到 `deepseek` 和后端默认 model。 |
| TTS 是否真实 | 故障请求为 `provider=mock`，约 2ms 返回 `mock_silence`；CosyVoice 日志没有收到对话文本。 | CosyVoice `available=true/health.live=true` 时，一次性迁移到 `cosyvoice`。 |
| `.env` / 后端 | DeepSeek Key 已配置，model 为 `deepseek-v4-flash`，Base URL 为官方 DeepSeek host；Demo 子进程将空 CosyVoice URL 安全覆盖为本机 `127.0.0.1:50000`。 | 不修改、不输出 Key；以 `/api/providers` 和真实请求结果确认运行态读取。 |
| 页面回复显示 | HTML 原设计明确只播语音、不显示文字；在 Mock 静音时表现为“完全没有回复”。 | 增加可见、`aria-live` 的当前回复区域，并显示 thinking/error 状态。 |
| 自动播放 | 修复后第二轮真实 CosyVoice 音频为 5.12 秒，浏览器采样确认非静音播放且时间持续推进。 | 保持后端音频播放链路，不改 TTS/Dialogue 契约。 |

修复后连续两轮浏览器验收均为 DeepSeek `llm_only` + CosyVoice HTTP 200。当前 Console 仍有既存 `public/models/animations/boot.fbx` 与 favicon 404；它们不影响本次 Dialogue/TTS 闭环，但应在后续独立资源清理任务中处理，避免掩盖新的 Console 错误。

## 2026-07-14 Avatar 默认模型错误排查记录

| 检查项 | 修复前真实结果 | 修复后真实结果 |
| --- | --- | --- |
| 目标资产 | 截图中的历史验证模型是 `local_girl_vrm_test`，准确文件为 `assets/avatars/test-vrm/girl.vrm`。 | 文件存在，为有效 GLB/VRM 2.0 容器；普通与 debug 页面共用该准确路径。 |
| 默认选择 | registry 默认 id 为 `alice`，其 manifest 指向 `public/models/characters/avatar_v2.glb`；debug 仅对 `girl.vrm` 做 HEAD 探测。 | `alice` 身份不变，manifest 指向 `girl.vrm`；两页均发生实际 GET 200。 |
| localStorage | 历史 `avatar_id=alice` 会持续强化旧 GLB 选择。 | 同一历史值现在稳定选择目标 VRM，刷新后仍正确，无需清空用户配置。 |
| renderer / fallback | 旧 manifest 声明 `renderer.type=default`，运行态为 `DefaultAvatarRenderer`。 | 运行态为 `VRMRenderer`；fallback 只在目标模型加载失败且无既有可用 avatar 时启用，并显示明确加载错误。 |
| 联动 | DeepSeek、CosyVoice、表情和口型曾在 local girl 测试 ID 上验证，但普通 Demo 未绑定该模型。 | 连续两轮 DeepSeek `llm_only` + CosyVoice `fallback=false`；当前 `alice/girl.vrm` 播放中捕获 E/A/U/O/I 五元音与音频振幅联动。 |

当前剩余高风险是目标 `girl.vrm` 仍被 `.gitignore` 排除且授权状态标为 local-only。当前机器 Demo 可用，但新 clone、CI 或其他机器不会自动获得该二进制；在授权明确前不应擅自提交或复制大模型文件。

## 待验证项

| 待验证 | 建议命令/方式 |
| --- | --- |
| 当前机器是否能完整跑通基础自动检查。 | `npm run check` |
| Web 页面是否无控制台错误、Avatar 可见、Shiro/Wambo VRM 可切换。 | `npm run dev` 后浏览器手动验收 `http://localhost:3000?debug=1` |
| `dialogue.v1` 是否仍满足 Web 表现层语义契约。 | `npm run check:dialogue-contract` |
| TTS provider 合约是否仍只公开 Mock / CosyVoice2。 | `npm run check:tts-provider-flow` |
| CosyVoice2 本地 runtime 是否可用。 | `npm run check:cosyvoice-runtime`、`npm run check:cosyvoice-live` |
| VRMRenderer 和 local test manifest 是否仍受 debug gate 保护。 | `npm run check:vrm-renderer-flow` |
| VRM 外部动作 QA 是否存在形变、位移、springBone 残留。 | 浏览器 debug 手动 QA，参考 `docs/architecture/VRM_MOTION_READINESS.md` |
| 真实 CosyVoice2 长音频是否全程保持 `lipSync.mode=audio-driven`，结束后口型/表情/动作是否回到 idle。 | 启动 CosyVoice2 后使用 `?debug=1` 播放 30–120 秒中文文本，观察 Debug Panel 与模型口型。 |
| Memory 修正、真正遗忘、过期和语义去重策略是否正确。 | 保持后续独立阶段；不要基于少量例子堆正则或在 P1B 扩张系统。 |
| Demo supervisor 是否能在 Windows 工作。 | 当前只在 macOS / POSIX 环境设计与验收；Windows 的 detached process、`ps` 和 signal 行为需单独实现与验证。 |

## 下一步建议

1. 对 CosyVoice2 做一轮可复现本机 live 验证，记录是否可用、延迟、音质和降级表现。
2. 对 Shiro / Wambo / local girl VRM 做浏览器手动验收，补充截图或 QA 记录。
3. 若新增 provider、renderer 或 API 字段，先更新对应 contract，再改客户端。
4. 公网演示前，设计正式访问控制，不要把单 token 当完整登录系统。
5. P1B Memory 确定性修复稳定后，再单独授权固定评测集，验证真实中文自然度、共情和多轮 Persona 稳定性。
6. 后续如需跨平台 Demo，单独实现 Windows 进程所有权与停服策略，不要弱化当前“只停止本脚本进程”的安全边界。
