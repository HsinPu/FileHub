import process from 'node:process';
import { openDatabase, parseDatabaseConfig, WriteCoordinator } from '../../../apps/server/dist/index.js';
const db = openDatabase(parseDatabaseConfig());
const coordinator = new WriteCoordinator(db);
let handle;
try { handle = coordinator.begin(process.env.P2_USER, 'rename', [{ entryId: process.env.P2_ENTRY, path: process.env.P2_PATH }], { test: true }); }
catch (error) { process.send?.({ type: 'started', error: error.code }); }
if (handle) process.send?.({ type: 'started', handle });
process.on('message', (message) => {
  if (message.action === 'stop') {
    if (handle) coordinator.transition(handle, 'prepared', 'failed');
    db.close(); process.send?.({ type: 'reply', id: message.id }, () => { process.disconnect(); });
  } else if (message.action === 'status') process.send?.({ type: 'reply', id: message.id, status: handle ? coordinator.get(process.env.P2_USER, handle.id) : null });
});
process.on('disconnect', () => { db.close(); });
