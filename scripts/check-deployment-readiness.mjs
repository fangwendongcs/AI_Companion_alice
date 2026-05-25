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
await checkEnvExample();
await checkBoundaryFiles();
await checkDangerousLogPatterns();
await checkDeploymentDocs();

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

async function checkEnvExample() {
  const source = await readFile('.env.example', 'utf8').catch(() => '');
  if (!source) {
    failures.push('.env.example is required for deployment configuration handoff.');
    return;
  }

  const requiredKeys = [
    'DEPLOYMENT_MODE=',
    'ALLOWED_ORIGINS=',
    'REQUIRE_API_AUTH=',
    'API_AUTH_TOKEN=',
    'RATE_LIMIT_ENABLED=',
    'JSON_BODY_LIMIT=',
    'UPLOAD_BODY_LIMIT=',
    'UPLOAD_STORAGE_DIR=',
    'UPLOAD_TMP_DIR=',
    'PUBLIC_ASSET_DIR=',
    'AVATAR_ASSET_DIR=',
    'UPLOAD_MAX_TOTAL_BYTES=',
    'N8N_WEBHOOK_URL=',
    'N8N_WEBHOOK_SECRET='
  ];

  for (const key of requiredKeys) {
    if (!source.includes(key)) failures.push(`.env.example must document ${key.replace('=', '')}.`);
  }

  const dangerousPatterns = [
    /\bsk-[A-Za-z0-9_-]{20,}/,
    /\bBearer\s+[A-Za-z0-9._-]{20,}/i,
    /OPENAI_API_KEY\s*=\s*(?!replace_with|$)[^\s#]+/i,
    /API_AUTH_TOKEN\s*=\s*(?!replace_with|$)[^\s#]+/i,
    /N8N_WEBHOOK_SECRET\s*=\s*(?!replace_with|$)[^\s#]+/i
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(source)) failures.push('.env.example appears to contain a non-placeholder secret.');
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

async function checkDeploymentDocs() {
  const requiredDocs = [
    'README.md',
    'backend/README.md',
    'docs/security/DEPLOYMENT_SECURITY.md',
    'docs/security/PHASE4_DEPLOYMENT_SECURITY_BASELINE.md'
  ];

  for (const file of requiredDocs) {
    const source = await readFile(file, 'utf8').catch(() => '');
    if (!source) {
      failures.push(`${file} is required for deployment documentation.`);
      continue;
    }

    const requiredTerms = ['local', 'demo', 'production'];
    for (const term of requiredTerms) {
      if (!source.includes(term)) failures.push(`${file} must describe ${term} deployment mode.`);
    }
    if (!/secret|API key|token/i.test(source)) {
      failures.push(`${file} must document secret management boundaries.`);
    }
    if (!/not.*production|不是.*生产|不是完整|not a complete/i.test(source)) {
      failures.push(`${file} must state the current security baseline is not a complete production system.`);
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
