import {
  maxJsonBodyBytes,
  providerBaseUrlEnv,
  providerBaseUrls,
  providerKeyEnv
} from '../config/serverConfig.js';
import { createHttpError } from '../utils/httpError.js';
import { fetchWithTimeout, readJsonBody } from '../utils/request.js';
import { sendError, sendJson, sendOk } from '../utils/response.js';
import { DialogueOrchestrationService } from '../services/DialogueOrchestrationService.js';

const dialogueOrchestrationService = new DialogueOrchestrationService();

export async function handleChat(req, res) {
  const body = await readJsonBody(req, maxJsonBodyBytes);
  const provider = normalizeProvider(body.provider);
  const baseUrl = resolveProviderBaseUrl(provider);
  const apiKey = resolveApiKey(provider);

  if (!baseUrl) {
    sendJson(res, 400, {
      error: `Missing base URL. Set ${providerBaseUrlEnv[provider]} in the backend environment.`
    });
    return;
  }

  if (!apiKey) {
    sendJson(res, 400, {
      error: `Missing API key. Set ${providerKeyEnv[provider] || 'LLM_API_KEY'} or LLM_API_KEY in the backend environment.`
    });
    return;
  }

  const upstream = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: body.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: body.systemPrompt || '你是 Alice，一个简短回复的 3D 数字伙伴。' },
        { role: 'user', content: body.message || '' }
      ],
      max_tokens: 200,
      temperature: 0.8
    })
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    sendJson(res, upstream.status, { error: text.slice(0, 1000) });
    return;
  }

  const data = JSON.parse(text);
  sendJson(res, 200, {
    reply: data.choices?.[0]?.message?.content?.trim() || ''
  });
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

function normalizeProvider(provider) {
  const value = String(provider || 'openai').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(providerBaseUrls, value)) {
    throw createHttpError(`Unsupported provider: ${value}`, 400);
  }
  return value;
}

function resolveProviderBaseUrl(provider) {
  const envName = providerBaseUrlEnv[provider];
  const envValue = envName ? process.env[envName] : '';
  const baseUrl = envValue || providerBaseUrls[provider] || '';
  return baseUrl ? sanitizeBaseUrl(baseUrl) : '';
}

function resolveApiKey(provider) {
  const envName = providerKeyEnv[provider];
  const value = ((envName && process.env[envName]) || process.env.LLM_API_KEY || '').trim();
  assertSafeApiKey(value, envName || 'LLM_API_KEY');
  return value;
}

function assertSafeApiKey(value, envName) {
  if (!value) return;
  if (/[\r\n]/.test(value) || /[^\x20-\x7e]/.test(value)) {
    throw createHttpError(
      `Invalid API key format. Please set ${envName} to a valid ASCII API key without spaces or Chinese placeholder text.`,
      400
    );
  }
}

function sanitizeBaseUrl(baseUrl) {
  return String(baseUrl || providerBaseUrls.openai).replace(/\/+$/, '');
}
