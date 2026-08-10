import { AppController } from './AppController.js';
import { createLogger } from '../core/logger.js';

const globalLog = createLogger('Global');

export function bootstrap() {
  window.addEventListener('error', (event) => {
    globalLog.error('Global error:', event.error || event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    globalLog.error('Unhandled promise rejection:', event.reason);
  });

  // The classic inline guard in index.html owns the file:// error view because
  // module scripts may be blocked before this module can execute.
  if (location.protocol === 'file:') return null;

  const app = new AppController();
  window.__aliceApp = app;
  window.addEventListener('beforeunload', () => app.destroy(), { once: true });
  app.init();
  return app;
}
