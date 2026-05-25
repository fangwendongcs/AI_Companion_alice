import { createServer } from 'node:http';
import { deploymentMode, port } from './config/serverConfig.js';
import { assertValidServerConfig } from './config/validateServerConfig.js';
import { enforceCors, handleCorsPreflight } from './middleware/corsMiddleware.js';
import { handleServerError } from './middleware/errorMiddleware.js';
import { attachRequestId } from './middleware/requestIdMiddleware.js';
import { attachRequestLogger } from './middleware/requestLogMiddleware.js';
import { routeRequest } from './routes/router.js';
import { serverLogger } from './utils/serverLogger.js';

const configValidation = assertValidServerConfig();
configValidation.warnings.forEach((warning) => serverLogger.warn({ message: 'server config warning', warning }));

const server = createServer(async (req, res) => {
  try {
    attachRequestId(req, res);
    attachRequestLogger(req, res);
    if (enforceCors(req, res)) return;
    if (handleCorsPreflight(req, res)) return;
    await routeRequest(req, res);
  } catch (error) {
    handleServerError(error, req, res);
  }
});

server.listen(port, () => {
  serverLogger.info({
    message: 'Alice server started',
    deploymentMode,
    port,
    url: `http://localhost:${port}`
  });
});
