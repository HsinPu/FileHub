// 正式 image 的 Node -e probe；state 與 /dev/shm 均是本次容器私有 tmpfs。
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { migrateDatabase, openDatabase, EntryService, MutationService, UploadService, UploadMaintainer } from './apps/server/dist/index.js';

const config = { stateDirectory: '/data/state', sqliteBusyTimeoutMs: 100 }; migrateDatabase(config); const db = openDatabase(config), user = randomUUID();
db.sqlite.prepare("INSERT INTO users VALUES (?, 'cli', 'synthetic-hash', 'admin', 1, 1)").run(user);
const root = `/dev/shm/filehub-cli-${randomUUID()}`; await mkdir(root);
const entries = new EntryService(db), entry = (await entries.register('managed', 'CLI fixture', root)).id; await entries.setWritable(entry, true);
const mutations = new MutationService(db, entries), maintenance = new UploadMaintainer(db);
const gate = Promise.withResolvers(), claimed = Promise.withResolvers();
const uploads = new UploadService(db, entries, mutations, { checkpoint: async (phase) => { if (phase === 'claimed') { claimed.resolve(); await gate.promise; } } });
function cli(expected) {
  const result = spawnSync(process.execPath, ['apps/server/dist/cli.js', 'upload-maintain'], { encoding: 'utf8', timeout: 8000, maxBuffer: 65536 });
  assert.equal(result.status, expected); assert.equal(result.stderr, ''); return JSON.parse(result.stdout);
}
try {
  const expired = randomUUID(); await uploads.create(user, entry, { id: expired, parent: '', name: 'expired', size: 0 }); db.sqlite.prepare('UPDATE upload_sessions SET expires_at=0 WHERE id=?').run(expired);
  assert.deepEqual(cli(0).items, [{ id: expired, outcome: 'cleaned' }]);
  const id = randomUUID(), bytes = Buffer.from([0, 255, 3]); await uploads.create(user, entry, { id, parent: '', name: 'active', size: bytes.length });
  const running = uploads.receive(user, id, 0, bytes.length, createHash('sha256').update(bytes).digest('hex'), Readable.from([bytes]));
  await claimed.promise; assert.deepEqual(cli(2).items, [{ id, outcome: 'busy' }]); gate.resolve(); await running;
  uploads.cancel(user, id); assert.equal((await maintenance.run()).items[0]?.outcome, 'cleaned'); assert.deepEqual(cli(0).items, []);
  console.info(JSON.stringify({ cliExitResolved: 0, cliExitBusy: 2, activeOwnerUntouched: true, cleanupConfirmed: true }));
} finally { gate.resolve(); await maintenance.close(); await uploads.close(); await mutations.close(); db.close(); }
