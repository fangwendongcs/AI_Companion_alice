import { EVENT_NAMES } from '../events/eventNames.js';
import { createLogger } from '../logger.js';
import { ERROR_CODES } from './errorCodes.js';
import { toAppError } from './AppError.js';

const log = createLogger('ErrorHandler');

export function handleAppError(error, {
  eventBus = null,
  stateStore = null,
  source = 'app',
  code = ERROR_CODES.UNKNOWN,
  userMessage = null,
  recoverable = true
} = {}) {
  const appError = toAppError(error, {
    code,
    source,
    recoverable
  });

  log.error(appError.message, appError.detail || appError.cause || '');
  stateStore?.patch?.({
    systemError: userMessage || appError.message,
    app: {
      ...(stateStore.getState?.().app || {}),
      error: appError.toJSON()
    }
  }, source);
  eventBus?.emit?.(EVENT_NAMES.SYSTEM_ERROR, appError.toJSON());
  return appError;
}
