import { Type,type Static } from 'typebox';
import { Check } from 'typebox/value';
import { PublicError } from '../plugins/errors.js';
import { relativePath } from '../storage/scoped.js';
export const SNAPSHOT_LIMITS=Object.freeze({items:100000,bytes:64*1024**3,manifestBytes:64*1024**2,depth:64,bufferBytes:256*1024});
export const SNAPSHOT_FORMAT='filehub-full-v1';
const digits=Type.String({pattern:'^[0-9]{1,24}$'}),time=Type.String({pattern:'^-?[0-9]{1,30}$'}),uuid=Type.String({pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'});
export const OriginSchema=Type.Object({device:digits,inode:digits,size:digits,mode:digits,mtimeNs:time,ctimeNs:time,birthtimeNs:time},{additionalProperties:false});
export const SnapshotItemSchema=Type.Object({area:Type.Union([Type.Literal('state'),Type.Literal('config'),Type.Literal('entry')]),entryId:Type.Optional(uuid),path:Type.String({maxLength:1024}),kind:Type.Union([Type.Literal('file'),Type.Literal('directory')]),bytes:Type.Integer({minimum:0,maximum:SNAPSHOT_LIMITS.bytes}),sha256:Type.Optional(Type.String({pattern:'^[a-f0-9]{64}$'})),origin:Type.Union([OriginSchema,Type.Null()])},{additionalProperties:false});
export const SnapshotManifestSchema=Type.Object({format:Type.Literal(SNAPSHOT_FORMAT),producerVersion:Type.String({pattern:'^[0-9]+\\.[0-9]+\\.[0-9]+$'}),schemaRevision:Type.Union([Type.Literal(10),Type.Literal(11),Type.Literal(12),Type.Literal(13)]),createdAt:Type.String({format:'date-time'}),entries:Type.Array(Type.Object({id:uuid,path:Type.String({minLength:1,maxLength:4096}),device:digits,inode:digits,ancestors:Type.Array(Type.String({pattern:'^[0-9]+:[0-9]+$'}),{maxItems:1024})},{additionalProperties:false}),{maxItems:100}),items:Type.Array(SnapshotItemSchema,{maxItems:SNAPSHOT_LIMITS.items}),bytes:Type.Integer({minimum:0,maximum:SNAPSHOT_LIMITS.bytes})},{additionalProperties:false});
export type SnapshotManifest=Static<typeof SnapshotManifestSchema>;
export type SnapshotItem=Static<typeof SnapshotItemSchema>;
export type Origin=Static<typeof OriginSchema>;
export const itemKey=(item:Pick<SnapshotItem,'area'|'entryId'|'path'>)=>JSON.stringify([item.area,item.entryId??'',item.path]);
export const fullWitness=(value:Origin)=>`${value.device}:${value.inode}:${value.size}:${value.mtimeNs}:${value.ctimeNs}:${value.mode}`;
export const stableOrigin=(value:Origin)=>`${value.device}:${value.inode}:${value.size}:${value.mtimeNs}:${value.mode}`;
export function parseManifest(value:unknown):SnapshotManifest{
  if(!Check(SnapshotManifestSchema,value))throw new PublicError('BAD_REQUEST');const roots=new Set(value.entries.map(entry=>entry.id)),seen=new Map<string,SnapshotItem>();if(roots.size!==value.entries.length)throw new PublicError('BAD_REQUEST');let bytes=0;
  for(const item of value.items){if(relativePath(item.path,true)!==item.path||item.path.split('/').length>SNAPSHOT_LIMITS.depth||(item.area==='entry'? !item.entryId||!roots.has(item.entryId):item.entryId!==undefined))throw new PublicError('BAD_REQUEST');const key=itemKey(item);if(seen.has(key)||item.kind==='directory'&&(item.bytes!==0||item.sha256!==undefined)||item.kind==='file'&&!item.sha256||item.origin===null&&!(item.area==='state'&&item.path==='filehub.db'&&item.kind==='file'))throw new PublicError('BAD_REQUEST');if(item.origin){const mode=BigInt(item.origin.mode)&0o170000n;if(mode!==(item.kind==='file'?0o100000n:0o040000n)||item.kind==='file'&&BigInt(item.origin.size)!==BigInt(item.bytes))throw new PublicError('BAD_REQUEST');}seen.set(key,item);bytes+=item.bytes;if(bytes>SNAPSHOT_LIMITS.bytes)throw new PublicError('RESOURCE_LIMIT');}
  if(bytes!==value.bytes)throw new PublicError('BAD_REQUEST');
  const areas=[{area:'state' as const},{area:'config' as const},...value.entries.map(entry=>({area:'entry' as const,entryId:entry.id}))];
  for(const area of areas)if(seen.get(itemKey({...area,path:''}))?.kind!=='directory')throw new PublicError('BAD_REQUEST');
  for(const item of value.items)if(item.path){const parent=item.path.split('/').slice(0,-1).join('/');if(seen.get(itemKey({...item,path:parent}))?.kind!=='directory')throw new PublicError('BAD_REQUEST');}
  const database=seen.get(itemKey({area:'state',path:'filehub.db'}));if(!database||database.kind!=='file'||database.origin!==null)throw new PublicError('BAD_REQUEST');
  return value;
}
