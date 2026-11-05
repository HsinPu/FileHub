import Database from 'better-sqlite3';
import { constants } from 'node:fs';
import { lstat,open,readdir,type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { PublicError } from '../plugins/errors.js';
import { native,nativeError } from '../storage/native.js';
import { inspectRoot,openScoped } from '../storage/scoped.js';

export const STATE_LOCK_NAME='.filehub-state.lock';
export const RESTORE_PENDING='.filehub-restore-pending';
const marker=Buffer.from('FileHub state coordination v1\n');
export interface StateLock { close():Promise<void> }
export async function acquireStateLock(directory:string,mode:'shared'|'exclusive'):Promise<StateLock>{
  // Windows 僅供開發；完整 snapshot 工具另在入口明確拒絕。
  if(process.platform!=='linux'){try{await lstat(join(directory,RESTORE_PENDING));throw new PublicError('MUTATION_UNCERTAIN');}catch(error){if(!error||typeof error!=='object'||!('code'in error)||error.code!=='ENOENT')throw error;}return{close:async()=>{}};}
  const parent=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);let handle:FileHandle|undefined;
  try{
    const path=`/proc/self/fd/${parent.fd}/${STATE_LOCK_NAME}`;let created=false;
    try{handle=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_RDWR|constants.O_NOFOLLOW,0o600);created=true;}
    catch(error){if(!error||typeof error!=='object'||!('code'in error)||error.code!=='EEXIST')throw error;handle=await open(path,constants.O_RDWR|constants.O_NOFOLLOW|constants.O_NONBLOCK);}
    if(created){await handle.writeFile(marker);await handle.sync();await parent.sync();}
    const stat=await handle.stat({bigint:true}),uid=process.getuid?.();
    if(!stat.isFile()||stat.nlink!==1n||stat.size!==BigInt(marker.length)||(stat.mode&0o777n)!==0o600n||uid===undefined||stat.uid!==BigInt(uid))throw new PublicError('MUTATION_UNCERTAIN');
    const bytes=Buffer.alloc(marker.length);const read=await handle.read(bytes,0,bytes.length,0);if(read.bytesRead!==bytes.length||!bytes.equals(marker))throw new PublicError('MUTATION_UNCERTAIN');
    const code=await native([mode==='shared'?'lock-shared':'lock'],[handle.fd]);if(code!==0)throw nativeError(code);
    const currentLock=await lstat(path,{bigint:true});if(currentLock.isSymbolicLink()||currentLock.dev!==stat.dev||currentLock.ino!==stat.ino)throw new PublicError('MUTATION_UNCERTAIN');
    try{await lstat(`/proc/self/fd/${parent.fd}/${RESTORE_PENDING}`);throw new PublicError('MUTATION_UNCERTAIN');}catch(error){if(!error||typeof error!=='object'||!('code'in error)||error.code!=='ENOENT')throw error;}
    const current=await lstat(directory,{bigint:true}),pinned=await parent.stat({bigint:true});if(current.isSymbolicLink()||current.dev!==pinned.dev||current.ino!==pinned.ino)throw new PublicError('MUTATION_UNCERTAIN');
    const owned=handle;let closing:Promise<void>|undefined;return{close:()=>closing??=(async()=>{try{await owned.close();}finally{await parent.close();}})()};
  }catch(error){try{await handle?.close();}finally{await parent.close();}throw error;}
}

// 先持有 exclusive state lock，再檢查 inherited I/O guards；不能只看主程序 PID。
export async function assertIdleOwners(directory:string):Promise<void>{
  if(process.platform!=='linux')return;
  const required=new Set<string>();let database:Database.Database|undefined;
  try{const file=await lstat(join(directory,'filehub.db'));if(!file.isFile()||file.isSymbolicLink())throw new PublicError('MUTATION_UNCERTAIN');database=new Database(join(directory,'filehub.db'),{readonly:true,fileMustExist:true,timeout:100});
    for(const table of ['write_intents','operations','upload_sessions','operation_artifacts']){if(!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;const rows=database.prepare<[],{owner:string|null}>(`SELECT owner FROM ${table} WHERE owner IS NOT NULL LIMIT 100001`).all();if(rows.length>100000)throw new PublicError('RESOURCE_LIMIT');for(const row of rows){if(typeof row.owner!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(row.owner))throw new PublicError('MUTATION_UNCERTAIN');required.add(`${row.owner}.lock`);}}
  }catch(error){if(!error||typeof error!=='object'||!('code'in error)||error.code!=='ENOENT')throw error;}finally{database?.close();}
  const root=await inspectRoot(directory);let names:string[];
  try{const opened=await openScoped(root,'write-owners',true);try{names=await readdir(opened.ioPath);}finally{await opened.close();}}
  catch(error){if(error instanceof PublicError&&error.code==='NOT_FOUND'&&required.size===0)return;throw error;}
  if([...required].some(name=>!names.includes(name)))throw new PublicError('MUTATION_UNCERTAIN');
  if(names.length>100000)throw new PublicError('RESOURCE_LIMIT');
  for(const name of names){if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.lock$/.test(name))throw new PublicError('MUTATION_UNCERTAIN');const opened=await openScoped(root,`write-owners/${name}`,true);try{if(!opened.stat.isFile()||opened.stat.nlink!==1n)throw new PublicError('MUTATION_UNCERTAIN');const code=await native(['lock'],[opened.handle.fd]);if(code!==0)throw nativeError(code);}finally{await opened.close();}}
}
