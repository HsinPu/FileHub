import process from 'node:process';
import { Buffer } from 'node:buffer';
import { read,write,fstat,fsync } from 'node:fs';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
const readFd=promisify(read),writeFd=promisify(write),statFd=promisify(fstat),syncFd=promisify(fsync),maximum=2155872256;
const witness=s=>`${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}:${s.mode}`;
const invalid=()=>{throw Object.assign(new Error(),{code:'EINVAL'});};
const safeName=(name,kind)=>{if(typeof name!=='string'||!name.isWellFormed()||name.includes('\\')||name.startsWith('/')||/^[A-Za-z]:/.test(name)||[...name].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127))invalid();const path=kind==='directory'?name.slice(0,-1):name;if(kind==='directory'&&!name.endsWith('/')||!path||path.split('/').some(part=>!part||part==='.'||part==='..'||part.toLowerCase()==='.filehub')||Buffer.byteLength(name)>4096)invalid();return Buffer.from(name);};
const dos=ms=>{const date=new Date(Math.max(Date.UTC(1980,0,1),Math.min(Date.UTC(2107,11,31,23,59,58),Number.isFinite(ms)?ms:0)));return{time:(date.getUTCHours()<<11)|(date.getUTCMinutes()<<5)|(date.getUTCSeconds()>>1),date:((date.getUTCFullYear()-1980)<<9)|((date.getUTCMonth()+1)<<5)|date.getUTCDate()};};
let cancelled=false;process.on('message',message=>{if(message?.cancel===true)cancelled=true;});process.once('disconnect',()=>{cancelled=true;});
let position=0,bytes=0,code=0,checksum,sha256,observed,owned=false;
const append=async buffer=>{if(position+buffer.length>maximum)throw Object.assign(new Error(),{code:'EFBIG'});let offset=0;while(offset<buffer.length){if(cancelled)throw Object.assign(new Error(),{code:'ECANCELED'});const result=await writeFd(5,buffer,offset,buffer.length-offset,position);if(!result.bytesWritten)throw new Error();offset+=result.bytesWritten;position+=result.bytesWritten;}};
try{
  if(!(await statFd(3)).isFile())invalid();const [command,encoded]=process.argv.slice(2);let input;
  if(command==='entry'){if(!encoded||encoded.length>16384)invalid();input=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));}
  else if(command==='finish'){const parts=[];let length=0;for await(const chunk of process.stdin){length+=chunk.length;if(length>4194304)invalid();parts.push(chunk);}input=JSON.parse(Buffer.concat(parts).toString('utf8'));}else invalid();
  const stat=await statFd(5,{bigint:true});if(!stat.isFile()||stat.nlink!==1n||witness(stat)!==input.witness||!Number.isSafeInteger(input.offset)||input.offset!==Number(stat.size)||input.offset>maximum)invalid();position=input.offset;owned=true;
  if(command==='entry'){
    const name=safeName(input.name,input.kind),stamp=dos(input.mtimeMs),file=input.kind==='file';if(!file&&input.kind!=='directory'||!Number.isSafeInteger(input.bytes)||input.bytes<0||input.bytes>1073741824)invalid();
    const source=await statFd(4,{bigint:true});if(witness(source)!==input.sourceWitness||source.isFile()!==file||file&&Number(source.size)!==input.bytes)throw Object.assign(new Error(),{code:'ESTALE'});
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800|(file?8:0),6);header.writeUInt16LE(stamp.time,10);header.writeUInt16LE(stamp.date,12);header.writeUInt16LE(name.length,26);await append(header);await append(name);
    checksum=0;const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let last=Date.now();
    while(file&&bytes<input.bytes){if(cancelled)throw Object.assign(new Error(),{code:'ECANCELED'});const {bytesRead}=await readFd(4,buffer,0,Math.min(buffer.length,input.bytes-bytes),bytes);if(!bytesRead)throw Object.assign(new Error(),{code:'ESTALE'});const part=buffer.subarray(0,bytesRead);checksum=crc32(part,checksum);hash.update(part);await append(part);bytes+=bytesRead;if(Date.now()-last>=250){process.send?.({progress:bytes});last=Date.now();}}
    if(witness(await statFd(4,{bigint:true}))!==input.sourceWitness||file&&hash.digest('hex')!==input.sha256)throw Object.assign(new Error(),{code:'ESTALE'});
    if(file){const descriptor=Buffer.alloc(16);descriptor.writeUInt32LE(0x08074b50);descriptor.writeUInt32LE(checksum,4);descriptor.writeUInt32LE(bytes,8);descriptor.writeUInt32LE(bytes,12);await append(descriptor);}await syncFd(5);
  }else{
    if(!Array.isArray(input.entries)||input.entries.length<1||input.entries.length>1000)invalid();const start=position;
    for(const entry of input.entries){const name=safeName(entry.name,entry.kind),stamp=dos(entry.mtimeMs),file=entry.kind==='file';if(!Number.isSafeInteger(entry.offset)||entry.offset<0||entry.offset>=start||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>1073741824||!Number.isInteger(entry.crc32)||entry.crc32<0||entry.crc32>0xffffffff)invalid();
      const header=Buffer.alloc(46);header.writeUInt32LE(0x02014b50);header.writeUInt16LE((3<<8)|20,4);header.writeUInt16LE(20,6);header.writeUInt16LE(0x800|(file?8:0),8);header.writeUInt16LE(stamp.time,12);header.writeUInt16LE(stamp.date,14);header.writeUInt32LE(entry.crc32,16);header.writeUInt32LE(entry.bytes,20);header.writeUInt32LE(entry.bytes,24);header.writeUInt16LE(name.length,28);header.writeUInt32LE(file?(0o100644<<16)>>>0:((0o40755<<16)|0x10)>>>0,38);header.writeUInt32LE(entry.offset,42);await append(header);await append(name);
    }
    const centralSize=position-start,end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(input.entries.length,8);end.writeUInt16LE(input.entries.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(start,16);await append(end);await syncFd(5);
    const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let offset=0;while(offset<position){if(cancelled)throw Object.assign(new Error(),{code:'ECANCELED'});const {bytesRead}=await readFd(5,buffer,0,Math.min(buffer.length,position-offset),offset);if(!bytesRead)throw new Error();hash.update(buffer.subarray(0,bytesRead));offset+=bytesRead;}sha256=hash.digest('hex');
  }
  const after=await statFd(5,{bigint:true});if(!after.isFile()||after.nlink!==1n||Number(after.size)!==position)throw new Error();observed=witness(after);
}catch(error){code=({EINVAL:18,ESTALE:17,ECANCELED:19,ENOSPC:15,EDQUOT:15,EFBIG:20})[error?.code]??70;if(owned){try{observed=witness(await statFd(5,{bigint:true}));}catch{code=70;}}}
process.stdout.write(JSON.stringify({code,owned,bytes,size:position,...(observed?{witness:observed}:{}),...(checksum!==undefined?{crc32:checksum}:{}),...(sha256?{sha256}:{})}));process.disconnect?.();
