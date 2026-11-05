import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { openDatabase, parseDatabaseConfig, EntryService, MutationService, UploadService } from '../../../apps/server/dist/index.js';

const db = openDatabase(parseDatabaseConfig()), entries = new EntryService(db), mutations = new MutationService(db, entries);
let release = () => {};
const uploads = new UploadService(db, entries, mutations, { checkpoint: async (phase, id) => {
  if (phase !== process.env.P3_PHASE) return;
  const waiting = new Promise((resolve) => { release = resolve; });
  process.send?.({ type: 'checkpoint', phase, id }); await waiting;
} });
const operation = (async () => {
  try {
    const user = process.env.P3_USER, id = process.env.P3_ID;
    if (process.env.P3_PHASE === 'verified') await uploads.finalize(user, id);
    else { const bytes = Buffer.from(process.env.P3_BYTES, 'base64'); await uploads.receive(user, id, Number(process.env.P3_OFFSET), bytes.length, createHash('sha256').update(bytes).digest('hex'), Readable.from([bytes])); }
    process.send?.({ type: 'finished' });
  } catch { process.send?.({ type: 'failed' }); }
})();
let closing;
const close = () => closing ??= (async () => { release(); await operation; await uploads.close(); await mutations.close(); db.close(); })();
process.on('message', (message) => {
  if (message?.action === 'stop') void close().then(() => { process.send?.({ type: 'reply', id: message.id }); process.disconnect(); });
});
process.once('disconnect', () => { void close(); });
