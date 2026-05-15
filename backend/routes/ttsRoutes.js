import {
  maxJsonBodyBytes,
  minimaxTTSModels,
  openaiTTSModels,
  ttsProviderBaseUrlEnv,
  ttsProviderBaseUrls,
  ttsProviderKeyEnv
} from '../config/serverConfig.js';
import { createHttpError } from '../utils/httpError.js';
import { clampNumber } from '../utils/number.js';
import { fetchWithTimeout, readJsonBody } from '../utils/request.js';
import { sendJson, writeCors } from '../utils/response.js';

export async function handleTTS(req, res) {
  const body = await readJsonBody(req, maxJsonBodyBytes);
  const provider = normalizeTTSProvider(body.provider);
  const text = normalizeTTSInput(body.text);

  if (!text) {
    sendJson(res, 400, { error: 'Missing TTS text.' });
    return;
  }

  if (provider === 'minimax') {
    await handleMiniMaxTTS(body, text, res);
    return;
  }

  await handleOpenAITTS(body, text, res);
}

async function handleOpenAITTS(body, text, res) {
  const apiKey = resolveTTSApiKey('openai');
  const baseUrl = resolveTTSBaseUrl('openai');
  if (!apiKey) {
    sendJson(res, 400, {
      error: 'Missing API key. Set OPENAI_API_KEY or LLM_API_KEY in the backend environment.'
    });
    return;
  }

  const requestedModel = String(body.model || process.env.OPENAI_TTS_MODEL || '').trim();
  const model = openaiTTSModels.has(requestedModel) ? requestedModel : 'gpt-4o-mini-tts';
  const payload = {
    model,
    input: text,
    voice: sanitizeVoiceId(body.voice, 'coral'),
    speed: clampNumber(body.speed, 0.25, 4, 1)
  };

  if (model === 'gpt-4o-mini-tts' && body.instructions) {
    payload.instructions = String(body.instructions).slice(0, 1000);
  }

  const upstream = await fetchWithTimeout(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    sendJson(res, upstream.status, { error: errorText.slice(0, 1000) });
    return;
  }

  const audioBuffer = Buffer.from(await upstream.arrayBuffer());
  writeCors(res);
  res.writeHead(200, {
    'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
    'Content-Length': audioBuffer.byteLength
  });
  res.end(audioBuffer);
}

async function handleMiniMaxTTS(body, text, res) {
  const apiKey = resolveTTSApiKey('minimax');
  const baseUrl = resolveTTSBaseUrl('minimax');

  if (!apiKey) {
    sendJson(res, 400, {
      error: 'Missing API key. Set MINIMAX_API_KEY in the backend environment.'
    });
    return;
  }

  const requestedModel = String(body.model || process.env.MINIMAX_TTS_MODEL || '').trim();
  const model = minimaxTTSModels.has(requestedModel) ? requestedModel : 'speech-2.8-hd';
  const payload = {
    model,
    text,
    stream: false,
    language_boost: 'Chinese',
    output_format: 'hex',
    voice_setting: {
      voice_id: sanitizeVoiceId(body.voice, 'Chinese (Mandarin)_Crisp_Girl'),
      speed: clampNumber(body.speed, 0.5, 2, 1),
      vol: 1,
      pitch: mapPitchToMiniMax(body.pitch)
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: 'mp3',
      channel: 1
    }
  };

  const upstream = await fetchWithTimeout(`${baseUrl}/t2a_v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const raw = await upstream.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }

  if (!upstream.ok) {
    sendJson(res, upstream.status, { error: raw.slice(0, 1000) });
    return;
  }

  const statusCode = Number(data?.base_resp?.status_code ?? 0);
  if (!data || statusCode !== 0) {
    sendJson(res, 502, { error: data?.base_resp?.status_msg || 'MiniMax TTS failed.' });
    return;
  }

  const audioBuffer = decodeMiniMaxAudio(data.data?.audio);
  writeCors(res);
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': audioBuffer.byteLength
  });
  res.end(audioBuffer);
}

function normalizeTTSProvider(provider) {
  const value = String(provider || 'openai').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(ttsProviderBaseUrls, value)) {
    throw createHttpError(`Unsupported TTS provider: ${value}`, 400);
  }
  return value;
}

function resolveTTSBaseUrl(provider) {
  const envName = ttsProviderBaseUrlEnv[provider];
  const envValue = envName ? process.env[envName] : '';
  const baseUrl = envValue || ttsProviderBaseUrls[provider] || '';
  return baseUrl ? sanitizeBaseUrl(baseUrl) : '';
}

function resolveTTSApiKey(provider) {
  const envName = ttsProviderKeyEnv[provider];
  const fallback = provider === 'openai' ? process.env.LLM_API_KEY : '';
  const value = ((envName && process.env[envName]) || fallback || '').trim();
  assertSafeApiKey(value, envName || 'TTS_API_KEY');
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

function normalizeTTSInput(text) {
  return String(text || '').trim().slice(0, 4000);
}

function sanitizeVoiceId(value, fallback) {
  const voiceId = String(value || fallback).trim();
  if (!voiceId || /[\x00-\x1f\x7f]/.test(voiceId) || voiceId.length > 256) return fallback;
  return voiceId;
}

function mapPitchToMiniMax(value) {
  const pitch = clampNumber(value, 0.5, 2, 1);
  return Math.min(12, Math.max(-12, Math.round((pitch - 1) * 10)));
}

function decodeMiniMaxAudio(audio) {
  const payload = String(audio || '').trim();
  if (!payload) {
    throw createHttpError('MiniMax response did not include audio data.', 502);
  }
  if (/^[0-9a-fA-F]+$/.test(payload) && payload.length % 2 === 0) {
    return Buffer.from(payload, 'hex');
  }
  return Buffer.from(payload, 'base64');
}

function sanitizeBaseUrl(baseUrl) {
  return String(baseUrl || ttsProviderBaseUrls.openai).replace(/\/+$/, '');
}
