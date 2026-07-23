import { maxJsonBodyBytes } from '../config/serverConfig.js';
import { readJsonBody } from '../utils/request.js';
import { sendError, sendJson, sendOk } from '../utils/response.js';
import { dialogueOrchestrationService, llmService } from '../services/runtimeServices.js';
import { serverLogger } from '../utils/serverLogger.js';
import {
  createDialogueLogEntry,
  nowMs
} from '../utils/dialogueObservability.js';

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
  const requestStartedAt = nowMs();
  let body = {};
  try {
    body = await readJsonBody(req, maxJsonBodyBytes);
    const result = await dialogueOrchestrationService.run(body, {
      requestId: req.requestId
    });
    const logEntry = createDialogueLogEntry({
      requestId: req.requestId,
      requestBody: body,
      result,
      requestStartedAt
    });
    const logMethod = result.meta?.fallback?.applied ? 'warn' : 'info';
    serverLogger[logMethod](logEntry);
    sendOk(res, 200, result);
  } catch (error) {
    serverLogger.warn(createDialogueLogEntry({
      requestId: req.requestId,
      requestBody: body,
      error,
      requestStartedAt
    }));
    sendError(res, error.statusCode || 500, error, { legacy: false });
  }
}
