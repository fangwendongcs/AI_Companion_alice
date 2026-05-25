import { upstreamTimeoutMs } from '../config/serverConfig.js';
import { createHttpError } from './httpError.js';

export async function readRequestBuffer(req, maxBytes) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      const error = createHttpError('Request body too large', 413);
      error.code = 'REQUEST_BODY_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJsonBody(req, maxBytes) {
  const raw = (await readRequestBuffer(req, maxBytes)).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw createHttpError('Invalid JSON body', 400);
  }
}

export async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createHttpError('Upstream request timed out.', 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function readMultipartForm(req, maxBytes) {
  const contentType = req.headers['content-type'] || '';
  const boundary = getMultipartBoundary(contentType);
  if (!boundary) {
    throw createHttpError('Expected multipart/form-data.', 400);
  }

  const body = await readRequestBuffer(req, maxBytes);
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = {};
  let start = body.indexOf(boundaryBuffer);

  while (start !== -1) {
    let partStart = start + boundaryBuffer.length;
    if (body[partStart] === 45 && body[partStart + 1] === 45) break;
    if (body[partStart] === 13 && body[partStart + 1] === 10) partStart += 2;

    const next = body.indexOf(boundaryBuffer, partStart);
    if (next === -1) break;

    let partEnd = next;
    if (body[partEnd - 2] === 13 && body[partEnd - 1] === 10) partEnd -= 2;

    const part = body.subarray(partStart, partEnd);
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd > -1) {
      const headerText = part.subarray(0, headerEnd).toString('utf8');
      const content = part.subarray(headerEnd + 4);
      const disposition = parseContentDisposition(headerText);
      if (disposition.name) {
        if (disposition.filename) {
          const file = {
            fieldName: disposition.name,
            originalFilename: String(disposition.filename || ''),
            filename: sanitizeFilename(disposition.filename),
            contentType: parseHeaderValue(headerText, 'content-type') || 'application/octet-stream',
            buffer: content
          };
          files[disposition.name] = files[disposition.name] || [];
          files[disposition.name].push(file);
        } else {
          fields[disposition.name] = content.toString('utf8').trim();
        }
      }
    }

    start = next;
  }

  return { fields, files };
}

function getMultipartBoundary(contentType) {
  const match = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match?.[1] || match?.[2] || '';
}

function parseContentDisposition(headerText) {
  const line = headerText.split(/\r?\n/).find((header) => /^content-disposition:/i.test(header)) || '';
  const result = {};
  line.replace(/;\s*([^=]+)="([^"]*)"/g, (_, key, value) => {
    result[key.toLowerCase()] = value;
    return '';
  });
  return result;
}

function parseHeaderValue(headerText, name) {
  const prefix = `${name}:`;
  const line = headerText.split(/\r?\n/).find((header) => header.toLowerCase().startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : '';
}

function sanitizeFilename(filename) {
  return String(filename || 'upload.bin').replace(/[/\\]/g, '').slice(0, 120);
}
