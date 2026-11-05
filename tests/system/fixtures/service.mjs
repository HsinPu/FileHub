import process from 'node:process';
import console from 'node:console';
import { main as apiMain } from '../../../apps/server/dist/server.js';
import { main as workerMain } from '../../../apps/server/dist/worker.js';
import { closeApp } from '../../../apps/server/dist/index.js';

// IPC 只屬於測試 wrapper，正式入口不註冊這些控制命令。
let close = async () => {};
try {
  const role = process.argv[2];
  if (role !== 'api' && role !== 'worker') throw new Error('invalid fixture role');
  const service = role === 'api' ? await apiMain() : await workerMain();
  close = role === 'api' ? () => closeApp(service.app, 1000) : service.close;
  const status = () => role === 'api' ? { listening: service.app.server.listening } : service.worker.getStatus();
  let stopping = false;
  const fail = async () => {
    console.error('Service fixture failed.');
    process.exitCode = 1;
    await close().catch(() => {});
    if (process.connected) process.disconnect();
  };
  const onMessage = (message) => {
    if (stopping || !message || typeof message !== 'object') return;
    void (async () => {
      if (message.action === 'status') {
        process.send?.({ type: 'reply', id: message.id, status: status() });
      } else if (message.action === 'stop') {
        stopping = true;
        process.emit(message.signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
        await close();
        let databaseClosed = false;
        try { service.databaseDiagnostics(); } catch { databaseClosed = true; }
        process.send?.({ type: 'reply', id: message.id, status: status(), databaseClosed,
          signals: [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')] }, () => {
          process.off('message', onMessage);
          if (process.connected) process.disconnect();
        });
      }
    })().catch(fail);
  };
  process.on('message', onMessage);
  process.once('disconnect', () => { void close().catch(fail); });
  process.send?.({ type: 'started', role, pid: process.pid, node: process.version,
    database: service.databaseDiagnostics(), ...(role === 'api' ? { address: service.address } : { status: status() }) });
} catch {
  await close().catch(() => {});
  console.error('Service fixture startup failed.');
  process.exitCode = 1;
  if (process.connected) process.disconnect();
}
