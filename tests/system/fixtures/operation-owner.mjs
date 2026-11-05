import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { openDatabase, parseDatabaseConfig } from '../../../apps/server/dist/index.js';
import { OperationCatalog } from '../../../apps/server/dist/modules/operations/catalog.js';
import { createOwner } from '../../../apps/server/dist/storage/native.js';
const db=openDatabase(parseDatabaseConfig()),catalog=new OperationCatalog(db),owner=randomUUID();
let guard,claim;
if(process.platform==='linux')guard=await createOwner(db.sqlite.name,owner);
try{claim=catalog.claim(process.env.P5_OPERATION,owner);}catch(error){process.send?.({type:'started',error:error.code});}
if(claim)process.send?.({type:'started',claim,guard:!!guard});else process.send?.({type:'started',claim:null,guard:!!guard});
process.on('message',message=>{
  if(message.action==='status')process.send?.({type:'reply',id:message.id,claim:claim??null});
  else if(message.action==='stop')void(async()=>{await guard?.close();db.close();process.send?.({type:'reply',id:message.id},()=>process.disconnect());})();
});
process.on('disconnect',()=>{void guard?.close().finally(()=>db.close());if(!guard)db.close();});
