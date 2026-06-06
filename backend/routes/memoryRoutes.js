import { memoryService } from '../services/runtimeServices.js';
import { sendOk } from '../utils/response.js';

export async function handleMemoryList(req, res, url) {
  const sessionId = url.searchParams.get('sessionId') || 'default';
  const avatarId = url.searchParams.get('avatarId') || 'alice';
  const limit = Number(url.searchParams.get('limit') || 20);
  const longTerm = memoryService.listLongTermMemory({
    enabled: true,
    sessionId,
    avatarId,
    limit
  });
  sendOk(res, 200, {
    sessionId,
    avatarId,
    longTerm
  });
}

export async function handleMemoryClear(req, res, url) {
  const sessionId = url.searchParams.get('sessionId') || 'default';
  const avatarId = url.searchParams.get('avatarId') || 'alice';
  const requestedScope = url.searchParams.get('scope');
  const scope = requestedScope === 'avatar' || requestedScope === 'context' ? requestedScope : 'session';
  if (scope === 'context') {
    const result = memoryService.clearShortTermContext(sessionId);
    sendOk(res, 200, {
      sessionId,
      avatarId,
      scope,
      ...result
    });
    return;
  }

  const result = memoryService.clearLongTermMemory({
    sessionId,
    avatarId,
    scope
  });
  if (scope === 'session') memoryService.clearSession(sessionId);
  sendOk(res, 200, {
    sessionId,
    avatarId,
    scope,
    ...result
  });
}
