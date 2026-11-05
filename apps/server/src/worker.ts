import { ConfigError, parseWorkerConfig, type Environment } from './config/index.js';
import { createShutdown, registerShutdownSignals } from './lifecycle/shutdown.js';
import { openServiceDatabase } from './persistence/runtime.js';
import { startIdleWorker, type WorkerStatus } from './worker/idle.js';
import { createHeartbeatPublisher, readProcessIdentity } from './worker/heartbeat.js';
import { UploadMaintainer } from './modules/uploads/maintenance.js';
import { OperationCatalog } from './modules/operations/catalog.js';
import { OperationExecutor } from './modules/operations/executor.js';
import { TransferHandler } from './modules/operations/transfers.js';
import { EntryService } from './modules/entries/service.js';
import { MutationService } from './modules/files/mutations.js';
import { ArtifactStore } from './modules/operations/artifacts.js';
import { ArchiveHandler } from './modules/operations/archives.js';

const logLevels = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, silent: Infinity } as const;

export async function main(environment: Environment = process.env) {
  const config = parseWorkerConfig(environment);
  const runtime=await openServiceDatabase(config),database=runtime.database;
  try {
  const uploads = new UploadMaintainer(database);
  const entries=new EntryService(database),transfers=new TransferHandler(entries,new MutationService(database,entries)),artifacts=new ArtifactStore(database,entries),archive=new ArchiveHandler(artifacts);
  let nextMaintenance = 0, previousMaintenance = '';
  const log = (level: 'debug' | 'info' | 'warn', event: string, status?: WorkerStatus) => {
    if (logLevels[config.logLevel] <= logLevels[level]) console.info(JSON.stringify({ level, event, pid: process.pid, ...status }));
  };
  let previousState: WorkerStatus['state'] | undefined;
  let publisher: ReturnType<typeof createHeartbeatPublisher> | undefined;
  if (config.workerHeartbeatFile) {
    const identity = await readProcessIdentity(process.pid);
    if (!identity) { database.close(); throw new Error('Worker heartbeat 需要 Linux /proc。'); }
    publisher = createHeartbeatPublisher(config.workerHeartbeatFile, identity);
  }
  const worker = (() => {
    try {
      return startIdleWorker({
        pollIntervalMs: config.workerPollIntervalMs,
        readiness: () => database.isReady(),
        ...(process.platform === 'linux' ? { maintenance: async (signal: AbortSignal) => {
          if (Date.now() < nextMaintenance || signal.aborted) return;
          nextMaintenance = Date.now() + config.uploadMaintenanceIntervalMs;
          try {
            const result = await uploads.run(signal), signature = JSON.stringify(result);
            if (signature !== previousMaintenance && (result.items.length || result.publications.length)) log('info', 'upload_maintenance');
            previousMaintenance = signature;
          } catch { log('warn', 'upload_maintenance_unavailable'); }
          try{const result=await artifacts.maintain(signal);if(result.length)log('info','archive_maintenance');}catch{log('warn','archive_maintenance_unavailable');}
        } } : {}),
        onCheck: (status) => {
          publisher?.publish(status);
          if (previousState !== status.state) log(status.ready ? 'info' : 'warn', 'worker_state', status);
          previousState = status.state;
          log('debug', 'worker_tick', status);
        },
      });
    } catch (error) { database.close(); throw error; }
  })();
  let detach = () => {};
  const executor = process.platform === 'linux' ? new OperationExecutor(new OperationCatalog(database), new Map([['copy',transfers.handle],['move',transfers.handle],['archive',archive.handle]]), config.workerPollIntervalMs) : undefined;
  const close = createShutdown(async () => {
    detach();
    try {
      try {
        const stopped=await Promise.allSettled([worker.stop(),executor?.close()]);
        const failure=stopped.find(result=>result.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
      }
      finally {
        publisher?.publish(worker.getStatus());
        await publisher?.flush();
      }
    }
    finally { try { try{await uploads.close();}finally{await transfers.close();} } finally { await runtime.close(); } }
    log('info', 'worker_stopped', worker.getStatus());
  }, config.shutdownTimeoutMs);
  detach = registerShutdownSignals(close, () => {
    console.error('FileHub worker 未在期限內正常關閉。');
    process.exit(1);
  });
  const done = worker.done.then(close, close);
  // 呼叫端仍可觀察 done 的 rejection；CLI 下方負責回報並以非零退出。
  void done.catch(() => {});
  try { await publisher?.flush(); }
  catch (error) { await close(); throw error; }
  return { worker, close, done, databaseDiagnostics: () => database.diagnostics() };
  } catch(error){await runtime.close();throw error;}
}

if (import.meta.main) {
  void main().then((service) => service.done).catch((error: unknown) => {
    const reason = error instanceof ConfigError ? error.message : '請檢查本機 state 目錄與資料庫 migration。';
    console.error(`FileHub worker 啟動失敗：${reason}`);
    process.exitCode = 1;
  });
}
