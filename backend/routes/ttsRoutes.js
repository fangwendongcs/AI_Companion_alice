import { maxJsonBodyBytes } from '../config/serverConfig.js';
import { TTS_STATUS } from '../services/tts/TTSResult.js';
import { TTSOrchestrator } from '../services/tts/TTSOrchestrator.js';
import { readJsonBody } from '../utils/request.js';
import { sendJson, sendOk, writeCors } from '../utils/response.js';

const ttsOrchestrator = new TTSOrchestrator();

export async function handleTTS(req, res) {
  const body = await readJsonBody(req, maxJsonBodyBytes);
  const wantsJson = shouldReturnJson(req, body);
  const result = await ttsOrchestrator.synthesize(body);

  if (wantsJson) {
    sendOk(res, 200, result);
    return;
  }

  if (result.tts_status !== TTS_STATUS.OK) {
    sendJson(res, statusForTTSResult(result), {
      error: result.error?.message || 'TTS provider unavailable.',
      code: result.error?.code || 'TTS_PROVIDER_FAILED',
      tts_status: result.tts_status,
      provider: result.provider
    });
    return;
  }

  if (result.audioBase64) {
    const audioBuffer = Buffer.from(result.audioBase64, 'base64');
    writeCors(res);
    res.writeHead(200, {
      'Content-Type': result.contentType || contentTypeForFormat(result.format),
      'Content-Length': audioBuffer.byteLength
    });
    res.end(audioBuffer);
    return;
  }

  sendJson(res, 502, {
    error: 'TTS provider returned no playable audio payload.',
    code: 'TTS_INVALID_RESPONSE',
    tts_status: TTS_STATUS.FAILED,
    provider: result.provider
  });
}

function shouldReturnJson(req, body = {}) {
  const requested = String(body.responseFormat || body.response_format || '').toLowerCase();
  if (requested === 'json') return true;
  if (requested === 'binary' || requested === 'audio') return false;
  const accept = String(req.headers.accept || '').toLowerCase();
  return accept.includes('application/json');
}

function statusForTTSResult(result = {}) {
  const code = result.error?.code || '';
  if (code === 'TTS_TEXT_REQUIRED' || code === 'TTS_PROVIDER_UNSUPPORTED') return 400;
  if (code === 'TTS_NOT_CONFIGURED') return 503;
  if (code === 'TTS_PROVIDER_TIMEOUT') return 504;
  return 502;
}

function contentTypeForFormat(format = '') {
  const normalized = String(format || '').toLowerCase();
  if (normalized === 'wav') return 'audio/wav';
  if (normalized === 'ogg') return 'audio/ogg';
  return 'audio/mpeg';
}
