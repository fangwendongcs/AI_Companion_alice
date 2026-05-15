import { sendError } from '../utils/response.js';
import { serverLogger } from '../utils/serverLogger.js';

export function handleServerError(error, res) {
  if (!error.statusCode || error.statusCode >= 500) {
    serverLogger.error(error);
  }
  sendError(res, error.statusCode || 500, error, { legacy: true });
}
