import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { sqliteDbPath } from '../config/serverConfig.js';

const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));

export async function initializeSQLiteDatabase({ dbPath = sqliteDbPath } = {}) {
  if (!dbPath || typeof dbPath !== 'string') {
    throw new Error('SQLite database path is required.');
  }

  if (dbPath !== ':memory:') {
    await mkdir(dirname(dbPath), { recursive: true });
  }

  const database = new DatabaseSync(dbPath);
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(await readFile(schemaPath, 'utf8'));
  return database;
}

export function getSQLiteSchemaPath() {
  return schemaPath;
}
