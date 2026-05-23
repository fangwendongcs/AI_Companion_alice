# Local Knowledge Guide

Phase 3.5 建立的是本地知识源和简单检索边界，不是完整 RAG 产品。

## 知识源目录

默认目录：

```text
data/knowledge/
```

该目录不在 `public/` 下，运行时前端不会直接访问这些文件。后续 RAG 只能通过后端 service 读取和裁剪后再进入 `/api/dialogue` 编排。

## 支持格式

当前支持：

- `.md`
- `.markdown`
- `.json`

Markdown 示例：

```markdown
# Alice Digital Companion

Alice 是一个可替换角色、可点击交互、可接入智能能力的数字伙伴项目。
```

JSON 示例：

```json
[
  {
    "id": "phase3-memory",
    "title": "Phase 3 Memory",
    "content": "Phase 3.3 实现后端进程内短期 Memory。"
  }
]
```

## 当前检索能力

`SimpleRetrieverService` 使用简单关键词匹配：

- 不做 embedding。
- 不接 Qdrant。
- 不调用外部网络。
- 返回 `passages / sources / matchedTerms`，用于调试本地检索边界。

## 当前不做

- 不上传私有文档。
- 不把知识文件放进 `public/`。
- 不把 RAG prompt 拼接放进前端。
- 不接 n8n RAG。
- 不做长期向量索引。

## 验收命令

```bash
npm run check:knowledge-flow
npm run check
```

Phase 3.6 才会把本地检索结果接入 `/api/dialogue options.useRag=true` 的真实回复链路。
