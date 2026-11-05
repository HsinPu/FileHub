import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { validateDatabaseConfig, type DatabaseConfig } from '../config/index.js';
import { assertMigrationHistory, loadMigrations } from './migrations.js';
import * as schema from './schema.js';

export const EXPECTED_SQLITE_VERSION = '3.53.4';

export interface DatabaseDiagnostics {
  sqliteVersion: string;
  journalMode: unknown;
  foreignKeys: unknown;
  synchronous: unknown;
  busyTimeoutMs: unknown;
  walAutoCheckpoint: unknown;
}

export interface FileHubDatabase {
  readonly sqlite: Database.Database;
  readonly db: BetterSQLite3Database<typeof schema>;
  diagnostics(): DatabaseDiagnostics;
  isReady(): boolean;
  close(): void;
}

export function assertSQLiteVersion(sqlite: Database.Database): string {
  const version = sqlite.prepare<[], { version: unknown }>('SELECT sqlite_version() AS version').get()?.version;
  if (version !== EXPECTED_SQLITE_VERSION) throw new Error('SQLite runtime 與已驗證版本不符。');
  return version;
}

export function openDatabase(config: DatabaseConfig, options: { create?: boolean; migrationsDirectory?: string } = {}): FileHubDatabase {
  config = validateDatabaseConfig(config);
  const migrations = loadMigrations(options.migrationsDirectory);
  const sqlite = new Database(join(config.stateDirectory, 'filehub.db'), { fileMustExist: !options.create, timeout: config.sqliteBusyTimeoutMs });
  try {
    assertSQLiteVersion(sqlite);
    // migration 才能建立／啟用 WAL；先拒絕未知 schema，避免接管既有 DB。
    if (options.create) {
      assertMigrationHistory(sqlite, migrations, true);
      if (sqlite.pragma('journal_mode = WAL', { simple: true }) !== 'wal') throw new Error('資料庫無法啟用 WAL。');
    }
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('synchronous = FULL');
    sqlite.pragma('wal_autocheckpoint = 1000');
    const diagnostics = (): DatabaseDiagnostics => ({
      sqliteVersion: assertSQLiteVersion(sqlite),
      journalMode: sqlite.pragma('journal_mode', { simple: true }),
      foreignKeys: sqlite.pragma('foreign_keys', { simple: true }),
      synchronous: sqlite.pragma('synchronous', { simple: true }),
      busyTimeoutMs: sqlite.pragma('busy_timeout', { simple: true }),
      walAutoCheckpoint: sqlite.pragma('wal_autocheckpoint', { simple: true }),
    });
    return {
      sqlite,
      db: drizzle(sqlite, { schema }),
      diagnostics,
      isReady: () => {
        if (!sqlite.open) return false;
        try {
          const settings = diagnostics();
          if (settings.journalMode !== 'wal' || settings.foreignKeys !== 1 || settings.synchronous !== 2
            || settings.busyTimeoutMs !== config.sqliteBusyTimeoutMs || settings.walAutoCheckpoint !== 1000) return false;
          assertMigrationHistory(sqlite, migrations);
          return true;
        } catch { return false; }
      },
      close: () => { if (sqlite.open) sqlite.close(); },
    };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
