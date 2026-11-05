import { createHash,randomBytes,timingSafeEqual } from 'node:crypto';
import { and,eq,lte,sql } from 'drizzle-orm';
import { SHARE_LIMITS,type Share,type ShareCreate,type ListQuery,type ResourceMetadata } from '@filehub/contracts';
import type { FileHubDatabase } from '../../persistence/database.js';
import { shares,shareSessions,shareThrottle,users } from '../../persistence/schema.js';
import { PublicError } from '../../plugins/errors.js';
import { openScoped,relativePath,type ScopedAnchor } from '../../storage/scoped.js';
import { hashPassword,verifyPassword } from '../identity/password.js';
import type { EntryService } from '../entries/service.js';
import { fingerprint,type FileService } from '../files/service.js';
type Row=typeof shares.$inferSelect;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const secretValid=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const same=(a:string,b:string)=>/^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const dto=(row:Row):Share=>({id:row.id,entryId:row.entryId,path:row.path,name:row.name,kind:row.kind,passwordProtected:row.passwordHash!==null,revoked:row.revoked,createdAt:new Date(row.createdAt).toISOString(),expiresAt:new Date(row.expiresAt).toISOString()});
const publicError=(error:unknown):never=>{if(error instanceof PublicError&&['SERVICE_UNAVAILABLE','RESOURCE_LIMIT','BAD_REQUEST','CONFLICT'].includes(error.code))throw error;throw new PublicError('NOT_FOUND');};

export class ShareService {
  constructor(readonly database:FileHubDatabase,readonly entries:EntryService,readonly files:FileService,private readonly now:()=>number=Date.now){}
  private ready(){if(!this.database.isReady())throw new PublicError('SERVICE_UNAVAILABLE');}
  private user(user:string){this.ready();if(!this.database.db.select({id:users.id}).from(users).where(and(eq(users.id,user),eq(users.enabled,true))).get())throw new PublicError('UNAUTHORIZED');}
  private row(id:string){this.ready();return this.database.db.select().from(shares).where(eq(shares.id,id)).get();}
  get(user:string,id:string){this.user(user);const row=this.row(id);if(!row||row.userId!==user)throw new PublicError('NOT_FOUND');return dto(row);}
  list(user:string){this.user(user);return{items:this.database.db.select().from(shares).where(eq(shares.userId,user)).orderBy(sql`CASE WHEN ${shares.revoked}=0 AND ${shares.expiresAt}>${this.now()} THEN 0 ELSE 1 END`,sql`${shares.createdAt} DESC`).limit(100).all().map(dto)};}
  revoke(user:string,id:string){this.user(user);return this.database.sqlite.transaction(()=>{this.get(user,id);this.database.db.update(shares).set({revoked:true}).where(eq(shares.id,id)).run();this.database.db.delete(shareSessions).where(eq(shareSessions.shareId,id)).run();return this.get(user,id);}).immediate();}
  async create(user:string,input:ShareCreate,reauthorize:()=>void=()=>{}){
    this.user(user);const path=relativePath(input.path),expiresAt=Date.parse(input.expiresAt),secretHash=digest(input.secret);
    if(!path||!secretValid(input.secret)||!Number.isSafeInteger(expiresAt)||expiresAt<=this.now()||expiresAt>this.now()+SHARE_LIMITS.maxLifetimeMs)throw new PublicError('BAD_REQUEST');
    this.entries.authorize(user,input.entryId,path,'download');
    const passwordHash=input.password===undefined?null:await hashPassword(input.password,digest(`filehub-share-salt-v1:${input.secret}`).slice(0,32));
    // 包含慢速 scrypt 結果；不能另存可快速猜密碼的 request digest。
    const requestHash=digest(JSON.stringify({user,entryId:input.entryId,path,version:input.version,secretHash,passwordHash,expiresAt}));
    if(expiresAt<=this.now())throw new PublicError('BAD_REQUEST');
    const prior=this.row(input.id);if(prior){reauthorize();if(prior.userId!==user||!same(prior.requestHash,requestHash))throw new PublicError('CONFLICT');return dto(prior);}
    const release=this.files.admitRead();
    try{
      const access=this.entries.authorize(user,input.entryId,path,'download'),opened=await openScoped(access.root,path);
      try{
        if(fingerprint(input.entryId,path,opened.stat)!==input.version)throw new PublicError('CONFLICT');
        await opened.verify();if(opened.stat.birthtimeNs<=0n)throw new PublicError('RESOURCE_LIMIT');const row={id:input.id,userId:user,entryId:input.entryId,path,name:path.split('/').at(-1)??'',kind:opened.stat.isDirectory()?'directory' as const:'file' as const,device:String(opened.stat.dev),inode:String(opened.stat.ino),birthtimeNs:String(opened.stat.birthtimeNs),secretHash,passwordHash,requestHash,revoked:false,createdAt:this.now(),expiresAt};
        return this.database.sqlite.transaction(()=>{reauthorize();this.entries.authorize(user,input.entryId,path,'download');const existing=this.row(input.id);if(existing){if(existing.userId!==user||!same(existing.requestHash,requestHash))throw new PublicError('CONFLICT');return dto(existing);}
          const total=this.database.sqlite.prepare<[],{n:number}>('SELECT count(*) AS n FROM shares').get()?.n??SHARE_LIMITS.history;
          const active=this.database.sqlite.prepare<[string,number],{n:number}>('SELECT count(*) AS n FROM shares WHERE user_id=? AND revoked=0 AND expires_at>?').get(user,this.now())?.n??SHARE_LIMITS.ownerActive;
          if(total>=SHARE_LIMITS.history||active>=SHARE_LIMITS.ownerActive)throw new PublicError('RESOURCE_LIMIT');this.database.db.insert(shares).values(row).run();return dto(row);
        }).immediate();
      }finally{await opened.close();}
    }finally{release();}
  }
  private active(id:string){const row=this.row(id);if(!row||row.revoked||row.expiresAt<=this.now())throw new PublicError('NOT_FOUND');try{this.entries.authorize(row.userId,row.entryId,row.path,'download');}catch(error){publicError(error);}return row;}
  private bySecret(id:string,secret:string|undefined){const row=this.active(id);if(!secretValid(secret)||!same(row.secretHash,digest(secret)))throw new PublicError('NOT_FOUND');return row;}
  authorize(id:string,token:string|undefined){
    this.ready();if(!secretValid(token))throw new PublicError('UNAUTHORIZED');const grant=this.database.db.select().from(shareSessions).where(eq(shareSessions.tokenHash,digest(token))).get();if(!grant||grant.shareId!==id||grant.expiresAt<=this.now())throw new PublicError('UNAUTHORIZED');return this.active(id);
  }
  anchor(row:Row):ScopedAnchor{return{path:row.path,device:row.device,inode:row.inode,birthtimeNs:row.birthtimeNs};}
  private path(row:Row,path:string){const relative=relativePath(path);if(row.kind==='file'&&relative)throw new PublicError('NOT_FOUND');return relative?`${row.path}/${relative}`:row.path;}
  private async source(row:Row,signal?:AbortSignal){try{await this.files.metadata(row.userId,row.entryId,row.path,signal,this.anchor(row));}catch(error){publicError(error);}}
  async challenge(id:string,secret:string|undefined,token:string|undefined,signal?:AbortSignal){const row=secret===undefined?this.authorize(id,token):this.bySecret(id,secret);await this.source(row,signal);this.active(id);return{passwordProtected:row.passwordHash!==null,expiresAt:new Date(row.expiresAt).toISOString()};}
  private reserve(ip:string,id:string){
    this.ready();const now=this.now(),start=now-900000;
    this.database.sqlite.transaction(()=>{this.database.db.delete(shareThrottle).where(lte(shareThrottle.windowStart,start)).run();const keys=[[digest(`ip:${ip}`),60],[digest(`share:${id}:ip:${ip}`),10]] as const;
      for(const [key,max] of keys){const row=this.database.db.select().from(shareThrottle).where(eq(shareThrottle.key,key)).get();if((row?.attempts??0)>=max)throw new PublicError('RATE_LIMITED');}
      if((this.database.sqlite.prepare<[],{n:number}>('SELECT count(*) AS n FROM share_throttle').get()?.n??10001)>9998)throw new PublicError('RATE_LIMITED');
      for(const [key] of keys){const row=this.database.db.select().from(shareThrottle).where(eq(shareThrottle.key,key)).get();this.database.db.insert(shareThrottle).values({key,windowStart:now,attempts:1}).onConflictDoUpdate({target:shareThrottle.key,set:{attempts:(row?.attempts??0)+1}}).run();}
    }).immediate();
  }
  async access(id:string,secret:string|undefined,password:string|undefined,ip:string,signal?:AbortSignal){
    this.reserve(ip,id);const row=this.bySecret(id,secret);await this.source(row,signal);
    if(row.passwordHash&&(password===undefined||!await verifyPassword(password,row.passwordHash)))throw new PublicError('FORBIDDEN');
    await this.source(row,signal);if(signal?.aborted)throw new PublicError('SERVICE_UNAVAILABLE');
    const token=randomBytes(32).toString('base64url'),expiresAt=Math.min(this.now()+SHARE_LIMITS.sessionMs,row.expiresAt);
    this.database.sqlite.transaction(()=>{this.active(id);this.database.db.delete(shareSessions).where(lte(shareSessions.expiresAt,this.now())).run();
      const total=this.database.sqlite.prepare<[],{n:number}>('SELECT count(*) AS n FROM share_sessions').get()?.n??SHARE_LIMITS.sessions,count=this.database.sqlite.prepare<[string],{n:number}>('SELECT count(*) AS n FROM share_sessions WHERE share_id=?').get(id)?.n??SHARE_LIMITS.shareSessions;
      if(total>=SHARE_LIMITS.sessions||count>=SHARE_LIMITS.shareSessions)throw new PublicError('RATE_LIMITED');this.database.db.insert(shareSessions).values({tokenHash:digest(token),shareId:id,expiresAt}).run();
    }).immediate();return{token,expiresAt,info:{name:row.name,kind:row.kind,passwordProtected:row.passwordHash!==null,expiresAt:new Date(row.expiresAt).toISOString()}};
  }
  private publicResource(row:Row,resource:ResourceMetadata){if(resource.kind!=='file'&&resource.kind!=='directory')throw new PublicError('NOT_FOUND');return{name:resource.path===row.path?row.name:resource.name,path:resource.path===row.path?'':resource.path.slice(row.path.length+1),kind:resource.kind,size:resource.size,modifiedAt:resource.modifiedAt,version:resource.version,canBrowse:resource.canBrowse,canDownload:resource.canDownload};}
  async metadata(id:string,token:string|undefined,path:string,signal?:AbortSignal){const row=this.authorize(id,token);try{const result=await this.files.metadata(row.userId,row.entryId,this.path(row,path),signal,this.anchor(row));this.authorize(id,token);return this.publicResource(row,result.resource);}catch(error){return publicError(error);}}
  async listPublic(id:string,token:string|undefined,path:string,options:ListQuery,signal?:AbortSignal){const row=this.authorize(id,token);if(row.kind!=='directory')throw new PublicError('NOT_FOUND');try{const result=await this.files.list(row.userId,row.entryId,this.path(row,path),options,signal,this.anchor(row),true);this.authorize(id,token);return{path:relativePath(path),version:result.version,items:result.items.map(item=>this.publicResource(row,item)),total:result.total,offset:result.offset,limit:result.limit,hasMore:result.hasMore,omitted:result.omitted};}catch(error){return publicError(error);}}
  async openDownload(id:string,token:string|undefined,path:string,version:string|undefined,signal:AbortSignal){const row=this.authorize(id,token),target=this.path(row,path);try{const opened=await this.files.openDownload(row.userId,row.entryId,target,version,signal,this.anchor(row));
    try{this.authorize(id,token);return{...opened,resource:this.publicResource(row,opened.resource),check:async()=>{const current=this.authorize(id,token),access=this.entries.authorize(current.userId,current.entryId,target,'download'),source=await openScoped(access.root,current.path,false,this.anchor(current));try{await source.verify();}finally{await source.close();}if(signal.aborted)throw new PublicError('SERVICE_UNAVAILABLE');this.authorize(id,token);}};}catch(error){await opened.close();throw error;}
  }catch(error){return publicError(error);}}
}
