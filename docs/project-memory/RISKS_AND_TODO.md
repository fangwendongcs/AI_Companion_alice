# Risks And Todo

最后更新：2026-07-03

## 当前风险

| 风险 | 等级 | 当前处理 | 需要检查 |
| --- | --- | --- | --- |
| CosyVoice2 live 依赖本地 Python、模型、speaker、端口和官方 runtime。 | 中 | `mock` 保持默认可用；CosyVoice2 有独立脚本和文档。 | `docs/guides/COSYVOICE_RUNTIME.md`、`scripts/cosyvoice/*` |
| VRM / VRMA / FBX 动作质量无法只靠自动化证明。 | 中 | 外部动作进入 QA-only gate；产品动作需视觉验证。 | `docs/architecture/VRM_MOTION_READINESS.md`、`docs/architecture/VRM_MOTION_QUALITY_V1.md` |
| 部分早期文档是历史阶段记录，容易被误读为当前状态。 | 中 | 新建 project-memory 作为导航；docs index 标注历史参考。 | `docs/project-memory/DOCUMENT_AUDIT.md` |
| Alice 模型、测试模型、motion 素材授权需要正式分发前复核。 | 中 | 已有 motion license 目录；正式产品化前不能跳过授权检查。 | `docs/assets/licenses/MOTION_ASSET_LICENSES.md`、`docs/architecture/VRM_MOTION_READINESS.md` |
| `runtime/cosyvoice/` 是本地未提交 runtime，其他机器默认不存在。 | 低 | 文档和脚本说明准备流程。 | `.gitignore`、`docs/guides/COSYVOICE_RUNTIME.md` |

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

## 下一步建议

1. 对 CosyVoice2 做一轮可复现本机 live 验证，记录是否可用、延迟、音质和降级表现。
2. 对 Shiro / Wambo / local girl VRM 做浏览器手动验收，补充截图或 QA 记录。
3. 若新增 provider、renderer 或 API 字段，先更新对应 contract，再改客户端。
4. 公网演示前，设计正式访问控制，不要把单 token 当完整登录系统。
