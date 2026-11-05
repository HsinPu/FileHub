import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { readMigrationFiles, type MigrationMeta } from 'drizzle-orm/migrator';
import { SCHEMA_REVISION } from './schema.js';

export const DEFAULT_MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../../drizzle/', import.meta.url));

export class SchemaCompatibilityError extends Error {
  constructor() {
    super('資料庫 schema 或 migration 紀錄與此版本不相容。');
    this.name = 'SchemaCompatibilityError';
  }
}

export function loadMigrations(directory = DEFAULT_MIGRATIONS_DIRECTORY): MigrationMeta[] {
  const migrations = readMigrationFiles({ migrationsFolder: directory });
  if (migrations.length !== SCHEMA_REVISION || migrations.some((migration, index) =>
    !Number.isSafeInteger(migration.folderMillis) || migration.folderMillis < 1
    || (index > 0 && migration.folderMillis <= (migrations[index - 1]?.folderMillis ?? 0)))) throw new SchemaCompatibilityError();
  return migrations;
}

export function assertSchemaRevision(sqlite: Database.Database, revision: number): void {
  const rows = sqlite.prepare<[], { id: unknown; revision: unknown }>('SELECT id, revision FROM schema_state').all();
  if (rows.length !== 1 || rows[0]?.id !== 1 || rows[0].revision !== revision) throw new SchemaCompatibilityError();
}

export function assertMigrationHistory(sqlite: Database.Database, migrations: MigrationMeta[], allowPending = false): void {
  // GLOB 的底線是字面值；LIKE 的 '_' 會錯誤略過 sqliteLegacy 這類自訂名稱。
  const objects = sqlite.prepare<[], { name: string; type: string }>("SELECT name, type FROM sqlite_master WHERE name NOT GLOB 'sqlite_*'").all();
  const hasJournal = objects.some(({ name, type }) => name === '__drizzle_migrations' && type === 'table');
  const rows = hasJournal ? sqlite.prepare<[], { hash: unknown; created_at: unknown }>('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at').all() : [];
  if (rows.length > migrations.length || (!allowPending && rows.length !== migrations.length)) throw new SchemaCompatibilityError();
  if (rows.length === 0 && objects.some(({ name, type }) => name !== '__drizzle_migrations' || type !== 'table')) throw new SchemaCompatibilityError();
  for (const [index, row] of rows.entries()) {
    const expected = migrations[index];
    if (!expected || row.hash !== expected.hash || row.created_at !== expected.folderMillis) throw new SchemaCompatibilityError();
  }
  if (rows.length > 0) assertSchemaRevision(sqlite, rows.length);
}
