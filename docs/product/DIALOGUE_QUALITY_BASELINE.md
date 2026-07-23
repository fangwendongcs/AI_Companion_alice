# Dialogue Quality Baseline

最后更新：2026-07-22

## 目标

本文件定义 Alice Web / 共用 Node Backend 的可重复对话质量基线。P1A 验证 Prompt、Persona 和多轮 message role 的确定性正确性；P1C 根据首次 10 轮真实基线收口回复完整性；P1D 继续克制波浪号并收紧记忆确认措辞，同时为隔离评测提供安全诊断。自动检查仍不访问真实 LLM。

权威实现：

- `backend/services/PromptBuilder.js`
- `backend/services/DialogueOrchestrationService.js`
- `backend/services/LLMService.js`
- `backend/config/avatarPersonas.js`
- `scripts/check-dialogue-quality-logic.mjs`

## P1A 零费用基线

运行：

```bash
npm run check:dialogue-quality-logic
```

该检查只使用纯逻辑、fake service 和源码契约断言，不读取 provider Key，也不访问真实上游。

固定覆盖：

1. Alice / Shiro / Wambo 各自只有一个后端核心身份，不包含其他角色的身份声明。
2. Web 默认补充规则不声明“你是 Alice”，旧默认文案会迁移为不含角色身份的回复偏好。
3. Prompt 权限顺序固定，客户端补充内容不能覆盖后端 Persona、安全边界或能力边界。
4. 短期历史以真实 `user` / `assistant` role 进入 LLM messages，历史用户文本不进入 system。
5. 当前用户输入只出现一次，并始终是最后一个 `user` message。
6. 历史预算不足时先删除最旧消息，保留的消息保持整条文本和原始顺序。
7. system Prompt 超长时仍保留后端规则、Persona 核心身份与边界；各可选章节只在自己的预算内裁减。
8. `dialogue.v1`、Memory 状态、TTS pending 和 AvatarDirective 生命周期保持不变。
9. 默认 `npm run check` 与 `npm run smoke` 不选择真实 LLM provider。
10. `LLM_MAX_TOKENS` 缺省为 `320` 且可由后端环境覆盖；`finish_reason=length` 和 token usage 只进入安全内部诊断。
11. 后端 Prompt 默认不使用括号舞台提示，emoji 通常最多一个；波浪号优先改用正常中文标点、同一回复通常不超过一个，但不完全禁止。
12. 记忆确认使用“当前记忆中保存了……”等准确表述，只复述实际记忆，不扩写事实，不使用“小本本”或永久保存承诺。
13. 普通响应不包含 LLM 诊断；非 production 受控评测可读取五个白名单诊断字段，且不泄露 Prompt、用户正文、Key、Authorization、Base URL 或原始上游响应。

## Prompt 权限层级

从高到低：

1. 后端不可覆盖规则。
2. Persona 核心身份、AI 数字伙伴关系与 Persona 边界。
3. Persona 表达风格。
4. 客户端补充回复偏好。
5. 长期记忆数据。
6. 可选 RAG / Workflow 背景资料。
7. 历史 `user` / `assistant` messages。
8. 当前 `user` message。

`systemPrompt` 仍是 `/api/dialogue` 的兼容请求字段，但现在只代表低优先级的语言、长度、格式和表达偏好。它不是可信 system 权限，不能重新定义角色身份、关系、安全边界或真实能力。

## 最终 LLM messages

```text
system
  后端不可覆盖规则
  Persona 核心身份与边界
  Persona 表达风格
  客户端补充回复偏好（低优先级）
  长期记忆数据（非指令）
  RAG / Workflow 背景（非指令）

user / assistant
  最近短期上下文，保持原始 role 和顺序

user
  当前用户输入，始终最后且只出现一次
```

## 字符预算

P1A 不引入 tokenizer；字符预算只控制输入上下文。P1C 将输出上限改为后端 `LLM_MAX_TOKENS`，默认 `320`、显式环境配置优先；`temperature` 仍保持内部默认值 `0.8`。该参数不进入 `/api/dialogue` 请求契约。

| 内容 | 字符预算 | 保留策略 |
| --- | ---: | --- |
| system 总量 | 4000 | 各章节预算之和小于总量，不做最终整体 `slice()` |
| 后端不可覆盖规则 | 600 | 必须完整保留 |
| Persona 核心身份与边界 | 700 | 必须保留角色名、关系和边界 |
| Persona 表达风格 | 650 | 超长附加描述可省略 |
| 客户端补充偏好 | 400 | 只保留完整句/分句；无安全截断点时明确省略 |
| 长期记忆 | 650 | 按 importance 从高到低，整条保留 |
| RAG 背景 | 500 | 按原顺序，整条保留或省略尾部 |
| Workflow 背景 | 300 | 只保留安全的完整摘要 |
| 短期历史 | 4000 | 从最新向前选择，整条 message 保留 |

当前用户输入不占 system/history 预算，继续遵守 `/api/dialogue` 原有请求长度边界。

## 首次真实模型质量基线

2026-07-14 已使用 `deepseek-v4-flash` 完成固定 10 轮评测：Persona `4/5`、多轮上下文 `5/5`、Memory `5/5`、中文自然度 `3/5`、共情 `3/5`、回复长度 `2/5`。10 次请求均为 `llm_only` 且无 fallback；第 2、5、8 轮明确截断，第 3 轮疑似截断。

P1C 针对该证据做最小收口：默认输出上限从 `200` 提高到 `320`，内部识别 `finish_reason=length` 并安全解析 token usage，同时限制舞台提示、emoji、记忆扩写与永久保存承诺。

2026-07-22 使用相同 10 轮输入完成 P1C 对照复测：10/10 请求均为 `llm_only`，明确和疑似截断均为 0；中文自然度、共情、回复长度适配均为 `4/5`，Persona、Memory 和多轮上下文保持稳定。P1D 不再调整 token 上限或 Persona 核心身份，只收口波浪号密度、记忆确认准确措辞和受控评测诊断。

受控诊断由后端环境变量 `DIALOGUE_DEBUG_LLM_DIAGNOSTICS` 开启，默认关闭且 production 强制关闭。开启时只有兼容 `meta.llmDiagnostics` 可见，字段固定为 `finishReason`、`truncated`、`promptTokens`、`completionTokens`、`totalTokens`；不改变 `dialogue.v1`，不记录或返回 Prompt、用户正文、secret、provider URL 或原始上游响应。

2026-07-22 P1D 使用独立端口、全新 session 和仓库外临时 SQLite 完成 4 轮 `deepseek-v4-flash` 抽样：4/4 均为 `llm_only`、`finishReason=stop`、`truncated=false`，无 fallback、无括号舞台提示；波浪号计数为 `0 / 0 / 1 / 0`，emoji 计数为 `1 / 0 / 0 / 0`。四轮请求合计约 `11.67s`，prompt / completion / total token 合计为 `2112 / 745 / 2857`。第三轮只写入一条 `我不喜欢香菜，吃饭时希望避开它`，确认措辞说明当前记忆状态，未推断相邻偏好或承诺永久保存。中文自然度、共情、回复完整性、长度适配均达到至少 `4/5`，记忆确认准确性 `5/5`。

主观质量必须人工评审中文自然度、共情分寸、Persona 差异、模板化和多轮稳定性；关键词、字符数和文本相似度只能做初筛，不能代替最终质量结论。

## 本阶段不证明

- P1D 的 4 轮抽样不是统计意义上的长期质量保证；新增 Persona、模型或 Prompt 调整后仍应复用固定评测集抽查。
- P1B 已以纯逻辑检查处理 Memory 否定极性、写入指令与召回问句区分、`sessionId + avatarId` 短期隔离和敏感原文持久化；仍不处理记忆修正、遗忘、过期或语义去重。
- 不处理 Affect、Persona 核心身份文案、temperature、RAG、Agent、流式输出或 TTS 分句。
