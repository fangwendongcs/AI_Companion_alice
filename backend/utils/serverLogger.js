export const serverLogger = {
  info: (...args) => console.info('[server]', ...args),
  warn: (...args) => console.warn('[server]', ...args),
  error: (...args) => console.error('[server]', ...args)
};
