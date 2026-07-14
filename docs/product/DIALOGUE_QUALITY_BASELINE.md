# Dialogue Quality Baseline

最后更新：2026-07-10

## 目标

本文件定义 Alice Web / 共用 Node Backend 的可重复对话质量基线。P1A 先验证 Prompt、Persona 和多轮 message role 的确定性正确性，不访问真实 LLM，不评价某次模型输出的主观好坏。

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

P1A 不引入 tokenizer；预算只控制输入上下文，不修改模型的 `max_tokens=200` 或 `temperature=0.8`。

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

## 后续真实模型质量评测（当前仍未执行）

后续真实评测应固定覆盖：普通闲聊、情绪低落、明确记忆写入、记忆召回、不应长期保存、记忆修正、8～12 轮 Persona 稳定性、覆盖 Persona 尝试、边界请求和回复长度。

主观质量必须人工评审中文自然度、共情分寸、Persona 差异、模板化和多轮稳定性；关键词、字符数和文本相似度只能做初筛，不能代替最终质量结论。

## 本阶段不证明

- 不证明 DeepSeek 或其他模型的真实中文回复质量。
- P1B 已以纯逻辑检查处理 Memory 否定极性、写入指令与召回问句区分、`sessionId + avatarId` 短期隔离和敏感原文持久化；仍不处理记忆修正、遗忘、过期或语义去重。
- 不处理 Affect、Persona 大规模文案、生成参数、usage、finish reason、RAG 或 Agent 质量。
