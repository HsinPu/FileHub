import process from 'node:process';
import { openDatabase, parseDatabaseConfig, EntryService, FileService, MutationService, TrashService } from '../../../apps/server/dist/index.js';
import { randomUUID } from 'node:crypto';

const db = openDatabase(parseDatabaseConfig());
let release = () => {};
const entries = new EntryService(db), files = new FileService(entries);
const mutations = new MutationService(db, entries, { checkpoint: async (phase, id) => {
  if (phase !== process.env.P2_PHASE) return;
  const waiting = new Promise((resolve) => { release = resolve; });
  const row = db.sqlite.prepare('SELECT owner,generation FROM write_intents WHERE id=?').get(id);
  process.send?.({ type: 'checkpoint', phase, id, ...row });
  await waiting;
} });
const trash = new TrashService(db, entries, mutations);
const version = async (path) => (await files.metadata(process.env.P2_USER, process.env.P2_ENTRY, path)).resource.version;
const operation = (async () => {
  const user = process.env.P2_USER, entry = process.env.P2_ENTRY, id = randomUUID();
  try {
    let result;
    if (process.env.P2_KIND === 'mkdir') result = await mutations.mkdir(user, entry, { id, parent: 'team', parentVersion: await version('team'), name: process.env.P2_TARGET ?? 'created' });
    else if (process.env.P2_KIND === 'trash') result = await trash.put(user, entry, { id, path: 'team/source.bin', version: await version('team/source.bin') });
    else if (process.env.P2_KIND === 'restore') {
      const item = (await trash.list(user, entry)).items[0];
      if (!item) throw new Error('missing fixture trash');
      result = await trash.restore(user, entry, item.id, { id, parent: 'team', parentVersion: await version('team'), name: process.env.P2_TARGET ?? 'restored.bin', version: item.version });
    } else result = await mutations.rename(user, entry, { id, path: 'team/source.bin', version: await version('team/source.bin'), parent: 'team', parentVersion: await version('team'), name: process.env.P2_TARGET ?? 'target.bin' });
    process.send?.({ type: 'finished', result });
  } catch (error) { process.send?.({ type: 'finished', error: typeof error?.code === 'string' ? error.code : 'fixture_failed' }); }
})();
let closing;
const close = () => closing ??= (async () => { release(); await operation; await mutations.close(); db.close(); })();
process.on('message', (message) => {
  if (message?.action === 'status') { release(); process.send?.({ type: 'reply', id: message.id }); }
  if (message?.action === 'stop') void close().then(() => { process.send?.({ type: 'reply', id: message.id }); process.disconnect(); });
});
process.once('disconnect', () => { void close(); });
