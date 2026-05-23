# Alice Digital Companion

Alice Digital Companion 是一个 AI 数字伙伴项目，当前以本地 Node 后端、Vanilla JavaScript 前端、Three.js 角色渲染和可替换 avatar manifest 为核心。

项目当前支持 Alice、Shiro、Wambo 三个角色切换，支持点击头部、身体、手臂和腿部触发动作。

默认对话 provider 是 stub，适合无 API Key 的本地演示。真实 provider 必须通过后端环境变量配置，前端不保存密钥。

Phase 3 当前正在逐步接入智能能力：短期 Memory 已完成，RAG 先使用后端本地知识源和简单检索边界，不直接接 Qdrant。
