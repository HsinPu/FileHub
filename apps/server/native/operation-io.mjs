import process from 'node:process';
import { Buffer } from 'node:buffer';
import { constants, read, fstat, fsync } from 'node:fs';
import { open, mkdir, lstat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const readFd=promisify(read),statFd=promisify(fstat),syncFd=promisify(fsync);
const witness=s=>`${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}:${s.mode}`;
let cancelled=false,created=false,handle,bytes=0,sha256;
process.on('message',message=>{if(message?.cancel===true)cancelled=true;});
const [command,encoded,expected]=process.argv.slice(2),name=Buffer.from(encoded??'','hex').toString('utf8');
let code=0,observed;
try{
  if(!['mkdir','copy','create'].includes(command)||!name||name.includes('/')||name==='.'||name==='..'||Buffer.byteLength(name)>255||Buffer.from(name).toString('hex')!==encoded)throw Object.assign(new Error(),{code:'EINVAL'});
  if(!(await statFd(3)).isFile()||!(await statFd(5)).isDirectory())throw Object.assign(new Error(),{code:'EINVAL'});
  const path=`/proc/self/fd/5/${name}`;
  if(command==='mkdir'){
    if(cancelled)throw Object.assign(new Error(),{code:'ECANCELED'});
    await mkdir(path,{mode:0o750});created=true;handle=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);await handle.sync();
  }else if(command==='create'){
    if(cancelled)throw Object.assign(new Error(),{code:'ECANCELED'});
    handle=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_RDWR|constants.O_NOFOLLOW,0o600);created=true;await handle.sync();
  }else{
    const before=await statFd(4,{bigint:true});if(!before.isFile()||witness(before)!==expected||before.size>1073741824n)throw Object.assign(new Error(),{code:'ESTALE'});
    if(cancelled)throw Object.assign(new Error(),{code:'ECANCELED'});
    handle=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_RDWR|constants.O_NOFOLLOW,0o640);created=true;
    const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let last=Date.now();
    while(bytes<Number(before.size)){
      if(cancelled)throw Object.assign(new Error(),{code:'ECANCELED'});
      const {bytesRead}=await readFd(4,buffer,0,Math.min(buffer.length,Number(before.size)-bytes),bytes);if(!bytesRead)throw Object.assign(new Error(),{code:'ESTALE'});
      hash.update(buffer.subarray(0,bytesRead));let written=0;while(written<bytesRead){const result=await handle.write(buffer,written,bytesRead-written,bytes+written);if(!result.bytesWritten)throw new Error();written+=result.bytesWritten;}bytes+=bytesRead;
      if(Date.now()-last>=250){process.send?.({progress:bytes});last=Date.now();}
    }
    if(witness(await statFd(4,{bigint:true}))!==expected)throw Object.assign(new Error(),{code:'ESTALE'});
    sha256=hash.digest('hex');await handle.sync();const verify=createHash('sha256');let offset=0;
    while(offset<bytes){if(cancelled)throw Object.assign(new Error(),{code:'ECANCELED'});const result=await handle.read(buffer,0,Math.min(buffer.length,bytes-offset),offset);if(!result.bytesRead)throw new Error();verify.update(buffer.subarray(0,result.bytesRead));offset+=result.bytesRead;}
    if(verify.digest('hex')!==sha256)throw new Error();
  }
  await syncFd(5);const stat=await handle.stat({bigint:true}),named=await lstat(path,{bigint:true});
  if(stat.dev!==named.dev||stat.ino!==named.ino||stat.isFile()&&stat.nlink!==1n)throw new Error();observed=witness(stat);
}catch(error){code=({EEXIST:10,ENOENT:11,EACCES:12,EPERM:12,EROFS:12,ESTALE:17,EINVAL:18,ECANCELED:19,ENOSPC:15,EDQUOT:15})[error?.code]??70;if(created&&handle){try{observed=witness(await handle.stat({bigint:true}));}catch{code=70;}}}
finally{await handle?.close();}
process.stdout.write(JSON.stringify({code,created,bytes,...(observed?{witness:observed}:{}),...(sha256?{sha256}:{})}));
process.disconnect?.();
