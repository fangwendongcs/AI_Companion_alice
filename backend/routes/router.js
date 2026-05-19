import { handleAvatarRegistry, handleAvatarUpload } from './avatarRoutes.js';
import { handleChat, handleDialogue } from './dialogueRoutes.js';
import { handleHealth } from './healthRoutes.js';
import { handleTTS } from './ttsRoutes.js';
import { serveStatic } from '../services/StaticAssetService.js';
import { sendJson } from '../utils/response.js';

export async function routeRequest(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (url.pathname === '/api/health') {
    handleHealth(req, res);
    return;
  }

  if (url.pathname === '/api/chat' && req.method === 'POST') {
    await handleChat(req, res);
    return;
  }

  if (url.pathname === '/api/dialogue' && req.method === 'POST') {
    await handleDialogue(req, res);
    return;
  }

  if (url.pathname === '/api/tts' && req.method === 'POST') {
    await handleTTS(req, res);
    return;
  }

  if (url.pathname === '/api/avatars' && req.method === 'GET') {
    await handleAvatarRegistry(req, res);
    return;
  }

  if (url.pathname === '/api/avatars' && req.method === 'POST') {
    await handleAvatarUpload(req, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  await serveStatic(url.pathname, req.method, res);
}
