import { DialogueOrchestrationService } from '../backend/services/DialogueOrchestrationService.js';
import { PersonaService } from '../backend/services/PersonaService.js';
import { PromptBuilder } from '../backend/services/PromptBuilder.js';

const failures = [];

checkPersonaRegistry();
checkPromptBuilderPersonaSection();
await checkDialoguePersonaMetaAndPrompt();

if (failures.length) {
  console.error('[check-persona-flow] Persona 系统检查失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-persona-flow] ok');

function checkPersonaRegistry() {
  const service = new PersonaService();
  const personas = service.listPersonas();
  const ids = new Set(personas.map((persona) => persona.avatarId));
  ['alice', 'osa_shiro', 'osa_wambo'].forEach((id) => {
    assert(ids.has(id), `PersonaService 必须包含 ${id}。`);
  });

  const personaIds = new Set(personas.map((persona) => persona.personaId));
  assert(personaIds.size >= 3, '三个默认角色必须使用不同 personaId。');
  const serialized = JSON.stringify(personas);
  assert(!/(api[_-]?key|secret|token|bearer)/i.test(serialized), 'persona 配置不能包含 secret-shaped 字段。');
}

function checkPromptBuilderPersonaSection() {
  const persona = new PersonaService().getPersona('osa_shiro');
  const prompt = new PromptBuilder().build({ persona });
  assert(prompt.includes('Persona 核心身份与关系'), 'PromptBuilder 必须包含 persona 核心身份标题。');
  assert(prompt.includes('Shiro'), 'PromptBuilder 必须注入角色名称。');
  assert(prompt.includes('Persona 边界'), 'PromptBuilder 必须注入对话边界。');
}

async function checkDialoguePersonaMetaAndPrompt() {
  let receivedPrompt = '';
  const service = new DialogueOrchestrationService({
    llmService: {
      chat: async ({ systemPrompt }) => {
        receivedPrompt = systemPrompt;
        return 'persona mock reply';
      }
    }
  });
  const result = await service.run({
    message: 'persona flow check',
    provider: 'openai',
    model: 'gpt-4o-mini',
    avatarId: 'osa_wambo',
    options: { useMemory: false, useRag: false, useWorkflow: false }
  });

  assert(result.meta?.persona?.avatarId === 'osa_wambo', '/api/dialogue meta.persona 必须记录 avatarId。');
  assert(result.meta?.persona?.personaId === 'wambo_default', '/api/dialogue meta.persona 必须记录 personaId。');
  assert(receivedPrompt.includes('Wambo'), '真实 provider prompt 必须包含当前角色 persona。');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
