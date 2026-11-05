import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { loadMigrations, DEFAULT_MIGRATIONS_DIRECTORY } from '../../src/persistence/migrations.js';
import { SCHEMA_REVISION } from '../../src/persistence/schema.js';
import { databaseFixture } from '../helpers/database.js';
import { hashPassword } from '../../src/modules/identity/password.js';
import { IdentityService } from '../../src/modules/identity/service.js';
import { EntryService } from '../../src/modules/entries/service.js';

test('revision 7 升級保留 uploads／chunks 與權限，新增空 operations／items', async () => {
  const f=await databaseFixture();await mkdir(f.config.stateDirectory);const old=new Database(join(f.config.stateDirectory,'filehub.db'));
  const user=randomUUID(),entry=randomUUID(),upload=randomUUID();let before:unknown;
  try {
    old.exec('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)');
    for(const migration of loadMigrations().slice(0,7)){for(const statement of migration.sql)old.exec(statement);old.prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)').run(migration.hash,migration.folderMillis);}
    old.prepare("INSERT INTO users VALUES (?,'fixture','synthetic-hash','member',1,1)").run(user);
    old.prepare("INSERT INTO entries VALUES (?,'fixture','external','synthetic-root','1','1','[]',1,1,'1:2')").run(entry);
    old.prepare('INSERT INTO grants VALUES (?,?,?,1,1)').run(user,entry,'team');
    old.prepare("INSERT INTO upload_sessions(id,user_id,entry_id,parent,name,size,offset,reserved_bytes,created_at,updated_at,expires_at) VALUES (?,?,?,'team','pending.bin',8,4,8,1,1,9999999999999)").run(upload,user,entry);
    old.prepare('INSERT INTO upload_chunks VALUES (?,0,4,?)').run(upload,'a'.repeat(64));
    before=['users','entries','grants','upload_sessions','upload_chunks'].map(table=>old.prepare(`SELECT * FROM ${table}`).all());
  }finally{old.close();}
  f.migrate();const current=f.open();expect(current.isReady()).toBe(true);
  expect(['users','entries','grants','upload_sessions','upload_chunks'].map(table=>current.sqlite.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);
  expect(current.sqlite.prepare('SELECT count(*) AS n FROM operations').get()).toEqual({n:0});expect(current.sqlite.prepare('SELECT count(*) AS n FROM operation_items').get()).toEqual({n:0});expect(current.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

test('revision 9 升級保留 manifest，新增空 artifact table',async()=>{
  const f=await databaseFixture();await mkdir(f.config.stateDirectory);const old=new Database(join(f.config.stateDirectory,'filehub.db'));const user=randomUUID(),entry=randomUUID(),id=randomUUID();let before:unknown;
  try{old.exec('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)');for(const migration of loadMigrations().slice(0,9)){for(const statement of migration.sql)old.exec(statement);old.prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)').run(migration.hash,migration.folderMillis);}old.prepare("INSERT INTO users VALUES (?,'fixture','synthetic-hash','admin',1,1)").run(user);old.prepare("INSERT INTO entries(id,label,kind,root_path,root_device,root_inode,root_ancestors,enabled) VALUES (?,'fixture','external','synthetic-root','1','1','[]',1)").run(entry);old.prepare("INSERT INTO operations(id,user_id,kind,state,request,resources,created_at,updated_at) VALUES (?,?,'archive','needs_review','{}','[]',1,1)").run(id,user);old.prepare("INSERT INTO operation_items(operation_id,item_index,entry_id,path,updated_at) VALUES (?,0,?,'file',1)").run(id,entry);old.prepare("INSERT INTO operation_nodes(operation_id,item_index,relative_path,kind,source_witness,bytes,sha256) VALUES (?,0,'','file','synthetic-witness',4,?)").run(id,'a'.repeat(64));before=['operations','operation_items','operation_nodes'].map(table=>old.prepare(`SELECT * FROM ${table}`).all());}finally{old.close();}
  f.migrate();const current=f.open();expect(['operations','operation_items','operation_nodes'].map(table=>current.sqlite.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);expect(current.sqlite.prepare('SELECT count(*) AS n FROM operation_artifacts').get()).toEqual({n:0});expect(current.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);expect(current.isReady()).toBe(true);
});

test('revision 8 升級保留 operation／item／reservation，新增空 manifest table',async()=>{
  const f=await databaseFixture();await mkdir(f.config.stateDirectory);const old=new Database(join(f.config.stateDirectory,'filehub.db'));const user=randomUUID(),entry=randomUUID(),id=randomUUID();let before:unknown;
  try{
    old.exec('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)');for(const migration of loadMigrations().slice(0,8)){for(const statement of migration.sql)old.exec(statement);old.prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)').run(migration.hash,migration.folderMillis);}
    old.prepare("INSERT INTO users VALUES (?,'fixture','synthetic-hash','admin',1,1)").run(user);old.prepare("INSERT INTO entries(id,label,kind,root_path,root_device,root_inode,root_ancestors,enabled) VALUES (?,'fixture','managed','synthetic-root','1','1','[]',1)").run(entry);
    old.prepare("INSERT INTO operations(id,user_id,kind,state,request,resources,created_at,updated_at) VALUES (?,?,'archive','queued','{}','[]',1,1)").run(id,user);old.prepare("INSERT INTO operation_items(operation_id,item_index,entry_id,path,updated_at) VALUES (?,0,?,'file',1)").run(id,entry);before=['operations','operation_items'].map(table=>old.prepare(`SELECT * FROM ${table}`).all());
  }finally{old.close();}
  f.migrate();const current=f.open();expect(['operations','operation_items'].map(table=>current.sqlite.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);expect(current.sqlite.prepare('SELECT count(*) AS n FROM operation_nodes').get()).toEqual({n:0});expect(current.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);expect(current.isReady()).toBe(true);
});

test('revision 6 升級保留 P2 journal／trash／grant，新增空 upload tables', async () => {
  const f = await databaseFixture(); await mkdir(f.config.stateDirectory);
  const old = new Database(join(f.config.stateDirectory, 'filehub.db'));
  const user = randomUUID(), entry = randomUUID(), intent = randomUUID(); let before: unknown;
  try {
    old.exec('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)');
    for (const migration of loadMigrations().slice(0, 6)) {
      for (const statement of migration.sql) old.exec(statement);
      old.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(migration.hash, migration.folderMillis);
    }
    old.prepare("INSERT INTO users VALUES (?, 'fixture', 'synthetic-hash', 'member', 1, 1)").run(user);
    old.prepare("INSERT INTO entries VALUES (?, 'legacy', 'external', 'synthetic-root', '1', '1', '[]', 1, 1, '1:2')").run(entry);
    old.prepare('INSERT INTO grants VALUES (?, ?, ?, 1, 1)').run(user, entry, 'team');
    old.prepare("INSERT INTO write_intents (id,user_id,kind,status,owner,generation,resources,payload,created_at,updated_at) VALUES (?,?,'trash','succeeded',?,3,'[]','{}',1,1)").run(intent, user, randomUUID());
    old.prepare("INSERT INTO trash_items (id,entry_id,user_id,original_path,kind,witness,status,mutation_id,created_at,updated_at) VALUES (?, ?, ?, 'team/file', 'file', 'synthetic-witness', 'available', ?, 1, 1)").run(intent, entry, user, intent);
    before = ['entries', 'grants', 'write_intents', 'trash_items'].map((table) => old.prepare(`SELECT * FROM ${table}`).all());
  } finally { old.close(); }
  f.migrate(); const current = f.open();
  expect(current.isReady()).toBe(true);
  expect(['entries', 'grants', 'write_intents', 'trash_items'].map((table) => current.sqlite.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);
  expect(current.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  expect(current.sqlite.prepare('SELECT count(*) AS n FROM upload_sessions').get()).toEqual({ n: 0 });
  expect(current.sqlite.prepare('SELECT count(*) AS n FROM upload_chunks').get()).toEqual({ n: 0 });
});

test('revision 1 升級保留原資料，加入 identity 並保留固定初始 migration hash', async () => {
  const f = await databaseFixture();
  await mkdir(f.config.stateDirectory);
  const old = new Database(join(f.config.stateDirectory, 'filehub.db'));
  const first = loadMigrations()[0];
  if (!first) throw new Error('missing initial migration');
  try {
    old.exec(await readFile(join(DEFAULT_MIGRATIONS_DIRECTORY, '0000_initial_schema.sql'), 'utf8'));
    old.exec('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC); CREATE TABLE p11_upgrade_proof (value TEXT);');
    old.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(first.hash, first.folderMillis);
    old.prepare('INSERT INTO p11_upgrade_proof VALUES (?)').run('preserve synthetic data');
  } finally { old.close(); }
  f.migrate();
  const current = f.open();
  expect(current.isReady()).toBe(true);
  expect(current.sqlite.prepare('SELECT revision FROM schema_state').get()).toEqual({ revision: SCHEMA_REVISION });
  expect(current.sqlite.prepare('SELECT * FROM p11_upgrade_proof').get()).toEqual({ value: 'preserve synthetic data' });
  expect(current.sqlite.prepare('SELECT count(*) AS n FROM users').get()).toEqual({ n: 0 });
});

test('revision 2 升級保留帳號 hash／有效 session／節流，再加入可用入口', async () => {
  const fixture = await databaseFixture();
  await mkdir(fixture.config.stateDirectory);
  const old = new Database(join(fixture.config.stateDirectory, 'filehub.db'));
  const userId = randomUUID(), password = 'Legacy synthetic password 2026!';
  const passwordHash = await hashPassword(password), raw = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(raw).digest('hex'), expiresAt = Date.now() + 60_000;
  try {
    old.exec('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)');
    for (const migration of loadMigrations().slice(0, 2)) {
      for (const statement of migration.sql) old.exec(statement);
      old.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(migration.hash, migration.folderMillis);
    }
    old.prepare('INSERT INTO users (id, username, password_hash, role, enabled, created_at) VALUES (?, ?, ?, ?, 1, 1)').run(userId, 'legacy', passwordHash, 'admin');
    old.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(tokenHash, userId, expiresAt);
    old.prepare('INSERT INTO login_throttle VALUES (?, 123, 2)').run('synthetic-upgrade-throttle');
    expect(old.prepare('SELECT revision FROM schema_state').get()).toEqual({ revision: 2 });
  } finally { old.close(); }
  fixture.migrate();
  const current = fixture.open();
  expect(current.isReady()).toBe(true);
  expect(current.sqlite.prepare('SELECT id, password_hash, role, enabled FROM users').get()).toEqual({ id: userId, password_hash: passwordHash, role: 'admin', enabled: 1 });
  expect(current.sqlite.prepare('SELECT * FROM sessions').get()).toEqual({ token_hash: tokenHash, user_id: userId, expires_at: expiresAt });
  expect(current.sqlite.prepare('SELECT * FROM login_throttle').get()).toEqual({ key: 'synthetic-upgrade-throttle', window_start: 123, attempts: 2 });
  const identity = new IdentityService(current);
  expect(identity.authenticate(raw).user).toMatchObject({ id: userId, username: 'legacy', role: 'admin' });
  expect((await identity.login('legacy', password, '127.0.0.1')).session.user.id).toBe(userId);
  const root = join(fixture.directory, 'files'); await mkdir(root);
  const entries = new EntryService(current);
  const entry = await entries.register('managed', 'Upgrade fixture', root);
  expect(entries.list(userId)).toMatchObject([{ id: entry.id }]);
});

test('revision 3 升級保留既有 entries／grants，加入空 write journal', async () => {
  const fixture = await databaseFixture(); await mkdir(fixture.config.stateDirectory);
  const old = new Database(join(fixture.config.stateDirectory, 'filehub.db'));
  const user = randomUUID(), entry = randomUUID();
  let before: unknown;
  try {
    old.exec('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)');
    for (const migration of loadMigrations().slice(0, 3)) {
      for (const statement of migration.sql) old.exec(statement);
      old.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(migration.hash, migration.folderMillis);
    }
    old.prepare("INSERT INTO users VALUES (?, 'fixture', 'synthetic-hash', 'member', 1, 1)").run(user);
    old.prepare("INSERT INTO entries VALUES (?, 'legacy', 'external', 'synthetic-root', '1', '1', '[]', 1)").run(entry);
    old.prepare('INSERT INTO grants VALUES (?, ?, ?, 1)').run(user, entry, 'team');
    before = [old.prepare('SELECT * FROM entries').all(), old.prepare('SELECT * FROM grants').all()];
  } finally { old.close(); }
  fixture.migrate(); const current = fixture.open();
  expect(current.isReady()).toBe(true);
  expect([current.sqlite.prepare('SELECT id,label,kind,root_path,root_device,root_inode,root_ancestors,enabled FROM entries').all(), current.sqlite.prepare('SELECT user_id,entry_id,scope,can_download FROM grants').all()]).toEqual(before);
  expect(current.sqlite.prepare('SELECT count(*) AS n FROM write_intents').get()).toEqual({ n: 0 });
});

test('revision 5 升級保留 opt-in、grant 與未完成意圖，垃圾桶初始為空', async () => {
  const f = await databaseFixture(); await mkdir(f.config.stateDirectory);
  const old = new Database(join(f.config.stateDirectory, 'filehub.db'));
  const user = randomUUID(), entry = randomUUID(), intent = randomUUID(); let before: unknown;
  try {
    old.exec('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)');
    for (const migration of loadMigrations().slice(0, 5)) {
      for (const statement of migration.sql) old.exec(statement);
      old.prepare('INSERT INTO __drizzle_migrations (hash,created_at) VALUES (?,?)').run(migration.hash, migration.folderMillis);
    }
    old.prepare("INSERT INTO users VALUES (?, 'legacy', 'synthetic-hash', 'admin', 1, 1)").run(user);
    old.prepare("INSERT INTO entries (id,label,kind,root_path,root_device,root_inode,root_ancestors,enabled,writable,control_identity) VALUES (?, 'legacy', 'external', 'synthetic-root', '1', '1', '[]', 1, 1, '1:2')").run(entry);
    old.prepare("INSERT INTO grants (user_id,entry_id,scope,can_download,can_write) VALUES (?,?,'team',1,1)").run(user, entry);
    old.prepare("INSERT INTO write_intents (id,user_id,kind,status,owner,generation,resources,payload,created_at,updated_at) VALUES (?,?,'rename','applying',?,2,?,'{}',1,1)").run(intent, user, randomUUID(), JSON.stringify([{ entryId: entry, path: 'team' }]));
    before = ['entries', 'grants', 'write_intents'].map((table) => old.prepare(`SELECT * FROM ${table}`).all());
  } finally { old.close(); }
  f.migrate(); const current = f.open();
  expect(current.isReady()).toBe(true);
  expect(['entries', 'grants', 'write_intents'].map((table) => current.sqlite.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);
  expect(current.sqlite.prepare('SELECT count(*) AS n FROM trash_items').get()).toEqual({ n: 0 });
});
