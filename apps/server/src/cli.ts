import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { parseDatabaseConfig, type Environment } from './config/index.js';
import { openServiceDatabase } from './persistence/runtime.js';
import { IdentityService } from './modules/identity/service.js';
import { PublicError } from './plugins/errors.js';
import { recoverWrites } from './storage/recovery.js';
import { UploadMaintainer } from './modules/uploads/maintenance.js';
import { runEntryAdmin } from './modules/entries/admin.js';
import { recoverOperations } from './modules/operations/recovery.js';
import { ArtifactStore } from './modules/operations/artifacts.js';
import { EntryService } from './modules/entries/service.js';

async function passwordInput(): Promise<string> {
  if (!process.stdin.isTTY) {
    process.stdin.setEncoding('utf8');
    let data = '';
    for await (const chunk of process.stdin) {
      data += String(chunk);
      if (Buffer.byteLength(data) > 4096) throw new PublicError('BAD_REQUEST');
    }
    const input: unknown = JSON.parse(data);
    if (!input || typeof input !== 'object' || !('password' in input) || typeof input.password !== 'string') throw new PublicError('BAD_REQUEST');
    return input.password;
  }
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const input = createInterface({ input: process.stdin, output, terminal: true });
  const abort = new AbortController();
  input.once('SIGINT', () => abort.abort());
  process.stdout.write('密碼（不顯示，至少 15 字元）：');
  try { return await input.question('', { signal: abort.signal }); }
  finally { input.close(); process.stdout.write('\n'); }
}

export async function runAdmin(args: readonly string[], environment: Environment, readPassword: () => Promise<string> = passwordInput): Promise<unknown> {
  const [command, username] = args;
  const entryCommand = command?.startsWith('entry-');
  const recoveryCommand = command === 'write-recover' || command === 'upload-maintain' || command === 'operation-recover'||command==='archive-maintain';
  if (!entryCommand && !recoveryCommand && (args.length !== 2 || !username || !['bootstrap', 'user-create', 'user-disable', 'user-password'].includes(command ?? ''))) throw new PublicError('BAD_REQUEST');
  const runtime=await openServiceDatabase(parseDatabaseConfig(environment)),database=runtime.database;
  try {
    if (!database.isReady()) throw new PublicError('SERVICE_UNAVAILABLE');
    if (recoveryCommand) {
      if (args.length !== 1) throw new PublicError('BAD_REQUEST');
      if (command === 'write-recover') return await recoverWrites(database);
      if (command === 'operation-recover') return await recoverOperations(database);
      if(command==='archive-maintain')return {items:await new ArtifactStore(database,new EntryService(database)).maintain()};
      const maintainer = new UploadMaintainer(database);
      try { return await maintainer.run(); } finally { await maintainer.close(); }
    }
    if (entryCommand) return await runEntryAdmin(database, args);
    if (!username) throw new PublicError('BAD_REQUEST');
    const identity = new IdentityService(database);
    switch (command) {
      case 'bootstrap': await identity.bootstrap(username, await readPassword()); break;
      case 'user-create': await identity.createUser(username, await readPassword()); break;
      case 'user-password': await identity.changePassword(username, await readPassword()); break;
      case 'user-disable': await identity.disableUser(username); break;
    }
  } finally { await runtime.close(); }
}

if (import.meta.main) {
  void runAdmin(process.argv.slice(2), process.env).then((result: unknown) => {
    console.info(result === undefined ? '管理操作已完成。' : JSON.stringify(result));
    if (['write-recover','operation-recover'].includes(process.argv[2]??'') && result && typeof result === 'object' && 'items' in result && Array.isArray(result.items)
      && result.items.some((item: unknown) => !item || typeof item !== 'object' || !('outcome' in item) || !['succeeded', 'partial','cancelled','failed'].includes(String(item.outcome)))) process.exitCode = 2;
    if (process.argv[2] === 'upload-maintain' && result && typeof result === 'object') {
      const value = result as { items?: { outcome: string }[]; publications?: { outcome: string }[] };
      if (value.items?.some((item) => !['open', 'cleaned'].includes(item.outcome)) || value.publications?.some((item) => !['succeeded', 'failed'].includes(item.outcome))) process.exitCode = 2;
    }
    if(process.argv[2]==='archive-maintain'&&result&&typeof result==='object'&&'items'in result&&Array.isArray(result.items)&&result.items.some((item:unknown)=>!item||typeof item!=='object'||!('outcome'in item)||!['expired','failed','cancelled'].includes(String(item.outcome))))process.exitCode=2;
  }).catch(() => {
    console.error('管理操作失敗，請檢查命令、帳號／入口狀態與資料庫；新密碼須至少 15 字元。');
    process.exitCode = 1;
  });
}
