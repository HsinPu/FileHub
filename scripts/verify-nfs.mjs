import process from 'node:process';
import console from 'node:console';
import { execFile,spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath,URL } from 'node:url';
import { setTimeout,clearTimeout } from 'node:timers';

const root=fileURLToPath(new URL('../',import.meta.url));
const metadata=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(metadata.version))throw new Error('無效 NFS fixture 版本');
const execute=promisify(execFile),image=`filehub-nfs-fixture:${metadata.version}`,ciImage=`filehub-ci:${metadata.version}`;
const upstream='ec1660ba33c80d5c67131e163e68834c1a10e243';
const docker=async(args,timeout=10000)=>(await execute('docker',args,{cwd:root,windowsHide:true,timeout,maxBuffer:262144})).stdout.trim();
const inspect=async(kind,name)=>JSON.parse(await docker([...kind,'inspect',name]))[0];
async function build(args){
  await new Promise((resolve,reject)=>{
    const child=spawn('docker',['build',...args],{cwd:root,windowsHide:true,stdio:'inherit'});
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('NFS fixture 建置超時'));},15*60000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error('NFS fixture 建置失敗'));});
  });
}
if(process.argv.includes('--build-only')){
  await build(['-f','docker/ci.Dockerfile','-t',ciImage,'.']);const ci=await inspect(['image'],ciImage);
  await build(['-f','docker/nfs-fixture.Dockerfile','--build-arg',`FILEHUB_CI_IMAGE=${ciImage}`,'--build-arg',`FILEHUB_CI_ID=${ci.Id}`,'--build-arg',`FILEHUB_VERSION=${metadata.version}`,'-t',image,'.']);
}else{
  if(process.argv.length!==2)throw new Error('NFS 驗證不接受自訂資源或路徑');
  const fixtureImage=await inspect(['image'],image),ci=await inspect(['image'],ciImage),labels=fixtureImage.Config.Labels;
  if(labels?.['org.filehub.fixture.version']!==metadata.version||labels['org.filehub.fixture.source']!==ci.Id||labels['org.filehub.fixture.unfs-commit']!==upstream)throw new Error('請先重建同版 NFS fixture image');
  const platform=await docker(['info','--format','{{.OSType}}|{{.Architecture}}|{{.KernelVersion}}']);if(!platform.startsWith('linux|'))throw new Error('NFS 驗證需要 Linux Docker daemon');
  const baseline=async()=>{const ids=(await docker(['ps','-q','--no-trunc'])).split(/\s+/).filter(Boolean),rows=[];for(const id of ids){const line=await docker(['inspect','--format','{{.Id}}|{{.Name}}|{{.State.StartedAt}}|{{index .Config.Labels "filehub.test-run"}}',id]);if(line.endsWith('|')||line.endsWith('|<no value>'))rows.push(line);}return rows.sort();};
  const before=await baseline(),token=randomUUID(),stem=`filehub-nfs-${token.slice(0,8)}`;
  const record={token,image,imageId:fixtureImage.Id,platform,network:`${stem}-net`,volume:`${stem}-data`,server:`${stem}-server`,client:`${stem}-client`};
  const directory=new URL('../.tools/',import.meta.url);await mkdir(directory,{recursive:true});const receipt=new URL(`nfs-${token}.json`,directory);
  await writeFile(receipt,JSON.stringify(record,null,2)+'\n');
  const owned=async(kind,name)=>{const row=await inspect(kind,name);if((row.Config?.Labels??row.Labels)?.['filehub.test-run']!==token)throw new Error('NFS fixture ownership 不符，保留現場');return row;};
  const events=[];let client,verified=false,cleaned=false,failure;
  try{
    await docker(['network','create','--internal','--label',`filehub.test-run=${token}`,record.network]);await docker(['volume','create','--label',`filehub.test-run=${token}`,record.volume]);
    await docker(['run','-d','--name',record.server,'--label',`filehub.test-run=${token}`,'--network',record.network,'--network-alias','exporter','--cpus','1','--memory','256m','--pids-limit','64','--mount',`type=volume,source=${record.volume},target=/export`,image,'sh','-c',`node --input-type=commonjs -e "const fs=require('fs');fs.writeFileSync('/export/source.bin',Buffer.alloc(1048576,90));fs.chmodSync('/export',493);" && exec /opt/unfs/sbin/unfsd -d -p -t -e /etc/unfs-exports`]);
    const exporter=await owned([],record.server);if(exporter.Mounts.length!==1||exporter.Mounts[0].Name!==record.volume||Object.keys(exporter.HostConfig.PortBindings??{}).length)throw new Error('NFS exporter 掛載或埠不符');
    await new Promise(resolve=>setTimeout(resolve,1000));
    const args=['run','-i','--name',record.client,'--env',`FILEHUB_NFS_TEST_TOKEN=${token}`,'--env',`FILEHUB_NFS_TEST_VERSION=${metadata.version}`,'--label',`filehub.test-run=${token}`,'--network',record.network,'--cap-add','SYS_ADMIN','--cpus','1','--memory','512m','--pids-limit','128',image,'sh','-c','mkdir -p /filehub-full-fixture && mount -t tmpfs -o size=1m,uid=1000,gid=1000 filehub-full /filehub-full-fixture && mount -t nfs -o vers=3,proto=tcp,mountproto=tcp,port=2049,mountport=2049,nolock,ro,hard,timeo=10,retrans=1,actimeo=0,retry=0 exporter:/export /mnt/nfs && exec node tests/system/fixtures/nfs-client.mjs'];
    client=spawn('docker',args,{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});let buffer='',stderr='',outputBytes=0,chain=Promise.resolve(),complete=false,fail;
    const finished=new Promise((resolve,reject)=>{fail=reject;client.once('error',reject);client.once('close',code=>chain.then(()=>code===0&&complete?resolve():reject(new Error(`NFS client exit ${code}; ${stderr}`)),reject));});
    client.stdin.on('error',fail);
    client.stderr.on('data',chunk=>{stderr+=chunk;if(stderr.length>65536)fail(new Error('NFS stderr 超過上限'));});
    client.stdout.on('data',chunk=>{
      outputBytes+=chunk.length;if(outputBytes>65536){fail(new Error('NFS stdout 超過上限'));return;}buffer+=chunk;let index;
      while((index=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,index);buffer=buffer.slice(index+1);
        chain=chain.then(async()=>{
          const value=JSON.parse(line);if(value.token!==token||events.length>=64||!['mounted','pause','blocked','recover','maintenance','verified','complete','storage-full','failure'].includes(value.event))throw new Error('NFS event 不符');events.push(value);console.info(JSON.stringify(value));
          if(value.event==='failure')throw new Error(value.message);
          if(value.event==='pause'||value.event==='recover'){
            const server=await owned([],record.server);if(!server.State.Running||server.Mounts.length!==1||server.Mounts[0].Name!==record.volume)throw new Error('NFS exporter 狀態不符');
            if(value.event==='pause'){if(server.State.Paused)throw new Error('NFS exporter 已暫停');await docker(['pause',record.server]);}
            else{if(!server.State.Paused)throw new Error('NFS exporter 未暫停');await docker(['unpause',record.server]);}
            client.stdin.write(JSON.stringify({token,event:value.event==='pause'?'paused':'recovered'})+'\n');
          }
          if(value.event==='complete'){complete=true;client.stdin.end();}
        });chain.catch(fail);
      }
    });
    const timer=setTimeout(()=>fail(new Error('NFS scenario 超過 180 秒')),180000);try{await finished;}finally{clearTimeout(timer);}
    const row=await owned([],record.client);if(row.State.Running||row.State.ExitCode!==0||row.State.OOMKilled||row.Mounts.length||Object.keys(row.HostConfig.PortBindings??{}).length)throw new Error('NFS client 最終狀態不符');
    if(JSON.stringify(await baseline())!==JSON.stringify(before))throw new Error('其他服務的身分或啟動時間已改變');verified=true;
  }catch(error){failure=error;}
  try{
    const server=await owned([],record.server).catch(()=>undefined);if(server?.State.Paused)await docker(['unpause',record.server]);
    const current=await owned([],record.client).catch(()=>undefined);if(current?.State.Running)await docker(['stop','--timeout','10',record.client],20000);
    if(server?.State.Running)await docker(['stop','--timeout','10',record.server],20000);
    if(verified){
      for(const name of [record.client,record.server]){const row=await owned([],name);if(row.State.Running||row.State.OOMKilled)throw new Error('NFS 容器未安全停止');await docker(['rm',name]);}
      for(const kind of ['volume','network']){await owned([kind],record[kind]);await docker([kind,'rm',record[kind]]);}
      if(JSON.stringify(await baseline())!==JSON.stringify(before))throw new Error('清理期間其他服務狀態改變');cleaned=true;
    }else console.error(`保留自有 NFS 現場：${record.client} / ${record.server}`);
  }catch(error){failure??=error;}
  await writeFile(receipt,JSON.stringify({...record,passed:verified&&cleaned&&!failure,verified,cleaned,unrelatedServices:before.length,events},null,2)+'\n');console.info(`NFS receipt: ${fileURLToPath(receipt)}`);
  if(failure)throw failure;
}
