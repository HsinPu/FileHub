import { parseDatabaseConfig,type Environment } from './config/index.js';
import { createSnapshot,restoreSnapshot,verifySnapshot } from './maintenance/snapshot.js';
import { PublicError } from './plugins/errors.js';
export async function main(argv:readonly string[]=process.argv.slice(2),environment:Environment=process.env){
  const [action,target,argument,...flags]=argv;if(!target)throw new PublicError('BAD_REQUEST');
  if(action==='verify'&&argument===undefined){const verified=await verifySnapshot(target);return{format:verified.manifest.format,schemaRevision:verified.manifest.schemaRevision,items:verified.manifest.items.length,bytes:verified.manifest.bytes,manifestSha256:verified.manifestSha256};}
  if(action==='backup'&&argument&&flags.length===1&&flags[0]==='--quiesced')return createSnapshot(parseDatabaseConfig(environment),target,argument,{quiesced:true});
  if(action==='restore'&&argument&&flags.includes('--quiesced')&&flags.length===(flags.includes('--preserve-schema')?2:1)&&new Set(flags).size===flags.length&&flags.every(flag=>['--quiesced','--preserve-schema'].includes(flag)))return restoreSnapshot(target,argument,{quiesced:true,preserveSchema:flags.includes('--preserve-schema')});
  throw new PublicError('BAD_REQUEST');
}
if(import.meta.main){void main().then(result=>console.info(JSON.stringify(result))).catch(()=>{console.error('FileHub 完整維護失敗；請確認停機與外部停寫、來源完整性、支援的 schema 及全新目標。未完成目錄不得作為工作資料。');process.exitCode=1;});}
