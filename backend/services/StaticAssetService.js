import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize, relative } from 'node:path';
import { mimeTypes, rootDir } from '../config/serverConfig.js';
import { sendJson, writeCors } from '../utils/response.js';

export async function serveStatic(pathname, method, res) {
  const requested = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const normalized = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(rootDir, normalized);
  const relativePath = relative(rootDir, filePath);

  if (relativePath.startsWith('..') || relativePath === '' || !existsSync(filePath)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  writeCors(res);
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    ...(shouldDisableStaticCache(ext, relativePath) ? { 'Cache-Control': 'no-store' } : {})
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

function shouldDisableStaticCache(ext, relativePath) {
  return ['.html', '.js', '.json'].includes(ext)
    || relativePath.startsWith(`public${join('/', 'avatars')}`);
}
