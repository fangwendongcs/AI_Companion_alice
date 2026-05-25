import { sendError } from '../utils/response.js';
import { serverLogger } from '../utils/serverLogger.js';

export function handleServerError(error, req, res) {
  if (!error.statusCode || error.statusCode >= 500) {
    serverLogger.error({
      message: 'Unhandled server error',
      requestId: req?.requestId,
      method: req?.method,
      path: req?.url?.split('?')[0],
      statusCode: error.statusCode || 500,
      errorCode: error.code || 'SERVER_ERROR',
      error
    });
  }
  sendError(res, error.statusCode || 500, error, { legacy: true });
}
