import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const candidates = [
  '@playwright/test',
  'playwright',
  '@playwright/cli'
];

const available = candidates.filter((pkg) => {
  try {
    require.resolve(pkg);
    return true;
  } catch {
    return false;
  }
});

if (available.length) {
  console.log(`[check-browser-capability] optional browser automation available: ${available.join(', ')}`);
} else {
  console.log('[check-browser-capability] optional browser automation not installed. This is OK; run manual browser checks from docs/process/BROWSER_ACCEPTANCE_CHECKLIST.md.');
}
