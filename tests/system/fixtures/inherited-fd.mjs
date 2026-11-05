import process from 'node:process';
import { closeSync, fstatSync } from 'node:fs';
if (!fstatSync(3).isFile()) throw new Error('Invalid inherited fixture descriptor');
process.on('message', (message) => {
  if (message?.action === 'stop') { closeSync(3); process.send?.({ type: 'reply', id: message.id }); process.disconnect(); }
});
process.send?.({ type: 'started' });
