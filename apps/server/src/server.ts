import { buildApp } from './app.js';
import { ConfigError, parseConfig, type Environment } from './config/index.js';
import { closeApp, listenApp } from './runtime.js';
import { openServiceDatabase } from './persistence/runtime.js';
import { registerShutdownSignals } from './lifecycle/shutdown.js';
import { DEFAULT_WEB_ROOT } from './plugins/web.js';
import { IdentityService } from './modules/identity/service.js';
import { EntryService } from './modules/entries/service.js';
import { TrashService } from './modules/trash/service.js';
import { MutationService } from './modules/files/mutations.js';
import { FileService } from './modules/files/service.js';
import { UploadService } from './modules/uploads/service.js';
import { OperationCatalog } from './modules/operations/catalog.js';
import { OperationService } from './modules/operations/service.js';
import { ArtifactStore } from './modules/operations/artifacts.js';

import { ShareService } from './modules/shares/service.js';

import { SettingsService } from './modules/settings/service.js';

export async function main(environment: Environment = process.env) {
  const config = parseConfig(environment);
  const runtime=await openServiceDatabase(config),database=runtime.database;
  try {
  const entries = new EntryService(database),identity=new IdentityService(database);
  const mutations = new MutationService(database, entries);
  const uploads = new UploadService(database, entries, mutations);
  const files = new FileService(entries), operations = new OperationService(new OperationCatalog(database), entries, files,new Set(['copy','move','archive'])),artifacts=new ArtifactStore(database,entries,files);
  const app = (() => {
    try {
      return buildApp({ config, webRoot: DEFAULT_WEB_ROOT, dependencies: { identity,settings:new SettingsService(database,identity,entries), shares:new ShareService(database,entries,files), entries, mutations, uploads, operations,artifacts, trash: new TrashService(database, entries, mutations), files, readiness: (signal) => !signal.aborted && database.isReady() } });
    } catch (error) {
      database.close();
      throw error;
    }
  })();
  const detach = registerShutdownSignals(() => closeApp(app, config.shutdownTimeoutMs), () => {
    app.log.error({ event: 'shutdown_failed' }, 'API 未正常完成關閉');
    process.exit(1);
  });
  app.addHook('onClose', async () => { detach(); try { await uploads.close(); } finally { try { await mutations.close(); } finally { await runtime.close(); } } });
  try {
    const address = await listenApp(app, config);
    app.log.info({ address }, 'FileHub API 已啟動');
    return { app, address, databaseDiagnostics: () => database.diagnostics() };
  } catch (error) {
    detach();
    try{await app.close();}finally{await runtime.close();}
    throw error;
  }
  } catch(error){await runtime.close();throw error;}
}

if (import.meta.main) {
  void main().catch((error: unknown) => {
    const reason = error instanceof ConfigError ? error.message : '請檢查 FILEHUB_* 設定、資料庫 migration 與使用中的連接埠。';
    console.error(`FileHub API 啟動失敗：${reason}`);
    process.exitCode = 1;
  });
}
