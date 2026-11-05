import { isAbsolute } from 'node:path';
import { parseDatabaseConfig, type Environment } from './config/index.js';
import { backupDatabase, restoreDatabaseBackup } from './persistence/backup.js';
import { openServiceDatabase } from './persistence/runtime.js';
import { assertIdleOwners } from './lifecycle/state-lock.js';

// 操作者先停止 api／worker；此命令只備份 DB，完整檔案／設定使用 maintenance.ts。
export async function main(argv = process.argv.slice(2), environment: Environment = process.env): Promise<void> {
  const [action, target, ...extra] = argv;
  if (!target || !isAbsolute(target) || extra.length !== 0) throw new Error('需要 action 與絕對目標路徑。');
  const config = parseDatabaseConfig(environment);
  if (action === 'restore') return restoreDatabaseBackup(target, config);
  if (action !== 'backup') throw new Error('不支援的 DB 維護動作。');
  const runtime=await openServiceDatabase(config,'exclusive');
  try{await assertIdleOwners(config.stateDirectory);await backupDatabase(runtime.database,target);}
  finally{await runtime.close();}
}

if (import.meta.main) {
  void main().catch(() => {
    console.error('FileHub DB 維護失敗；請確認服務已停止、路徑與 migration 相容性。');
    process.exitCode = 1;
  });
}
