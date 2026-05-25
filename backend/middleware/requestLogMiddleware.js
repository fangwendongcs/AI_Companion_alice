import { serverLogger } from '../utils/serverLogger.js';

export function attachRequestLogger(req, res) {
  const startedAt = performance.now();
  res.on('finish', () => {
    serverLogger.info({
      message: 'request completed',
      requestId: req.requestId,
      method: req.method,
      path: req.url?.split('?')[0] || '/',
      statusCode: res.statusCode,
      durationMs: Math.round(performance.now() - startedAt)
    });
  });
}
