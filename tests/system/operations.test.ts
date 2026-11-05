import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { OperationCatalog, operationResources } from '../../apps/server/src/modules/operations/catalog.js';
import type { OperationCreate } from '../../packages/contracts/src/operations.js';
import { systemFixture } from './fixtures.js';
import { ManagedNode } from '../helpers/node-process.js';
import { createOwner } from '../../apps/server/src/storage/native.js';

test('真正雙程序競爭同一 operation，只有一個 claim；退出後需 guard proof 才能重試', async () => {
  const f=await systemFixture();f.migrate();const db=f.open(),user=randomUUID(),entry=randomUUID();
  db.sqlite.prepare("INSERT INTO users VALUES (?,'fixture','synthetic-hash','admin',1,1)").run(user);
  db.sqlite.prepare("INSERT INTO entries(id,label,kind,root_path,root_device,root_inode,root_ancestors,enabled) VALUES (?,'fixture','managed','synthetic-root','1','1','[]',1)").run(entry);
  const input:OperationCreate={id:randomUUID(),kind:'archive',sources:[{entryId:entry,path:'source',version:'a'.repeat(64)}],conflict:'stop'},catalog=new OperationCatalog(db);
  catalog.enqueue(user,input,operationResources(input));
  const script=fileURLToPath(new URL('./fixtures/operation-owner.mjs',import.meta.url)),env={P5_OPERATION:input.id};
  const [a,b]=await Promise.all([f.startNode([script],env,true),f.startNode([script],env,true)]);
  const [first,second]=await Promise.all([a.waitForMessage(m=>m.type==='started'),b.waitForMessage(m=>m.type==='started')]);
  expect([first.claim,second.claim].filter(Boolean)).toHaveLength(1);expect(catalog.record(input.id).attempt).toBe(1);
  const winner=first.claim?a:b,loser=first.claim?b:a;
  db.sqlite.prepare('UPDATE operations SET lease_until=0 WHERE id=?').run(input.id);
  expect(await catalog.recoverExpired()).toEqual([{id:input.id,state:'owner_unproven'}]);
  await winner.forceStop();
  if(process.platform==='linux'){
    expect(await catalog.recoverExpired()).toEqual([{id:input.id,state:'interrupted'}]);expect(catalog.retry(user,input.id).state).toBe('queued');
  }else{expect(await catalog.recoverExpired()).toEqual([{id:input.id,state:'owner_unproven'}]);expect(catalog.record(input.id).state).toBe('running');}
  await loser.request('stop');expect(await loser.waitForExit()).toEqual({code:0,signal:null});expect(a.output()).toEqual({stdout:'',stderr:''});expect(b.output()).toEqual({stdout:'',stderr:''});
});

test('operation owner 已退出但 helper 繼承 OFD 時，不 fencing／不重送工作', async () => {
  if(process.platform!=='linux')return;
  const f=await systemFixture();f.migrate();const db=f.open(),user=randomUUID(),entry=randomUUID();
  db.sqlite.prepare("INSERT INTO users VALUES (?,'fixture','synthetic-hash','admin',1,1)").run(user);
  db.sqlite.prepare("INSERT INTO entries(id,label,kind,root_path,root_device,root_inode,root_ancestors,enabled) VALUES (?,'fixture','managed','synthetic-root','1','1','[]',1)").run(entry);
  const input:OperationCreate={id:randomUUID(),kind:'archive',sources:[{entryId:entry,path:'source',version:'a'.repeat(64)}],conflict:'stop'},catalog=new OperationCatalog(db),owner=randomUUID(),guard=await createOwner(db.sqlite.name,owner);
  const script=fileURLToPath(new URL('./fixtures/inherited-fd.mjs',import.meta.url)),parent=new ManagedNode([script],f.directory,{},true,[guard.fd]),helper=new ManagedNode([script],f.directory,{},true,[guard.fd]);
  try{
    await parent.waitForMessage(m=>m.type==='started');await helper.waitForMessage(m=>m.type==='started');catalog.enqueue(user,input,operationResources(input));catalog.claim(input.id,owner);
    db.sqlite.prepare('UPDATE operations SET lease_until=0 WHERE id=?').run(input.id);await guard.close();await parent.forceStop();
    expect(await catalog.recoverExpired()).toEqual([{id:input.id,state:'owner_unproven'}]);expect(catalog.get(user,input.id).canRetry).toBe(false);
    await helper.request('stop');expect(await helper.waitForExit()).toEqual({code:0,signal:null});expect(await catalog.recoverExpired()).toEqual([{id:input.id,state:'interrupted'}]);
    expect(parent.output()).toEqual({stdout:'',stderr:''});expect(helper.output()).toEqual({stdout:'',stderr:''});
  }finally{await parent.forceStop();await helper.forceStop();await guard.close();}
});
