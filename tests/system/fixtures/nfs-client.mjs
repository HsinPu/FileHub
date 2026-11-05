import process from 'node:process';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { readFile,readdir,readlink,statfs,lstat } from 'node:fs/promises';
import { createHash,randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { fileURLToPath,URL } from 'node:url';
import { migrateDatabase,openDatabase,parseDatabaseConfig } from '../../../apps/server/dist/index.js';
import { main as apiMain } from '../../../apps/server/dist/server.js';
import { EntryService } from '../../../apps/server/dist/modules/entries/service.js';
import { FileService } from '../../../apps/server/dist/modules/files/service.js';
import { IdentityService } from '../../../apps/server/dist/modules/identity/service.js';
import { OperationCatalog } from '../../../apps/server/dist/modules/operations/catalog.js';
import { ArtifactStore,artifactName } from '../../../apps/server/dist/modules/operations/artifacts.js';
import { ownerPath,proveOwner } from '../../../apps/server/dist/storage/native.js';
import { WriteCoordinator } from '../../../apps/server/dist/storage/coordinator.js';
const token=process.env.FILEHUB_NFS_TEST_TOKEN;
assert.match(token??'',/^[a-f0-9-]{36}$/);
const emit=(event,details={})=>process.stdout.write(JSON.stringify({token,event,...details})+'\n');
const lines=createInterface({input:process.stdin});const answers=[];
lines.on('line',line=>{assert.ok(line.length<256);const value=JSON.parse(line);assert.equal(value.token,token);answers.push(value.event);});
async function poll(read,ms=8000){const end=performance.now()+ms;while(performance.now()<end){const value=await read();if(value)return value;await delay(50);}throw new Error('NFS fixture checkpoint timed out');}
async function ask(event,scenario){emit(event,{scenario});await poll(()=>{const index=answers.indexOf(event==='pause'?'paused':'recovered');if(index<0)return false;answers.splice(index,1);return true;});}
process.setgroups([]);process.setgid(1000);process.setuid(1000);assert.equal(process.getuid(),1000);assert.match(await readFile('/proc/self/status','utf8'),/^CapEff:\s+0+$/m);const version=JSON.parse(await readFile(new URL('../../../package.json',import.meta.url),'utf8')).version;assert.equal(version,process.env.FILEHUB_NFS_TEST_VERSION);
process.env.FILEHUB_STATE_DIR='/fixture/state';process.env.FILEHUB_PORT='0';process.env.FILEHUB_HOST='127.0.0.1';process.env.FILEHUB_LOG_LEVEL='silent';process.env.FILEHUB_WORKER_POLL_INTERVAL_MS='50';process.env.FILEHUB_UPLOAD_MAINTENANCE_INTERVAL_MS='1000';
const config=parseDatabaseConfig();migrateDatabase(config);const db=openDatabase(config),entries=new EntryService(db),files=new FileService(entries),catalog=new OperationCatalog(db),store=new ArtifactStore(db,entries,files);
let api,worker,owner;const children=[];let workerOutput='';
async function stopWorker(){if(!worker)return;const child=worker;worker=undefined;if(child.exitCode===null&&child.signalCode===null){child.send({action:'stop',id:3});await poll(()=>child.exitCode!==null||child.signalCode!==null);assert.equal(child.exitCode,0);assert.equal(child.signalCode,null);}assert.equal(workerOutput,'');}
try{
  assert.equal(Number((await statfs('/mnt/nfs')).type),0x6969);const stateFs=Number((await statfs('/fixture')).type);assert.notEqual(stateFs,0x6969);
  const mounts=(await readFile('/proc/mounts','utf8')).split('\n').find(line=>line.split(' ')[1]==='/mnt/nfs');assert.ok(mounts?.includes(' nfs '));assert.match(mounts,/vers=3/);assert.match(mounts,/(?:,| )hard(?:,| )/);
  const user=await new IdentityService(db).bootstrap('admin','Synthetic-NFS-fixture-password-2026!'),entry=await entries.register('external','NFS 測試來源','/mnt/nfs');
  api=await apiMain();const login=await globalThis.fetch(`${api.address}/api/session`,{method:'POST',headers:{origin:api.address,'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'Synthetic-NFS-fixture-password-2026!'})});assert.equal(login.status,200);const session=await login.json(),cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
  const send=async(path,body)=>{const response=await globalThis.fetch(`${api.address}${path}`,{method:body===undefined?'GET':'POST',headers:{cookie,origin:api.address,'x-csrf-token':session.csrfToken,...(body===null?{}:{'content-type':'application/json'})},...(body===undefined||body===null?{}:{body:JSON.stringify(body)}),signal:globalThis.AbortSignal.timeout(8000)});return{status:response.status,body:await response.json()};};
  const sourceHash=createHash('sha256').update(await readFile('/mnt/nfs/source.bin')).digest('hex');emit('mounted',{nfsVersion:3,uid:process.getuid(),stateFs,mountOptions:mounts.split(' ')[3]});
  for(const scenario of ['cancel-blocked','kill-parent']){
    const id=randomUUID(),version=(await files.metadata(user.id,entry.id,'source.bin')).resource.version;
    assert.equal((await send('/api/operations',{id,kind:'archive',sources:[{entryId:entry.id,path:'source.bin',version}],conflict:'stop'})).status,200);
    let checkpoint=false;owner=fork(fileURLToPath(new URL('./archive-owner.mjs',import.meta.url)),[],{env:{...process.env,P5_PHASE:'entry'},stdio:['ignore','pipe','pipe','ipc']});children.push(owner);let output='';const capture=chunk=>{if(output.length+chunk.length>65536){output='fixture output overflow';owner.kill('SIGKILL');}else output+=chunk;};owner.stdout.on('data',capture);owner.stderr.on('data',capture);owner.on('message',message=>{if(message.type==='checkpoint'&&message.id===id)checkpoint=true;});
    await poll(()=>checkpoint);const owned=catalog.record(id),attempt=owned.attempt;assert.equal(owned.state,'running');await ask('pause',scenario);await delay(50);owner.send({action:'status',id:1});
    const helper=await poll(async()=>{const ids=(await readFile(`/proc/${owner.pid}/task/${owner.pid}/children`,'utf8')).trim().split(/\s+/).filter(Boolean);for(const pid of ids){const command=await readFile(`/proc/${pid}/cmdline`,'utf8').catch(()=>'');if(command.includes('/native/archive-io.mjs'))return Number(pid);}return false;});
    assert.equal(await readlink(`/proc/${helper}/fd/3`),ownerPath(db.sqlite.name,owned.owner));assert.equal(await readlink(`/proc/${helper}/fd/4`),'/mnt/nfs/source.bin');
    const blocked=await poll(async()=>{const tasks=await readdir(`/proc/${helper}/task`);for(const tid of tasks){const value=await readFile(`/proc/${helper}/task/${tid}/wchan`,'utf8').catch(()=>'');if(/rpc|nfs|wait_on_bit/.test(value))return value.trim();}return false;});
    assert.equal((await send(`/api/operations/${id}/cancel`,null)).body.state,'cancelling');await delay(1100);
    const healthStart=Date.now();assert.equal((await globalThis.fetch(`${api.address}/health/ready`,{signal:globalThis.AbortSignal.timeout(5000)})).status,200);const healthMs=Date.now()-healthStart;
    assert.equal((await send(`/api/operations/${id}`)).body.state,'cancelling');assert.ok(catalog.record(id).leaseUntil>Date.now());
    assert.equal((await store.maintain()).find(row=>row.id===id)?.outcome,'busy');assert.equal(catalog.record(id).attempt,attempt);
    assert.throws(()=>new WriteCoordinator(db).begin(user.id,'rename',[{entryId:entry.id,path:'source.bin'}],{}),error=>error.code==='MUTATION_BUSY');
    if(scenario==='kill-parent'){
      const exited=new Promise(resolve=>owner.once('exit',(code,signal)=>resolve({code,signal})));owner.kill('SIGKILL');assert.deepEqual(await exited,{code:null,signal:'SIGKILL'});const stoppedLease=catalog.record(id).leaseUntil;assert.equal(typeof stoppedLease,'number');await poll(()=>{assert.equal(catalog.record(id).leaseUntil,stoppedLease);return stoppedLease<Date.now();});assert.ok(catalog.record(id).leaseUntil<Date.now());
      await assert.rejects(proveOwner(db.sqlite.name,owned.owner),error=>error.code==='MUTATION_BUSY');assert.equal((await catalog.recoverExpired()).find(row=>row.id===id)?.state,'owner_unproven');let ready=false;workerOutput='';worker=fork(fileURLToPath(new URL('./service.mjs',import.meta.url)),['worker'],{env:process.env,stdio:['ignore','pipe','pipe','ipc']});const restarted=worker;children.push(restarted);const captureWorker=chunk=>{workerOutput+=chunk;if(workerOutput.length>4096)restarted.kill('SIGKILL');};restarted.stdout.on('data',captureWorker);restarted.stderr.on('data',captureWorker);restarted.on('message',message=>{if(message.type==='started'&&message.pid===restarted.pid)ready=true;});await poll(()=>ready);assert.notEqual(worker.pid,owner.pid);assert.notEqual(worker.pid,process.pid);await delay(350);assert.equal((await send(`/api/operations/${id}`)).body.state,'cancelling');assert.equal(catalog.record(id).attempt,attempt);assert.equal(catalog.record(id).owner,owned.owner);
    }
    emit('blocked',{scenario,state:catalog.record(id).state,attempt,helperGuard:true,waitChannel:blocked,healthMs,ownerStopped:scenario==='kill-parent',leaseExpired:catalog.record(id).leaseUntil<Date.now(),reservationHeld:true,restartedWorkerProcess:scenario==='kill-parent',leaseStableAfterExit:scenario==='kill-parent'});await ask('recover',scenario);
    await poll(async()=>{try{const proof=await proveOwner(db.sqlite.name,owned.owner);await proof.close();return true;}catch{return false;}},12000);
    if(scenario==='cancel-blocked')await poll(()=>['cancelled','needs_review'].includes(catalog.record(id).state));const beforeCleanup=catalog.record(id).state,maintenance=await store.maintain();await poll(()=>catalog.record(id).state==='cancelled');emit('maintenance',{scenario,beforeCleanup,items:maintenance});
    const result=catalog.get(user.id,id);assert.equal(result.state,'cancelled');assert.equal(result.canRetry,false);assert.equal(result.artifact,undefined);assert.equal(store.row(id).cleaned,true);await assert.rejects(lstat(`/fixture/state/${artifactName(id)}`),error=>error.code==='ENOENT');assert.equal(createHash('sha256').update(await readFile('/mnt/nfs/source.bin')).digest('hex'),sourceHash);assert.equal((await send(`/api/operations/${id}/artifact`)).status,404);assert.equal(output,'');
    if(scenario==='cancel-blocked'){owner.send({action:'stop',id:2});await poll(()=>owner.exitCode===0);}
    emit('verified',{scenario,state:result.state,attempt:result.attempt,cleaned:true,sourceHash,artifactAvailable:false});await stopWorker();owner=undefined;
  }
  const full=fork(fileURLToPath(new URL('./transfer-enospc.mjs',import.meta.url)),[],{env:process.env,stdio:['ignore','pipe','pipe','ipc']});children.push(full);let fullOut='',fullError='';full.stdout.on('data',chunk=>{fullOut+=chunk;if(fullOut.length>4096)full.kill('SIGKILL');});full.stderr.on('data',chunk=>{fullError+=chunk;if(fullError.length>4096)full.kill('SIGKILL');});await poll(()=>full.exitCode!==null||full.signalCode!==null,30000);assert.equal(full.exitCode,0);assert.equal(fullError,'');const fullResult=JSON.parse(fullOut);assert.equal(fullResult.error,'STORAGE_FULL');emit('storage-full',fullResult);
  emit('complete',{scenarios:2,enospc:true,sqlite:db.diagnostics().sqliteVersion});
}catch(error){emit('failure',{message:error instanceof Error?error.message:'NFS fixture failure'});process.exitCode=1;}
finally{for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await api?.app.close();db.close();lines.close();}
