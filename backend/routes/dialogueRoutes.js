import { maxJsonBodyBytes } from '../config/serverConfig.js';
import { readJsonBody } from '../utils/request.js';
import { sendError, sendJson, sendOk } from '../utils/response.js';
import { DialogueOrchestrationService } from '../services/DialogueOrchestrationService.js';
import { LLMService } from '../services/LLMService.js';

const llmService = new LLMService();
const dialogueOrchestrationService = new DialogueOrchestrationService({ llmService });

export async function handleChat(req, res) {
  const body = await readJsonBody(req, maxJsonBodyBytes);
  const reply = await llmService.chat({
    message: body.message || '',
    provider: body.provider,
    model: body.model,
    systemPrompt: body.systemPrompt
  });
  sendJson(res, 200, { reply });
}

export async function handleDialogue(req, res) {
  try {
    const body = await readJsonBody(req, maxJsonBodyBytes);
    const result = await dialogueOrchestrationService.run(body);
    sendOk(res, 200, result);
  } catch (error) {
    sendError(res, error.statusCode || 500, error, { legacy: false });
  }
}
