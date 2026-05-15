import { writeCors } from '../utils/response.js';

export function handleCorsPreflight(req, res) {
  if (req.method !== 'OPTIONS') return false;
  writeCors(res);
  res.writeHead(204);
  res.end();
  return true;
}
