import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { Check } from 'typebox/value';
import { expect, test } from 'vitest';
import { PreferencesSchema } from '@filehub/contracts';
import { databaseFixture } from '../helpers/database.js';
import { DEFAULT_MIGRATIONS_DIRECTORY, assertMigrationHistory, loadMigrations } from '../../src/persistence/migrations.js';
import { backupDatabase, restoreDatabaseBackup } from '../../src/persistence/backup.js';
import { knownDatabase } from '../../src/maintenance/database.js';
import { hashPassword } from '../../src/modules/identity/password.js';

test('schema 12 偏好原值升級至 13，新模式受 CHECK／外鍵保護；DB 備份還原與原快照保留', async () => {
  const fixture = await databaseFixture(), prefix = join(fixture.directory, 'schema12');
  await mkdir(join(prefix, 'meta'), { recursive: true }); await mkdir(fixture.config.stateDirectory);
  const journal = JSON.parse(await readFile(join(DEFAULT_MIGRATIONS_DIRECTORY, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string; idx: number }[] };
  journal.entries = journal.entries.filter(entry => entry.idx < 12);
  expect(journal.entries).toHaveLength(12);
  await writeFile(join(prefix, 'meta/_journal.json'), JSON.stringify(journal));
  for (const entry of journal.entries) await writeFile(join(prefix, `${entry.tag}.sql`), await readFile(join(DEFAULT_MIGRATIONS_DIRECTORY, `${entry.tag}.sql`)));
  const old = new Database(join(fixture.config.stateDirectory, 'filehub.db'));
  const snapshot = join(fixture.directory, 'before-upgrade.db');
  try {
    old.pragma('journal_mode = WAL'); old.pragma('foreign_keys = ON');
    migrate(drizzle(old), { migrationsFolder: prefix });
    expect(old.prepare('SELECT revision FROM schema_state').get()).toEqual({ revision: 12 });
    const hash=await hashPassword('Synthetic-migration-password-2026!');
    for (const id of ['one', 'two']) old.prepare('INSERT INTO users(id,username,password_hash,role,created_at) VALUES (?,?,?,?,?)').run(id,id,hash,'member',0);
    old.exec("INSERT INTO preferences VALUES ('one','list',100),('two','thumbnails',25)");
    expect(() => old.exec("UPDATE preferences SET default_view='mosaic' WHERE user_id='one'")).toThrow();
    assertMigrationHistory(old, loadMigrations(), true);
    await old.backup(snapshot);
  } finally { old.close(); }
  const originalSha = createHash('sha256').update(await readFile(snapshot)).digest('hex');
  fixture.migrate(); const current = fixture.open();
  const preferences = () => current.sqlite.prepare('SELECT * FROM preferences ORDER BY user_id').all();
  expect(preferences()).toEqual([{user_id:'one',default_view:'list',page_size:100},{user_id:'two',default_view:'thumbnails',page_size:25}]);
  expect(current.isReady()).toBe(true); expect(current.diagnostics().foreignKeys).toBe(1);
  expect(current.sqlite.prepare('SELECT revision FROM schema_state').get()).toEqual({revision:13});
  expect(() => current.sqlite.exec("UPDATE preferences SET default_view='gallery' WHERE user_id='one'")).toThrow();
  expect(() => current.sqlite.exec("INSERT INTO preferences VALUES ('missing','mosaic',50)")).toThrow();
  current.sqlite.exec("UPDATE preferences SET default_view='mosaic' WHERE user_id='one'");
  expect(Check(PreferencesSchema, {defaultView:'mosaic',pageSize:100})).toBe(true);
  for (const defaultView of ['gallery','grid','',null]) expect(Check(PreferencesSchema, {defaultView,pageSize:100})).toBe(false);
  const after = await backupDatabase(current, join(fixture.directory,'after-upgrade'));
  const restoredState = join(fixture.directory,'restored'); await restoreDatabaseBackup(after,{...fixture.config,stateDirectory:restoredState});
  const restored=fixture.open(restoredState); expect(restored.isReady()).toBe(true);
  expect(restored.sqlite.prepare('SELECT * FROM preferences ORDER BY user_id').all()).toEqual(preferences());
  restored.sqlite.exec("DELETE FROM users WHERE id='one'"); expect(restored.sqlite.prepare('SELECT user_id FROM preferences').all()).toEqual([{user_id:'two'}]);
  const rollbackDirectory=join(fixture.directory,'rollback');await mkdir(rollbackDirectory);
  const before=knownDatabase(snapshot);try{expect(before.revision).toBe(12);await before.sqlite.backup(join(rollbackDirectory,'filehub.db'));}finally{before.sqlite.close();}
  const rollback=knownDatabase(join(rollbackDirectory,'filehub.db'));
  try{expect(rollback.revision).toBe(12);expect(rollback.sqlite.prepare('SELECT * FROM preferences ORDER BY user_id').all()).toEqual([{user_id:'one',default_view:'list',page_size:100},{user_id:'two',default_view:'thumbnails',page_size:25}]);}finally{rollback.sqlite.close();}
  expect(createHash('sha256').update(await readFile(snapshot)).digest('hex')).toBe(originalSha);
});
