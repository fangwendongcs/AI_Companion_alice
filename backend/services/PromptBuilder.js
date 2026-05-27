const MAX_SYSTEM_PROMPT_CHARS = 4000;
const MAX_LONG_TERM_MEMORY_CHARS = 240;
const MAX_RAG_PASSAGE_CHARS = 700;
const MAX_WORKFLOW_CHARS = 700;

export class PromptBuilder {
  build({ systemPrompt, memory, rag, workflow } = {}) {
    const sections = [
      normalizeSystemPrompt(systemPrompt) || '你是 Alice，一个简短回复的 3D 数字伙伴。'
    ];

    const memorySection = buildMemorySection(memory);
    if (memorySection) sections.push(memorySection);

    const ragSection = buildRagSection(rag);
    if (ragSection) sections.push(ragSection);

    const workflowSection = buildWorkflowSection(workflow);
    if (workflowSection) sections.push(workflowSection);

    return sections.join('\n\n').slice(0, MAX_SYSTEM_PROMPT_CHARS);
  }
}

function buildMemorySection(memory) {
  if (!memory?.used) return '';

  const sections = [];
  if (memory.longTerm?.items?.length) {
    const longTermLines = memory.longTerm.items
      .slice(0, 6)
      .map((item) => `- [${item.type || 'fact'}] ${String(item.content || '').slice(0, MAX_LONG_TERM_MEMORY_CHARS)}`)
      .join('\n');
    sections.push(`长期记忆（用户明确要求保存，可清除，仅供陪伴连续性参考）：\n${longTermLines}`);
  }

  if (memory.context?.length) {
    const lines = memory.context
    .map((item) => `${item.role === 'assistant' ? 'Alice' : 'User'}: ${item.content}`)
    .join('\n');
    sections.push(`短期对话记忆（仅供当前会话参考）：\n${lines}`);
  }

  return sections.join('\n\n');
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

function buildWorkflowSection(workflow) {
  if (!workflow?.used || !workflow.result) return '';

  return `工具调用结果（仅作为上下文，不要声称已执行未确认动作）：\n${JSON.stringify(workflow.result).slice(0, MAX_WORKFLOW_CHARS)}`;
}

function normalizeSystemPrompt(value) {
  return String(value || '').trim().slice(0, MAX_SYSTEM_PROMPT_CHARS);
}
