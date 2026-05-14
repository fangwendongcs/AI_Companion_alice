import { ERROR_CODES } from './errorCodes.js';

export class AppError extends Error {
  constructor({
    code = ERROR_CODES.UNKNOWN,
    message = 'Unexpected application error.',
    source = 'app',
    detail = null,
    recoverable = true,
    cause = null
  } = {}) {
    super(message, { cause });
    this.name = 'AppError';
    this.code = code;
    this.source = source;
    this.detail = detail;
    this.recoverable = recoverable;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      source: this.source,
      detail: this.detail,
      recoverable: this.recoverable
    };
  }
}

export function toAppError(error, fallback = {}) {
  if (error instanceof AppError) return error;
  return new AppError({
    code: fallback.code || ERROR_CODES.UNKNOWN,
    message: error?.message || fallback.message || 'Unexpected application error.',
    source: fallback.source || 'app',
    detail: fallback.detail || null,
    recoverable: fallback.recoverable ?? true,
    cause: error
  });
}
