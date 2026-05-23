const MAX_SYSTEM_PROMPT_CHARS = 4000;
const MAX_RAG_PASSAGE_CHARS = 700;

export class PromptBuilder {
  build({ systemPrompt, memory, rag } = {}) {
    const sections = [
      normalizeSystemPrompt(systemPrompt) || '你是 Alice，一个简短回复的 3D 数字伙伴。'
    ];

    const memorySection = buildMemorySection(memory);
    if (memorySection) sections.push(memorySection);

    const ragSection = buildRagSection(rag);
    if (ragSection) sections.push(ragSection);

    return sections.join('\n\n').slice(0, MAX_SYSTEM_PROMPT_CHARS);
  }
}

function buildMemorySection(memory) {
  if (!memory?.used || !memory.context?.length) return '';

  const lines = memory.context
    .map((item) => `${item.role === 'assistant' ? 'Alice' : 'User'}: ${item.content}`)
    .join('\n');
  return `短期对话记忆（仅供当前会话参考）：\n${lines}`;
}

function buildRagSection(rag) {
  if (!rag?.used || !rag.passages?.length) return '';

  const lines = rag.passages
    .map((passage, index) => {
      const title = passage.title || passage.source || `source-${index + 1}`;
      const content = String(passage.content || '').slice(0, MAX_RAG_PASSAGE_CHARS);
      return `[${index + 1}] ${title}\n${content}`;
    })
    .join('\n\n');
  return `本地知识检索结果（优先参考，不能编造未提供的细节）：\n${lines}`;
}

function normalizeSystemPrompt(value) {
  return String(value || '').trim().slice(0, MAX_SYSTEM_PROMPT_CHARS);
}
