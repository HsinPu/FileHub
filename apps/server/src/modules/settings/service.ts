import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Check } from 'typebox/value';
import { PreferencesSchema,type Preferences,type AdminSnapshot } from '@filehub/contracts';
import type { FileHubDatabase } from '../../persistence/database.js';
import { users,entries,grants,preferences,entryCandidates } from '../../persistence/schema.js';
import { PublicError } from '../../plugins/errors.js';
import { hasControlCharacters,openScoped,type RootIdentity } from '../../storage/scoped.js';
import type { IdentityService } from '../identity/service.js';
import type { EntryService } from '../entries/service.js';
const entryDTO=(row:typeof entries.$inferSelect)=>({id:row.id,label:row.label,kind:row.kind,enabled:row.enabled,writable:row.writable});
const userDTO=(row:typeof users.$inferSelect)=>({id:row.id,username:row.username,role:row.role,enabled:row.enabled,createdAt:new Date(row.createdAt).toISOString()});
const labelValid=(label:string)=>label.trim()&&[...label].length<=80&&!hasControlCharacters(label);
export class SettingsService {
  constructor(readonly database:FileHubDatabase,readonly identity:IdentityService,readonly entryService:EntryService){}
  private user(id:string){if(!this.database.isReady())throw new PublicError('SERVICE_UNAVAILABLE');const user=this.database.db.select().from(users).where(eq(users.id,id)).get();if(!user?.enabled)throw new PublicError('UNAUTHORIZED');return user;}
  private admin(id:string){const user=this.user(id);if(user.role!=='admin')throw new PublicError('FORBIDDEN');}
  private guard(actor:string,reauthorize:()=>void){reauthorize();this.admin(actor);}
  private target(id:string){const user=this.database.db.select().from(users).where(eq(users.id,id)).get();if(!user)throw new PublicError('NOT_FOUND');return user;}
  private entry(id:string){const entry=this.database.db.select().from(entries).where(eq(entries.id,id)).get();if(!entry)throw new PublicError('NOT_FOUND');return entry;}
  getPreferences(user:string):Preferences{this.user(user);const row=this.database.db.select().from(preferences).where(eq(preferences.userId,user)).get();return row?{defaultView:row.defaultView,pageSize:row.pageSize as Preferences['pageSize']}:{defaultView:'list',pageSize:50};}
  setPreferences(user:string,value:Preferences){this.user(user);if(!Check(PreferencesSchema,value))throw new PublicError('BAD_REQUEST');this.database.db.insert(preferences).values({userId:user,...value}).onConflictDoUpdate({target:preferences.userId,set:value}).run();return this.getPreferences(user);}
  snapshot(actor:string):AdminSnapshot{
    this.admin(actor);return this.database.sqlite.transaction(()=>{this.admin(actor);const accountRows=this.database.db.select().from(users).limit(101).all(),entryRows=this.database.db.select().from(entries).limit(101).all(),grantRows=this.database.db.select().from(grants).limit(10001).all(),candidateRows=this.database.db.select().from(entryCandidates).limit(101).all();if(accountRows.length>100||entryRows.length>100||grantRows.length>10000||candidateRows.length>100)throw new PublicError('RESOURCE_LIMIT');return{users:accountRows.map(userDTO),entries:entryRows.map(entryDTO),grants:grantRows,candidates:candidateRows.map(row=>({id:row.id,label:row.label,kind:row.kind,available:!entryRows.some(entry=>entry.rootPath===row.rootPath)})),writeSupported:process.platform==='linux'};})();
  }
  async createUser(actor:string,input:{username:string;password:string;role:'admin'|'member'},reauthorize=()=>{}){this.guard(actor,reauthorize);const user=await this.identity.createUser(input.username,input.password,input.role,()=>this.guard(actor,reauthorize));return userDTO(this.target(user.id));}
  updateUser(actor:string,id:string,input:{role?:'admin'|'member';enabled?:boolean},reauthorize=()=>{}){this.guard(actor,reauthorize);this.identity.updateUser(id,input.enabled,input.role,()=>this.guard(actor,reauthorize));return userDTO(this.target(id));}
  async resetPassword(actor:string,id:string,password:string,reauthorize=()=>{}){this.guard(actor,reauthorize);const user=this.target(id);await this.identity.changePassword(user.username,password,()=>this.guard(actor,reauthorize));}
  // CLI-only: 候選的實體 path／identity 不進 contracts 或 HTTP。
  async offerEntry(kind:'managed'|'external',label:string,path:string){const root=await this.entryService.inspectRegistration(kind,label,path);return this.database.sqlite.transaction(()=>{if(!this.database.isReady())throw new PublicError('SERVICE_UNAVAILABLE');const prior=this.database.db.select().from(entryCandidates).limit(101).all();if(prior.length>=100)throw new PublicError('RESOURCE_LIMIT');if(prior.some(row=>row.rootPath===root.path))throw new PublicError('CONFLICT');const row={id:randomUUID(),kind,label:label.trim(),rootPath:root.path,rootIdentity:JSON.stringify(root)};this.database.db.insert(entryCandidates).values(row).run();return{id:row.id,kind:row.kind,label:row.label};}).immediate();}
  async createEntry(actor:string,input:{candidateId:string;label:string},reauthorize=()=>{}){
    this.guard(actor,reauthorize);const candidate=this.database.db.select().from(entryCandidates).where(eq(entryCandidates.id,input.candidateId)).get();if(!candidate)throw new PublicError('NOT_FOUND');const expected:unknown=JSON.parse(candidate.rootIdentity);
    if(!expected||typeof expected!=='object'||!('path'in expected)||expected.path!==candidate.rootPath||!('device'in expected)||typeof expected.device!=='string'||!('inode'in expected)||typeof expected.inode!=='string'||!('ancestors'in expected)||!Array.isArray(expected.ancestors)||!expected.ancestors.every(item=>typeof item==='string'))throw new PublicError('SERVICE_UNAVAILABLE');
    const root:RootIdentity={path:candidate.rootPath,device:expected.device,inode:expected.inode,ancestors:expected.ancestors};const result=await this.entryService.register(candidate.kind,input.label,candidate.rootPath,()=>{this.guard(actor,reauthorize);if(!this.database.db.select().from(entryCandidates).where(eq(entryCandidates.id,input.candidateId)).get())throw new PublicError('CONFLICT');},root);return entryDTO(this.entry(result.id));
  }
  removeCandidate(actor:string,id:string){this.admin(actor);this.database.db.delete(entryCandidates).where(eq(entryCandidates.id,id)).run();}
  async updateEntry(actor:string,id:string,input:{label?:string;enabled?:boolean},reauthorize=()=>{}){
    this.guard(actor,reauthorize);if((input.label===undefined&&input.enabled===undefined)||(input.label!==undefined&&!labelValid(input.label))||(input.enabled!==undefined&&typeof input.enabled!=='boolean'))throw new PublicError('BAD_REQUEST');const before=this.entry(id);
    if(input.enabled===true&&!before.enabled){const access=this.entryService.maintenance(id),opened=await openScoped(access.root,'');try{await opened.verify();}finally{await opened.close();}}
    return this.database.sqlite.transaction(()=>{this.guard(actor,reauthorize);const current=this.entry(id);if(current.rootDevice!==before.rootDevice||current.rootInode!==before.rootInode)throw new PublicError('CONFLICT');this.database.db.update(entries).set({...(input.label===undefined?{}:{label:input.label.trim()}),...(input.enabled===undefined?{}:{enabled:input.enabled})}).where(eq(entries.id,id)).run();return entryDTO(this.entry(id));}).immediate();
  }
  async setWritable(actor:string,id:string,enabled:boolean,reauthorize=()=>{}){this.guard(actor,reauthorize);await this.entryService.setWritable(id,enabled,()=>this.guard(actor,reauthorize));return entryDTO(this.entry(id));}
  async setGrant(actor:string,input:{userId:string;entryId:string;scope:string;canDownload:boolean;canWrite:boolean},reauthorize=()=>{}){this.guard(actor,reauthorize);const user=this.target(input.userId);await this.entryService.grant(user.username,input.entryId,input.scope,input.canDownload,input.canWrite,()=>this.guard(actor,reauthorize));}
  async revokeGrant(actor:string,input:{userId:string;entryId:string;scope:string},reauthorize=()=>{}){this.guard(actor,reauthorize);const user=this.target(input.userId);await this.entryService.revoke(user.username,input.entryId,input.scope);}
}
