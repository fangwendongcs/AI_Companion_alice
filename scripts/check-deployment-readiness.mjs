import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validateServerConfig } from '../backend/config/validateServerConfig.js';
import {
  allowedOrigins,
  apiAuthToken,
  deploymentMode,
  rateLimitEnabled,
  requireApiAuth
} from '../backend/config/serverConfig.js';

const failures = [];
const warnings = [];

await checkServerConfig();
await checkBoundaryFiles();
await checkDangerousLogPatterns();

if (warnings.length) {
  console.warn('[check-deployment-readiness] warnings:');
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (failures.length) {
  console.error('[check-deployment-readiness] failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-deployment-readiness] ok');

async function checkServerConfig() {
  const result = validateServerConfig();
  failures.push(...result.errors);
  warnings.push(...result.warnings);

  if (deploymentMode === 'demo' && !allowedOrigins.length) {
    failures.push('demo mode should set ALLOWED_ORIGINS.');
  }
  if (deploymentMode !== 'local' && allowedOrigins.length > 0 && allowedOrigins.every(isLocalOrigin)) {
    failures.push(`${deploymentMode} mode should not use localhost-only ALLOWED_ORIGINS.`);
  }
  if (deploymentMode === 'demo' && !requireApiAuth) {
    failures.push('demo mode should set REQUIRE_API_AUTH=true.');
  }
  if (requireApiAuth && isPlaceholder(apiAuthToken)) {
    failures.push('API_AUTH_TOKEN appears to be a placeholder.');
  }
  if (deploymentMode === 'demo' && !rateLimitEnabled) {
    failures.push(`${deploymentMode} mode should keep RATE_LIMIT_ENABLED=true.`);
  }
}

async function checkBoundaryFiles() {
  const requiredFiles = [
    'backend/middleware/corsMiddleware.js',
    'backend/middleware/rateLimitMiddleware.js',
    'backend/middleware/requestIdMiddleware.js',
    'backend/middleware/requestLogMiddleware.js',
    'backend/utils/redact.js',
    'backend/utils/serverLogger.js'
  ];

  for (const file of requiredFiles) {
    const source = await readFile(file, 'utf8').catch(() => '');
    if (!source) failures.push(`${file} is required for deployment readiness.`);
  }

  const server = await readFile('backend/server.js', 'utf8');
  if (!server.includes('assertValidServerConfig')) failures.push('server.js must validate config before startup.');
  if (!server.includes('attachRequestId')) failures.push('server.js must attach request IDs.');
  if (!server.includes('attachRequestLogger')) failures.push('server.js must attach request logger.');
}

async function checkDangerousLogPatterns() {
  const files = [];
  await collectFiles('backend', files);

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (/console\.(log|info|warn|error)\s*\([^)]*process\.env/i.test(source)) {
      failures.push(`${file} must not print process.env.`);
    }
    if (/console\.(log|info|warn|error)\s*\([^)]*req\.body/i.test(source)) {
      failures.push(`${file} must not print req.body.`);
    }
    if (/console\.(log|info|warn|error)\s*\([^)]*(authorization|cookie|apiKey|token|secret)/i.test(source)) {
      failures.push(`${file} must not print sensitive headers or tokens.`);
    }
  }
}

async function collectFiles(dir, target) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collectFiles(path, target);
    else if (entry.isFile() && path.endsWith('.js')) target.push(path);
  }
}

function isLocalOrigin(origin) {
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isPlaceholder(value) {
  return /(replace_with|your_|example|placeholder|changeme|secret|token)/i.test(String(value || ''));
}
