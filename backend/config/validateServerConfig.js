import {
  allowedOrigins,
  apiAuthToken,
  corsAllowLocalhost,
  deploymentMode,
  jsonBodyLimitBytes,
  rateLimitEnabled,
  requireApiAuth,
  uploadBodyLimitBytes,
  uploadMaxTotalBytes
} from './serverConfig.js';

const allowedModes = new Set(['local', 'demo', 'production']);
const placeholderPattern = /(replace_with|your_|example|placeholder|changeme|secret|token)/i;

export function validateServerConfig() {
  const errors = [];
  const warnings = [];

  if (!allowedModes.has(deploymentMode)) {
    errors.push(`DEPLOYMENT_MODE must be one of: ${Array.from(allowedModes).join(', ')}.`);
  }

  if (deploymentMode === 'production') {
    if (!allowedOrigins.length) {
      errors.push('DEPLOYMENT_MODE=production requires ALLOWED_ORIGINS.');
    }
    if (allowedOrigins.length > 0 && allowedOrigins.every(isLocalOrigin)) {
      errors.push('DEPLOYMENT_MODE=production must not use localhost-only ALLOWED_ORIGINS.');
    }
    if (corsAllowLocalhost) {
      warnings.push('CORS_ALLOW_LOCALHOST=true is not recommended for production.');
    }
    if (!requireApiAuth) {
      errors.push('DEPLOYMENT_MODE=production requires REQUIRE_API_AUTH=true.');
    }
    if (!rateLimitEnabled) {
      errors.push('DEPLOYMENT_MODE=production should keep RATE_LIMIT_ENABLED=true.');
    }
    if (!process.env.UPLOAD_STORAGE_DIR) {
      errors.push('DEPLOYMENT_MODE=production requires explicit UPLOAD_STORAGE_DIR.');
    }
    if (!process.env.AVATAR_ASSET_DIR) {
      errors.push('DEPLOYMENT_MODE=production requires explicit AVATAR_ASSET_DIR.');
    }
  }

  if (deploymentMode === 'demo' && !requireApiAuth) {
    warnings.push('DEPLOYMENT_MODE=demo should enable REQUIRE_API_AUTH for private previews.');
  }

  if (requireApiAuth && !isSafeSecret(apiAuthToken)) {
    errors.push('REQUIRE_API_AUTH=true requires a non-placeholder API_AUTH_TOKEN.');
  }

  if (!jsonBodyLimitBytes || jsonBodyLimitBytes < 1024) {
    errors.push('JSON_BODY_LIMIT is too small or invalid.');
  }
  if (!uploadBodyLimitBytes || uploadBodyLimitBytes < 1024) {
    errors.push('UPLOAD_BODY_LIMIT is too small or invalid.');
  }
  if (!uploadMaxTotalBytes || uploadMaxTotalBytes < uploadBodyLimitBytes) {
    errors.push('UPLOAD_MAX_TOTAL_BYTES must be at least UPLOAD_BODY_LIMIT.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function assertValidServerConfig() {
  const result = validateServerConfig();
  if (!result.ok) {
    const error = new Error(`Server configuration is not deployable: ${result.errors.join(' ')}`);
    error.code = 'SERVER_CONFIG_INVALID';
    error.statusCode = 500;
    throw error;
  }
  return result;
}

function isSafeSecret(value) {
  const token = String(value || '').trim();
  return token.length >= 16 && !placeholderPattern.test(token);
}

function isLocalOrigin(origin) {
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}
