import { createServer } from 'node:http';
import { port } from './config/serverConfig.js';
import { handleCorsPreflight } from './middleware/corsMiddleware.js';
import { handleServerError } from './middleware/errorMiddleware.js';
import { routeRequest } from './routes/router.js';
import { serverLogger } from './utils/serverLogger.js';

const server = createServer(async (req, res) => {
  try {
    if (handleCorsPreflight(req, res)) return;
    await routeRequest(req, res);
  } catch (error) {
    handleServerError(error, res);
  }
});

server.listen(port, () => {
  serverLogger.info(`Alice dev server running at http://localhost:${port}`);
});
