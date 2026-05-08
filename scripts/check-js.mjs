import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const roots = ['backend', 'js'];
const files = [];

for (const root of roots) {
  await collectJsFiles(root);
}

for (const file of files) {
  await checkFile(file);
}

async function collectJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectJsFiles(path);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(path);
    }
  }
}

function checkFile(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', file], { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`node --check failed for ${file}`));
    });
    child.on('error', reject);
  });
}
