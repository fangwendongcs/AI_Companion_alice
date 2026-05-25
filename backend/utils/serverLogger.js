import { redactForLog } from './redact.js';
import { deploymentMode } from '../config/serverConfig.js';

function write(level, args) {
  const entry = redactForLog({
    timestamp: new Date().toISOString(),
    level,
    ...normalizeArgs(args)
  });

  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
  if (deploymentMode === 'production') {
    console[method](JSON.stringify(entry));
    return;
  }
  console[method]('[server]', entry);
}

function normalizeArgs(args) {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !(args[0] instanceof Error)) {
    return args[0];
  }

  const [first, ...rest] = args;
  const message = typeof first === 'string' ? first : 'server log';
  const details = typeof first === 'string' ? rest : args;
  return details.length ? { message, details } : { message };
}

export const serverLogger = {
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args)
};
