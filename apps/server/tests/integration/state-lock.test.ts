import { randomUUID } from 'node:crypto';
import { writeFile,unlink,symlink,lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { expect,test,onTestFinished } from 'vitest';
import { databaseFixture } from '../helpers/database.js';
import { ManagedNode } from '../../../../tests/helpers/node-process.js';
import { acquireStateLock,assertIdleOwners,STATE_LOCK_NAME,RESTORE_PENDING } from '../../src/lifecycle/state-lock.js';
import { createOwner } from '../../src/storage/native.js';

test('兩份 shared 可以共存，exclusive 需全部釋放；穩定 marker 不刪除',async()=>{
  if(process.platform!=='linux')return;const f=await databaseFixture();f.migrate();const a=await acquireStateLock(f.config.stateDirectory,'shared'),b=await acquireStateLock(f.config.stateDirectory,'shared');
  try{await expect(acquireStateLock(f.config.stateDirectory,'exclusive')).rejects.toMatchObject({code:'MUTATION_BUSY'});await a.close();await expect(acquireStateLock(f.config.stateDirectory,'exclusive')).rejects.toMatchObject({code:'MUTATION_BUSY'});}finally{await a.close();await b.close();}
  const exclusive=await acquireStateLock(f.config.stateDirectory,'exclusive');try{await expect(acquireStateLock(f.config.stateDirectory,'shared')).rejects.toMatchObject({code:'MUTATION_BUSY'});}finally{await exclusive.close();}expect((await lstat(join(f.config.stateDirectory,STATE_LOCK_NAME))).isFile()).toBe(true);
});
test('不完整還原 marker 在鎖釋放後仍阻止啟動；未知或 symlink lock 不接管',async()=>{
  const f=await databaseFixture();f.migrate();await writeFile(join(f.config.stateDirectory,RESTORE_PENDING),'incomplete',{mode:0o600});await expect(acquireStateLock(f.config.stateDirectory,'shared')).rejects.toMatchObject({code:'MUTATION_UNCERTAIN'});await unlink(join(f.config.stateDirectory,RESTORE_PENDING));if(process.platform!=='linux')return;
  await unlink(join(f.config.stateDirectory,STATE_LOCK_NAME));await writeFile(join(f.config.stateDirectory,STATE_LOCK_NAME),'foreign',{mode:0o600});await expect(acquireStateLock(f.config.stateDirectory,'exclusive')).rejects.toMatchObject({code:'MUTATION_UNCERTAIN'});await unlink(join(f.config.stateDirectory,STATE_LOCK_NAME));const canary=join(f.directory,'canary');await writeFile(canary,'preserve');await symlink(canary,join(f.config.stateDirectory,STATE_LOCK_NAME));await expect(acquireStateLock(f.config.stateDirectory,'shared')).rejects.toThrowError();
});
test('主 owner 關閉但子程序仍繼承 guard 時，完整維護不能推測 I/O 已停止',async()=>{
  if(process.platform!=='linux')return;const f=await databaseFixture();f.migrate();const owner=randomUUID(),guard=await createOwner(join(f.config.stateDirectory,'filehub.db'),owner);const child=new ManagedNode(['-e',"process.send({type:'held'});setInterval(()=>{},1000)"],f.directory,{},true,[guard.fd]);onTestFinished(()=>child.forceStop());
  try{await child.waitForMessage(message=>message.type==='held');await guard.close();await expect(assertIdleOwners(f.config.stateDirectory)).rejects.toMatchObject({code:'MUTATION_BUSY'});await child.forceStop();await expect(assertIdleOwners(f.config.stateDirectory)).resolves.toBeUndefined();}finally{await guard.close();await child.forceStop();}
});
