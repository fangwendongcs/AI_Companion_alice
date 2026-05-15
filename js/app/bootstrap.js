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

  if (location.protocol === 'file:') {
    alert('请使用本地服务器运行本项目，例如：npm run dev、npx serve . 或 python -m http.server。');
  }

  const app = new AppController();
  window.__aliceApp = app;
  window.addEventListener('beforeunload', () => app.destroy(), { once: true });
  app.init();
  return app;
}
