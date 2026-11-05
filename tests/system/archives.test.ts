import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,readFile,lstat,rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect,test } from 'vitest';
import { systemFixture } from './fixtures.js';
import { EntryService } from '../../apps/server/src/modules/entries/service.js';
import { FileService } from '../../apps/server/src/modules/files/service.js';
import { OperationCatalog } from '../../apps/server/src/modules/operations/catalog.js';
import { OperationService } from '../../apps/server/src/modules/operations/service.js';
import { ArtifactStore,artifactName } from '../../apps/server/src/modules/operations/artifacts.js';
for(const changed of [false,true])test(`真正 archive worker 終止，${changed?'換 inode／內容保留未知 payload':'只清理已知未公開產物且取消完成'}，不重播 ZIP`,async()=>{
  const f=await systemFixture();f.migrate();const db=f.open(),entries=new EntryService(db),files=new FileService(entries),store=new ArtifactStore(db,entries,files),catalog=new OperationCatalog(db);if(process.platform!=='linux'){await expect(store.maintain()).rejects.toMatchObject({code:'WRITE_UNSUPPORTED'});return;}
  const user=randomUUID();db.sqlite.prepare("INSERT INTO users VALUES (?,'fixture','synthetic-hash','admin',1,1)").run(user);const root=join(f.directory,'source');await mkdir(root);await writeFile(join(root,'file'),'archive-system-fixture');const entry=await entries.register('external','來源',root),input={id:randomUUID(),kind:'archive' as const,sources:[{entryId:entry.id,path:'file',version:(await files.metadata(user,entry.id,'file')).resource.version}],conflict:'stop' as const};await new OperationService(catalog,entries,files,new Set(['archive'])).create(user,input);
  const child=await f.startNode([fileURLToPath(new URL('./fixtures/archive-owner.mjs',import.meta.url))],{P5_PHASE:'written'},true);await child.waitForMessage(message=>message.type==='checkpoint');expect(catalog.cancel(user,input.id).state).toBe('cancelling');db.sqlite.prepare('UPDATE operations SET lease_until=0 WHERE id=?').run(input.id);expect(await store.maintain()).toEqual([{id:input.id,outcome:'busy'}]);expect(catalog.record(input.id).state).toBe('cancelling');
  const path=join(f.config.stateDirectory,artifactName(input.id));await child.forceStop();if(changed){await rename(path,`${path}.original`);await writeFile(path,'external-payload');}expect(await store.maintain()).toEqual([{id:input.id,outcome:changed?'needs_review':'cancelled'}]);expect(catalog.record(input.id).state).toBe(changed?'needs_review':'cancelled');expect(store.row(input.id)?.cleaned).toBe(!changed);if(changed){expect(await readFile(path,'utf8')).toBe('external-payload');expect((await readFile(`${path}.original`)).subarray(0,4).equals(Buffer.from([0x50,0x4b,3,4]))).toBe(true);expect(store.row(input.id)?.reservedBytes).toBeGreaterThan(0);}else await expect(lstat(path)).rejects.toMatchObject({code:'ENOENT'});
  expect(await readFile(join(root,'file'),'utf8')).toBe('archive-system-fixture');expect(catalog.get(user,input.id).artifact).toBeUndefined();expect(child.output()).toEqual({stdout:'',stderr:''});
  const cli=await f.startNode([fileURLToPath(new URL('../../apps/server/dist/cli.js',import.meta.url)),'archive-maintain']);expect((await cli.waitForExit()).code).toBe(changed?2:0);expect(JSON.parse(cli.output().stdout)).toEqual({items:changed?[{id:input.id,outcome:'needs_review'}]:[]});expect(cli.output().stderr).toBe('');
});
