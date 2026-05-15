import { AppError } from './errors/AppError.js';
import { ERROR_CODES } from './errors/errorCodes.js';
import { createLogger } from './logger.js';
import { ResourceResolver } from './resources/ResourceResolver.js';
import { ApiClient } from '../services/api/ApiClient.js';

const defaultResolver = new ResourceResolver();
const defaultApiClient = new ApiClient();
const log = createLogger('loadJson');

export async function loadJson(path, options = {}) {
  const {
    source = 'resource:json',
    resolver = defaultResolver,
    apiClient = defaultApiClient,
    rawPath = false,
    ...requestOptions
  } = options;
  const resolvedPath = rawPath ? path : resolver.normalizePublicPath(path);

  try {
    return await apiClient.json(resolvedPath, {
      ...requestOptions,
      source,
      fetchOptions: {
        cache: 'no-store',
        ...(requestOptions.fetchOptions || {})
      }
    });
  } catch (error) {
    const appError = error instanceof AppError && error.code === ERROR_CODES.RESOURCE_NOT_FOUND
      ? error
      : new AppError({
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      message: `Failed to load JSON ${resolvedPath}: ${error?.message || 'unknown error'}`,
      source,
      detail: { path: resolvedPath },
      recoverable: true,
      cause: error
    });
    log.warn(appError.message);
    throw appError;
  }
}
