import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { OperationContext } from './executor.js';
import { PublicError } from '../../plugins/errors.js';
export interface IoResult { code:number;created:boolean;bytes:number;witness?:string;sha256?:string }
export async function operationIo(ctx:OperationContext,command:'mkdir'|'copy'|'create',name:string,source:number,destination:number,expected='',progress?: (bytes:number)=>void):Promise<IoResult>{
  ctx.check();
  const child=spawn(process.execPath,['--max-old-space-size=64','--disable-proto=throw',fileURLToPath(new URL('../../../native/operation-io.mjs',import.meta.url)),command,Buffer.from(name).toString('hex'),expected],{stdio:['ignore','pipe','ignore',ctx.guard.fd,source,destination,'ipc'],windowsHide:true,env:{LANG:'C.UTF-8'}});
  let output='',invalid=false;const cancel=()=>{if(child.connected)child.send({cancel:true},()=>{});};
  child.on('message',(message:unknown)=>{if(message&&typeof message==='object'&&'progress'in message&&typeof message.progress==='number'){try{ctx.check();progress?.(message.progress);}catch{cancel();}}});
  const stdout=child.stdout;if(!stdout)throw new PublicError('WRITE_UNSUPPORTED');
  stdout.on('data',(chunk:Buffer)=>{if(output.length+chunk.length>2048)invalid=true;else output+=chunk.toString('utf8');});
  ctx.signal.addEventListener('abort',cancel,{once:true});if(ctx.signal.aborted)cancel();
  try{
    const exit=await new Promise<number|null>((resolve,reject)=>{child.once('error',()=>reject(new PublicError('WRITE_UNSUPPORTED')));child.once('close',resolve);});
    if(exit!==0||invalid)throw new PublicError('MUTATION_UNCERTAIN');const value:unknown=JSON.parse(output);
    if(!value||typeof value!=='object'||!('code'in value)||!Number.isInteger(value.code)||!('created'in value)||typeof value.created!=='boolean'||!('bytes'in value)||typeof value.bytes!=='number'||!Number.isSafeInteger(value.bytes)||value.bytes<0||value.bytes>1073741824)throw new PublicError('MUTATION_UNCERTAIN');
    if('witness'in value&&(typeof value.witness!=='string'||!/^\d+:\d+:\d+:\d+:\d+:\d+$/.test(value.witness)))throw new PublicError('MUTATION_UNCERTAIN');
    if('sha256'in value&&(typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256)))throw new PublicError('MUTATION_UNCERTAIN');
    return value as IoResult;
  }finally{ctx.signal.removeEventListener('abort',cancel);}
}
