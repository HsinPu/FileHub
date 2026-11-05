import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ARCHIVE_LIMITS } from '@filehub/contracts';
import { PublicError } from '../../plugins/errors.js';
import type { OperationContext } from './executor.js';
export interface ZipEntry {name:string;kind:'file'|'directory';offset:number;bytes:number;crc32:number;mtimeMs:number}
export interface ArchiveResult {code:number;owned:boolean;bytes:number;size:number;witness?:string;crc32?:number;sha256?:string}
export async function archiveIo(ctx:OperationContext,command:'entry'|'finish',input:unknown,source:number,output:number,progress?:(bytes:number)=>void):Promise<ArchiveResult>{
  ctx.check();const payload=JSON.stringify(input);if(Buffer.byteLength(payload)>ARCHIVE_LIMITS.centralBytes)throw new PublicError('RESOURCE_LIMIT');
  const child=spawn(process.execPath,['--max-old-space-size=64','--disable-proto=throw',fileURLToPath(new URL('../../../native/archive-io.mjs',import.meta.url)),command,...(command==='entry'?[Buffer.from(payload).toString('base64')]:[])],{stdio:['pipe','pipe','ignore',ctx.guard.fd,source,output,'ipc'],windowsHide:true,env:{LANG:'C.UTF-8'}});
  let text='',invalid=false;const cancel=()=>{if(child.connected)child.send({cancel:true},()=>{});};
  child.on('message',(message:unknown)=>{if(message&&typeof message==='object'&&'progress'in message&&typeof message.progress==='number'){try{ctx.check();progress?.(message.progress);}catch{cancel();}}});
  const stdout=child.stdout,stdin=child.stdin;if(!stdout||!stdin)throw new PublicError('WRITE_UNSUPPORTED');stdin.on('error',()=>{});stdout.on('data',(chunk:Buffer)=>{if(text.length+chunk.length>2048)invalid=true;else text+=chunk.toString('utf8');});
  ctx.signal.addEventListener('abort',cancel,{once:true});if(ctx.signal.aborted)cancel();stdin.end(command==='finish'?payload:undefined);
  try{
    const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',()=>reject(new PublicError('WRITE_UNSUPPORTED')));child.once('close',resolve);});if(code!==0||invalid)throw new PublicError('MUTATION_UNCERTAIN');const value:unknown=JSON.parse(text);
    if(!value||typeof value!=='object'||!('code'in value)||!Number.isInteger(value.code)||!('owned'in value)||typeof value.owned!=='boolean'||!('bytes'in value)||typeof value.bytes!=='number'||!Number.isSafeInteger(value.bytes)||value.bytes<0||value.bytes>1073741824||!('size'in value)||typeof value.size!=='number'||!Number.isSafeInteger(value.size)||value.size<0||value.size>ARCHIVE_LIMITS.bytes)throw new PublicError('MUTATION_UNCERTAIN');
    if('witness'in value&&(typeof value.witness!=='string'||!/^\d+:\d+:\d+:\d+:\d+:\d+$/.test(value.witness)))throw new PublicError('MUTATION_UNCERTAIN');if('sha256'in value&&(typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256)))throw new PublicError('MUTATION_UNCERTAIN');if('crc32'in value&&(typeof value.crc32!=='number'||!Number.isInteger(value.crc32)||value.crc32<0||value.crc32>0xffffffff))throw new PublicError('MUTATION_UNCERTAIN');return value as ArchiveResult;
  }finally{ctx.signal.removeEventListener('abort',cancel);}
}
