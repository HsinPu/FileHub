import { mkdir } from 'node:fs/promises';
import { acquireStateLock,assertIdleOwners } from './lifecycle/state-lock.js';
import { ConfigError, parseDatabaseConfig, type Environment } from './config/index.js';
import { migrateDatabase } from './persistence/migrate.js';

export async function main(environment:Environment=process.env):Promise<void>{
  const config=parseDatabaseConfig(environment);await mkdir(config.stateDirectory,{recursive:true,mode:0o700});const lock=await acquireStateLock(config.stateDirectory,'exclusive');try{await assertIdleOwners(config.stateDirectory);migrateDatabase(config);}finally{await lock.close();}
}

if (import.meta.main) {
  void main().then(()=>{console.info('FileHub 資料庫 migration 完成。');}).catch((error:unknown)=>{
    const reason = error instanceof ConfigError ? error.message : '請檢查本機 state 目錄、migration 紀錄與備份。';
    console.error(`FileHub 資料庫 migration 失敗：${reason}`);
    process.exitCode = 1;
  });
}
