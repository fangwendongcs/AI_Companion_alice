import { AppError } from '../errors/AppError.js';
import { ERROR_CODES } from '../errors/errorCodes.js';
import { createLogger } from '../logger.js';
import { ResourceResolver } from './ResourceResolver.js';

const log = createLogger('StaticAssetLoader');

export class StaticAssetLoader {
  constructor({
    resolver = new ResourceResolver(),
    logger = log
  } = {}) {
    this.resolver = resolver;
    this.log = logger;
  }

  resolve(path, { kind = 'asset' } = {}) {
    const resolvedPath = kind === 'animation'
      ? this.resolver.resolveAnimationPath(path)
      : this.resolver.normalizePublicPath(path);

    if (!this.resolver.validateAssetPath(resolvedPath)) {
      throw new AppError({
        code: ERROR_CODES.RESOURCE_NOT_FOUND,
        message: `Invalid static asset path: ${path}`,
        source: `resource:${kind}`,
        detail: { path, resolvedPath },
        recoverable: false
      });
    }

    return resolvedPath;
  }

  async loadWith(loader, path, {
    kind = 'asset',
    onProgress = null
  } = {}) {
    const resolvedPath = this.resolve(path, { kind });

    try {
      return await new Promise((resolve, reject) => {
        loader.load(resolvedPath, resolve, onProgress || undefined, reject);
      });
    } catch (error) {
      const appError = error instanceof AppError
        ? error
        : new AppError({
            code: ERROR_CODES.RESOURCE_NOT_FOUND,
            message: `Failed to load ${kind} ${resolvedPath}: ${error?.message || 'unknown error'}`,
            source: `resource:${kind}`,
            detail: { path: resolvedPath },
            recoverable: true,
            cause: error
          });
      this.log.warn(appError.message);
      throw appError;
    }
  }
}
