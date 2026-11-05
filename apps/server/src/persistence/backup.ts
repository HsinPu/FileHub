import { acquireStateLock,RESTORE_PENDING } from '../lifecycle/state-lock.js';
import { mkdir,writeFile,unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import Database from 'better-sqlite3';
import { validateDatabaseConfig, type DatabaseConfig } from '../config/index.js';
import { assertSQLiteVersion, openDatabase, type FileHubDatabase } from './database.js';
import { assertMigrationHistory, loadMigrations, SchemaCompatibilityError } from './migrations.js';

function openVerifiedSnapshot(filename: string): Database.Database {
  if (!isAbsolute(filename) || filename.includes('\0')) throw new Error('備份檔案必須是絕對路徑。');
  const sqlite = new Database(filename, { readonly: true, fileMustExist: true, timeout: 100 });
  try {
    assertSQLiteVersion(sqlite);
    if (sqlite.pragma('integrity_check', { simple: true }) !== 'ok'
      || sqlite.prepare('PRAGMA foreign_key_check').all().length !== 0) throw new Error('資料庫備份完整性檢查失敗。');
    assertMigrationHistory(sqlite, loadMigrations());
    return sqlite;
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

async function newDestination(directory: string): Promise<string> {
  if (!isAbsolute(directory) || directory.includes('\0')) throw new Error('備份目標必須是新的絕對路徑目錄。');
  await mkdir(directory, { mode: 0o700 }); // EEXIST 時拒絕，絕不覆寫既有 state。
  return join(directory, 'filehub.db');
}

async function copySnapshot(sqlite: Database.Database, destination: string): Promise<void> {
  const deadline = performance.now() + 5000;
  await sqlite.backup(destination, { progress: () => {
    if (performance.now() >= deadline) throw new Error('資料庫備份超過等待期限。');
    return 100;
  } });
}

// DB snapshot 共用核心；操作者負責停機，完整金鑰／原檔協調由 maintenance/snapshot.ts 處理。
export async function backupDatabase(database: FileHubDatabase, directory: string): Promise<string> {
  if (!database.isReady() || database.sqlite.inTransaction) throw new SchemaCompatibilityError();
  const destination = await newDestination(directory);
  await copySnapshot(database.sqlite, destination);
  openVerifiedSnapshot(destination).close();
  return destination;
}

export async function restoreDatabaseBackup(filename: string, config: DatabaseConfig): Promise<void> {
  const validated = validateDatabaseConfig(config);
  const source = openVerifiedSnapshot(filename);
  try {
    const destination = await newDestination(validated.stateDirectory);
    const lock=await acquireStateLock(validated.stateDirectory,'exclusive');
    try{
    await writeFile(join(validated.stateDirectory,RESTORE_PENDING),'FileHub DB restore incomplete\n',{flag:'wx',mode:0o600});
    await copySnapshot(source, destination);
    const restored = openDatabase(validated, { create: true });
    try {
      if (!restored.isReady()) throw new SchemaCompatibilityError();
    } finally { restored.close(); }
    await unlink(join(validated.stateDirectory,RESTORE_PENDING));
    }finally{await lock.close();}
  } finally { source.close(); }
}
