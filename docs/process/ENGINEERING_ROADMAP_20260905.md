# Alice 阶段复核与工程路线

日期：2026-09-05  
检查基线：`2d0692e`（2026-08-11），检查开始时工作区干净。  
目标：让现有本地 Alice 主链路更可复现、稳定、可诊断，再依据实测改进 Core 和首音体验。  
状态：阶段检查已完成；以下 E1–E4 为建议执行顺序，尚未实施。

## 1. 当前阶段与本轮决策

**Alice 处于本地可测试 MVP 的工程加固阶段；产品价值与公开发布条件仍未成立。**

用户本轮选择“工程能力优先”。这替代了 8 月审核中“下一轮先做 5 人预试、10 人会话与 7 天复访”的执行优先级；原有产品判断和评估门槛仍保留，招募与复访暂不作为近期工程任务的完成条件。工程优先不自动恢复此前暂缓的 VoxCPM2 安装、TTS 真实对照，也不意味着扩展 Provider、重构架构或启动移动端。

| 阶段 / 工作线 | 当前判断 | 证据与限制 |
| --- | --- | --- |
| Phase 1 架构基座 | 已建立 | 原生 Web 模块、Node routes/services、EventBus/StateStore 与 renderer adapter 边界已存在。 |
| Phase 2 交互 MVP | 历史已收口，本轮自动化及 HTTP smoke 通过 | 默认角色、对话、状态回收、上传拒绝和资源路径可回归；本轮没有重新做浏览器视觉验收。 |
| Phase 3 智能能力基线 | 已建立 | `/api/dialogue`、Memory、本地 RAG、workflow/agent 边界有检查；不等于真实外部 workflow 或通用 Agent 产品已验收。 |
| Phase 4 部署安全 | 只有基线 | 单 token、CORS、限流、上传隔离、脱敏与 requestId 已实现；公开用户鉴权、HTTPS、部署与分发仍不在已完成范围。 |
| Phase 5 Companion Core / VRM | 基础能力已落地，当前继续加固 | SQLite 记忆、Persona/Affect、`dialogue.v1`、VRM 表现和普通入口已有实现与历史验收；长期关系效果未验证。 |
| P1 / P2 / P3 / P5 专项 | 保留历史收口结论 | 分别指对话质量、音频/口型、可观测性、连续播放，不能与全项目 Phase 编号混用；P5 连续性通过不代表首音足够快。 |
| TTS 扩展 | CosyVoice2 有历史 live；其他目标仅代码接入 | VoxCPM2、Qwen3-TTS、Fish Audio、self-hosted 的真实可用性仍待验收。 |
| Phase 6 / 7 远期方向 | 未作为本轮执行阶段 | 样本/微调、前端框架升级、更多具身能力均不能由旧路线标题推断为已启动。 |

事实入口：[当前状态](../project-memory/CURRENT_STATUS.md)、[架构](../architecture/ARCHITECTURE.md)、[Dialogue 契约](../contracts/DIALOGUE_CONTRACT.md)。[8 月产品审核](../reports/ALICE_PROJECT_AUDIT_20260803.md)继续保留产品假设和历史评估，近期工程执行顺序以本文为准。

## 2. 本轮验证与发现

### 本轮实际执行

| 检查 | 结果 | 能证明什么 |
| --- | --- | --- |
| `env -i PATH="$PATH" TMPDIR="$TMPDIR" npm run check` | 通过 | 全量现有静态/逻辑/fixture 回归，包括 12 个对话行为固定用例。Node 为 `v22.23.2`，npm 为 `10.9.8`。 |
| `node scripts/smoke-test.mjs`，指向本轮隔离服务 | 通过 | 真实 HTTP 路由、Stub/Mock、临时 SQLite、Memory 与资源可达性；不证明真实 LLM/TTS。 |
| `node scripts/cosyvoice/check-runtime-readiness.mjs --no-endpoint`，干净环境 | 通过 | 默认目录模型文件、24kHz 配置和“中文女”speaker 可读取；未检查服务 endpoint，也未生成新音频。 |
| `node scripts/voxcpm2/check-runtime-readiness.mjs`，干净环境 | 失败：安装缺口 | 默认模型目录缺 config、模型与 AudioVAE；独立 Python 导入报 `No module named 'torch'`。这是外部运行时未就绪，不是主应用回归失败。 |

HTTP smoke 首次因沙箱禁止本机监听而返回 `EPERM`；经执行权限审核后，临时启动器把监听限制在 `127.0.0.1` 的随机空闲端口，导入现有 backend 并运行原 smoke 脚本。子进程不加载 `.env`，不继承真实 Provider 配置，SQLite、TTS 配置目录及上传目录全部位于新建临时目录。结束后已停止本轮服务并删除临时目录；没有启动完整 Demo 或访问用户数据库。

本轮未执行 `demo:start/status`、真实 DeepSeek 请求、CosyVoice2 合成、任何 Provider 真实对照、模型下载或浏览器 QA；未读取当前凭据，因此不把历史凭据状态当作本日检查结果。

### 需要处理的工程缺口

1. **文档与检查固化了旧默认值。** 开发指南仍写“无 `.env` 时默认 Stub + Mock”，而源码与当前 TTS 策略是 Stub + CosyVoice2，失败后由浏览器系统语音兜底；`check-llm-provider-flow` 还断言旧文案存在。因此全量检查通过并不能发现这处事实漂移，下一任务须同时修正文档和相关断言。
2. **真实验收证据需要按日期分层。** 7–8 月的 DeepSeek、长音频和 VRM 结果仍是有效历史基线，但不能写成 9 月复测通过；本轮只补了零费用回归和运行时文件预检。
3. **首音是已记录的性能瓶颈。** 7 月 31 日 54 字首播 p50/p90 为 `12.010/15.337s`；8 月 10 日两条短中文 CosyVoice2 Audio Result ready 为 `4658/6020ms`。文本、指标起点和样本量不同，不能把两组数字直接比较为性能改善。还需区分 LLM、TTS 生成、连续性缓冲与浏览器播放耗时。
4. **默认体验依赖本机资源。** 当前 manifest 指向 Git-ignored 的 `girl.vrm`，Three.js/VRM 模块通过固定版本 CDN 加载，CosyVoice2 依赖仓库外运行时；“本地可运行”不等于“干净 clone 即可完整运行”或“完全离线”。不为此自动提交模型或改变资产授权范围。
5. **兼容窗口已到复核时间。** `meta.json` 兼容层仍存在，原计划允许从 2026-08-16 起在条件满足后移除。正式 registry 已为 manifest-only，但项目外部导入脚本依赖情况未确认；保留兼容，先记录复核结论，不能仅因日期过期就删除。

## 3. 后续任务：按 E1 → E2 → E3 → E4 执行

E1–E3 的第一批目标是稳定现有能力。每项独立验收、同步项目记忆；发现阻塞先收口，不把新问题混成无边界重构。下述轮数为建议验收默认值，不是已经取得的结果。

### E1：收口可复现基线与文档一致性（下一任务）

- [ ] 修正 [开发指南](../guides/DEVELOPMENT_GUIDE.md) 的无配置启动说明，并调整 [LLM provider 检查](../../scripts/check-llm-provider-flow.mjs) 中对应旧文案断言。产品默认保持 CosyVoice2；Mock 只用于显式测试。
- [ ] 将本轮隔离 smoke 的环境隔离、临时数据、端口选择和停服清理步骤固化到开发/验收说明；区分零费用检查、运行时预检、真实 live，明确 `demo:status` 会调用真实服务。
- [ ] 在验收说明中列清默认 VRM、本地 runtime、CDN 依赖及缺失时的判断方法；记录 legacy 复核未满足外部依赖确认条件，暂保留兼容层。只处理活跃入口，不搬动历史文件。
- [ ] 执行受影响专项、全量 `npm run check`、隔离 smoke 与文档链接检查，更新状态和风险。

**验收：** 新接手者能从说明中正确选择零费用或真实运行路径；指南、源码默认值、检查断言一致；临时测试不访问真实配置或用户数据，不留下服务；现有回归通过。

**接口：** 不改公开 API、数据 schema、默认模型、Provider 集合或 npm 命令名称。此任务不安装新依赖，不要求恢复真实 TTS 对照。

### E2：复验连续对话与故障恢复

- [ ] 在实际本机浏览器上复验普通入口与 `?debug=1`，以现有 DeepSeek + CosyVoice2 + Alice 为唯一主链；真实调用在进入该任务时按其验收范围执行，不在本次规划中运行。
- [ ] 使用合成的非敏感测试内容完成至少 20 轮连续对话、累计运行至少 30 分钟，覆盖记忆关闭/开启/清除、刷新恢复和连续两轮音频；另复验一次 90 秒以上真实音频的状态与口型生命周期。
- [ ] 对生成期间取消、播放中静音、快速替换发言、LLM 故障、TTS 故障及恢复各重复两次。故障注入只操作本轮拥有的测试服务或测试配置，不停用户现有服务。
- [ ] 复用现有 requestId、`meta.trace`、TTS timing 和 Debug，记录文字可见、首音、段间 gap、fallback 与最终状态；报告区分正常轮次与故障注入。发现回归时先做最小复现，再修对应生命周期边界。

**验收：** 正常轮次无意外 Stub/系统语音降级；取消后无晚到播放和旧回复污染；结束后 `idle`、`speaking=false`、lip-sync inactive、口型归零；无新增未处理异常。UI 隐藏 Debug 不影响内部诊断。环境未就绪或 live 跳过明确记为未验收。

**接口：** 沿用 `dialogue.v1`、统一 Audio Result 和同一个 AudioManager/Presentation 生命周期；不新建播放器或流式协议。

### E3：加固 Dialogue / Memory / Persona 的多轮联动

- [ ] 保留现有 12 个行为用例，补齐一组跨层验收记录：当前轮禁止建议后再允许建议、否定偏好写入与召回、召回问句不写入、关闭记忆后不继续持久化、清除短期与清除全部的差异、重启恢复、session/avatar 隔离，以及敏感用户与 assistant 同轮回复不落库。
- [ ] 先复用现有 Memory、SQLite、Persona、behavior 检查；只给未覆盖的跨层边界或 E2 的实际失败增加回归，不重复已有实现断言。敏感防线使用明显虚构的测试内容，绝不读取用户旧库。
- [ ] 对确有失败的行为在现有 PromptBuilder、行为策略、MemoryService/Repository 边界内修复；没有失败则交付覆盖映射和验收结论，不为产生代码改动而扩张自动记忆。
- [ ] 修改真实对话行为后，用既有固定集做一次真实 DeepSeek 复验；独立记录截断、受控重写次数、fallback 和耗时，自动化通过不替代人工中文判断。

**验收：** 确定性记忆/隔离用例全部通过；真实固定集不新增最终行为违规、截断或意外 fallback；角色切换不串历史；关闭/清除的 API 与 UI 语义一致。保留默认关闭的记忆同意和现有敏感写入防线。

**接口：** 默认保持现有 schema、短期会话范围和公开字段。更改记忆保存策略、扩大自动抽取或增加关系系统须另立任务，不混入本轮加固。

### E4：形成首音性能决策，候选真实对照继续受控后置

- [ ] 先为当前 CosyVoice2 重建同机基线：复用既有 16/26/54/95 字测试文本，每档至少 3 次；冷启动与热运行分开。Node 探针的模拟播放结果与真实浏览器结果分列，p50/p90 标注样本量。
- [ ] 分开报告 LLM/重写、TTS request→ready、ready→play、text-visible→play、最大 gap、underrun、取消/fallback；判断主要耗时来自生成还是缓冲，不能用“音频 ready”冒充“用户听到首音”。
- [ ] 没有新的实测依据时保留 P5 分段/双预取策略，不重做已被否决的 CPU 调度、延迟第二段或 PCM streaming 方案。
- [ ] VoxCPM2 只作为已接入候选。用户明确恢复安装与对照、同意依赖和约 5 GB 模型开销后，才执行其 setup、MPS readiness、两轮中文、故障与取消复验，再做顺序对照；此前保持“未安装完成 / 未 live 验收”。Qwen3/Fish/self-hosted 同样不自动恢复真实验收或扩增候选。

**验收：** 交付可复现的指标、瓶颈归因和保留/继续实验结论。建议候选进入默认策略前，至少在同机同文本下中长回复首播 p50 改善 30%、p90 不恶化、最大 gap 不超过 300ms，且听感、取消、fallback 和 idle 验收无回归；这些是拟定工程门槛，并非现有达标事实。即使候选过门槛，切换默认 Provider 仍单独形成可审阅变更。

## 4. 范围与完成规则

- 近期不进入公网发布、多用户账户、iOS、框架迁移、Qdrant/embedding、Agent 扩展、微调、关系等级、新 Avatar 或大规模动作扩充；这些都没有成为本次工程优先选择的隐含任务。
- 公开发布前另行处理模型/动作授权、正式访问控制及部署条件；本机 QA 和默认资源存在不能充当分发许可证据。
- 保留 `/api/dialogue` 主入口、`dialogue.v1`、后端 secret/Memory/RAG 边界与 renderer 无关语义。新增 API/配置/schema 若确有必要，先补具体设计及对应契约，不由执行者顺手扩张。
- 每项结果写回 [CURRENT_STATUS](../project-memory/CURRENT_STATUS.md) 和对应权威文档；新决策/风险写入 [DECISION_LOG](../project-memory/DECISION_LOG.md) / [RISKS_AND_TODO](../project-memory/RISKS_AND_TODO.md)。真实验证记录日期、环境、命令、成功/失败/跳过，历史结果保持原日期。
- 本轮只交付检查与规划文档，没有实现 E1–E4，没有修改业务代码、安装依赖、清理用户数据、提交 Git、推送或创建 PR。

下一任务可直接使用：**“执行工程路线 E1：收口可复现基线与文档一致性。先读项目记忆及本路线，修正开发指南与检查里的旧 Mock 默认说明，固化隔离 smoke 方法，验证并同步记忆；保持业务默认与公开契约，不启动新的 Provider 验收。”**
