import { APP_MODE } from '../config/appConfig.js';

const levelOrder = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99
};

const modeLevel = APP_MODE === 'production' ? 'warn' : 'debug';

export function createLogger(scope, { minLevel = modeLevel } = {}) {
  const prefix = `[${scope}]`;
  const shouldLog = (level) => levelOrder[level] >= levelOrder[minLevel];

  return {
    debug: (...args) => {
      if (shouldLog('debug')) console.debug(prefix, ...args);
    },
    info: (...args) => {
      if (shouldLog('info')) console.info(prefix, ...args);
    },
    warn: (...args) => {
      if (shouldLog('warn')) console.warn(prefix, ...args);
    },
    error: (...args) => {
      if (shouldLog('error')) console.error(prefix, ...args);
    }
  };
}
