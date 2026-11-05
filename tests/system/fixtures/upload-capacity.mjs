// 只由 Compose 測試以 Node -e 在專屬 8 MiB /dev/shm、16 MiB state tmpfs 執行。
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, statfs, readFile, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { migrateDatabase, openDatabase, EntryService, MutationService, UploadService, UploadMaintainer } from './apps/server/dist/index.js';

const fs = await statfs('/dev/shm'); assert.equal(fs.bsize * fs.blocks, 8 * 1024 * 1024);
const config = { stateDirectory: '/data/state', sqliteBusyTimeoutMs: 100 }; migrateDatabase(config); const db = openDatabase(config);
const user = randomUUID(); db.sqlite.prepare("INSERT INTO users VALUES (?, 'capacity', 'synthetic-hash', 'admin', 1, 1)").run(user);
const root = `/dev/shm/filehub-capacity-${randomUUID()}`; await mkdir(root); await writeFile(`${root}/original.bin`, 'original canary');
const entries = new EntryService(db), entry = (await entries.register('managed', 'capacity fixture', root)).id; await entries.setWritable(entry, true);
const mutations = new MutationService(db, entries), uploads = new UploadService(db, entries, mutations), maintenance = new UploadMaintainer(db);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex'), chunk = Buffer.alloc(4 * 1024 * 1024, 0x61);
const source = (bytes) => Readable.from((function* () { for (let i = 0; i < bytes.length; i += 65536) yield bytes.subarray(i, i + 65536); })());
try {
  const id = randomUUID(); await uploads.create(user, entry, { id, parent: '', name: 'capacity.bin', size: 12 * 1024 * 1024 });
  await uploads.receive(user, id, 0, chunk.length, hash(chunk), source(chunk));
  await assert.rejects(uploads.receive(user, id, chunk.length, chunk.length, hash(chunk), source(chunk)), (error) => error?.code === 'STORAGE_FULL');
  assert.equal(uploads.get(user, id).offset, chunk.length); assert.equal(uploads.get(user, id).state, 'open');
  const payload = `${root}/.filehub/staging/u-${id}`; assert.equal((await stat(payload)).size, chunk.length); assert.equal(hash(await readFile(payload)), hash(chunk));
  await assert.rejects(stat(`${root}/capacity.bin`)); assert.equal(await readFile(`${root}/original.bin`, 'utf8'), 'original canary');
  uploads.cancel(user, id); assert.equal((await maintenance.run()).items[0]?.outcome, 'cleaned');
  assert.equal(db.sqlite.prepare('SELECT cleaned,reserved_bytes FROM upload_sessions WHERE id=?').get(id).reserved_bytes, 0);
  const small = Buffer.from([0, 255, 9]), second = randomUUID(); await uploads.create(user, entry, { id: second, parent: '', name: 'after-full.bin', size: small.length, sha256: hash(small) });
  await uploads.receive(user, second, 0, small.length, hash(small), source(small)); assert.equal((await uploads.finalize(user, second)).state, 'completed'); assert((await readFile(`${root}/after-full.bin`)).equals(small));
  console.info(JSON.stringify({ capacityBytes: fs.bsize * fs.blocks, committedBytes: chunk.length, storageFull: true, prefixIntact: true, cleanupReleased: true, retryPublished: true }));
} finally { await maintenance.close(); await uploads.close(); await mutations.close(); db.close(); }
