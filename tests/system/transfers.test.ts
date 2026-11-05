import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,readFile,lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect,onTestFinished,test } from 'vitest';
import { EntryService } from '../../apps/server/src/modules/entries/service.js';
import { FileService } from '../../apps/server/src/modules/files/service.js';
import { OperationCatalog } from '../../apps/server/src/modules/operations/catalog.js';
import { OperationService } from '../../apps/server/src/modules/operations/service.js';
import { recoverOperations } from '../../apps/server/src/modules/operations/recovery.js';
import { createTemporaryDirectory } from '../helpers/temporary-directory.js';
import { systemFixture } from './fixtures.js';
for(const phase of ['publishing','published','retiring'])test(`真正 worker 在 ${phase} 被終止，恢復只觀察副作用，不重播`,async()=>{
  const f=await systemFixture();f.migrate();const db=f.open();if(process.platform!=='linux'){await expect(recoverOperations(db)).rejects.toMatchObject({code:'WRITE_UNSUPPORTED'});return;}
  const user=randomUUID();db.sqlite.prepare("INSERT INTO users VALUES (?,'fixture','synthetic-hash','admin',1,1)").run(user);const entries=new EntryService(db),files=new FileService(entries),catalog=new OperationCatalog(db),root=join(f.directory,'source');await mkdir(root);await writeFile(join(root,'file'),'system-transfer-fixture');
  const source=await entries.register('managed','來源',root);await entries.setWritable(source.id,true);let destination=join(f.directory,'destination');
  if(phase==='retiring'){const temp=await createTemporaryDirectory('filehub-p52-system-','/dev/shm');destination=temp.directory;onTestFinished(()=>temp.dispose());onTestFinished(()=>f.dispose());}else await mkdir(destination);
  const target=await entries.register('external','目的地',destination);await entries.setWritable(target.id,true);
  const input={id:randomUUID(),kind:phase==='retiring'?'move' as const:'copy' as const,sources:[{entryId:source.id,path:'file',version:(await files.metadata(user,source.id,'file')).resource.version}],destination:{entryId:target.id,path:'',version:(await files.metadata(user,target.id,'')).resource.version},conflict:'stop' as const};
  await new OperationService(catalog,entries,files,new Set(['copy','move'])).create(user,input);
  const child=await f.startNode([fileURLToPath(new URL('./fixtures/transfer-owner.mjs',import.meta.url))],{P5_PHASE:phase},true);await child.waitForMessage(message=>message.type==='checkpoint');
  db.sqlite.prepare('UPDATE operations SET lease_until=0 WHERE id=?').run(input.id);expect((await recoverOperations(db)).items).toEqual([]);expect(catalog.record(input.id).state).toBe('running');
  await child.forceStop();const first=await recoverOperations(db);expect(first.items).toEqual([{id:input.id,outcome:phase==='published'?'succeeded':'needs_review'}]);expect(catalog.record(input.id).state).toBe(phase==='published'?'succeeded':'needs_review');
  expect(await readFile(join(root,'file'),'utf8')).toBe('system-transfer-fixture');if(phase==='publishing')await expect(lstat(join(destination,'file'))).rejects.toMatchObject({code:'ENOENT'});else expect(await readFile(join(destination,'file'),'utf8')).toBe('system-transfer-fixture');
  expect(catalog.get(user,input.id).canRetry).toBe(false);const before=db.sqlite.prepare('SELECT * FROM operation_nodes').all();await recoverOperations(db);expect(db.sqlite.prepare('SELECT * FROM operation_nodes').all()).toEqual(before);expect(child.output()).toEqual({stdout:'',stderr:''});
});
