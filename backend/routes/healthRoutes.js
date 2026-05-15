import { sendJson } from '../utils/response.js';

export function handleHealth(_req, res) {
  sendJson(res, 200, { ok: true });
}
