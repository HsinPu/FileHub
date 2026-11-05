import { join } from 'node:path';
import { createTemporaryDirectory } from '../../../../tests/helpers/temporary-directory.js';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import Fastify from 'fastify';
import { expect, onTestFinished, test } from 'vitest';

test('Fastify 的 TypeBox 型別與實際輸入驗證相容', async () => {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();
  app.post('/toolchain-fixture', {
    schema: {
      body: Type.Object({ sequence: Type.Integer() }),
      response: { 200: Type.Object({ label: Type.String() }) },
    },
  }, (request) => ({ label: request.body.sequence.toFixed(0) }));

  try {
    const valid = await app.inject({ method: 'POST', url: '/toolchain-fixture', payload: { sequence: 7 } });
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toEqual({ label: '7' });
    const invalid = await app.inject({ method: 'POST', url: '/toolchain-fixture', payload: { sequence: 'invalid' } });
    expect(invalid.statusCode).toBe(400);
  } finally {
    await app.close();
  }
});

test('原生 SQLite 與 Drizzle 能操作隔離檔案並保留已提交資料', async () => {
  const temporary = await createTemporaryDirectory('filehub-p01-');
  const { directory } = temporary;
  const databasePath = join(directory, 'toolchain.db');
  const samples = sqliteTable('samples', { id: integer().primaryKey(), label: text().notNull() });
  let sqlite: Database.Database | undefined;

  onTestFinished(async () => {
    if (sqlite?.open) sqlite.close();
    await temporary.dispose();
  });

  sqlite = new Database(databasePath);
  const version = sqlite.prepare<[], { version: string }>('SELECT sqlite_version() AS version').get();
  expect(version?.version).toBe('3.53.4');
  sqlite.pragma('journal_mode = WAL');
  expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
  sqlite.exec('CREATE TABLE samples (id INTEGER PRIMARY KEY, label TEXT NOT NULL)');
  const db = drizzle(sqlite);
  db.insert(samples).values({ id: 1, label: 'committed' }).run();
  expect(() => db.transaction((transaction) => {
    transaction.insert(samples).values({ id: 2, label: 'rolled back' }).run();
    throw new Error('fixture rollback');
  })).toThrow('fixture rollback');
  sqlite.close();

  sqlite = new Database(databasePath);
  expect(drizzle(sqlite).select().from(samples).all()).toEqual([{ id: 1, label: 'committed' }]);
});
