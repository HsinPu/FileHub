import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { mkdir,writeFile,rename,unlink,symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { expect,onTestFinished,test } from 'vitest';
import { ShareSchema,PublicShareResourceSchema } from '@filehub/contracts';
import { Check } from 'typebox/value';
import { databaseFixture } from '../helpers/database.js';
import { IdentityService } from '../../src/modules/identity/service.js';
import { EntryService } from '../../src/modules/entries/service.js';
import { FileService } from '../../src/modules/files/service.js';
import { ShareService } from '../../src/modules/shares/service.js';
import { buildApp } from '../../src/app.js';
import { parseConfig } from '../../src/config/index.js';
const password='Synthetic-share-password-123!';
async function fixture(){
  const f=await databaseFixture();f.migrate();const db=f.open(),identity=new IdentityService(db),admin=await identity.bootstrap('admin',password),root=join(f.directory,'files');
  await mkdir(join(root,'folder','nested'),{recursive:true});await writeFile(join(root,'folder','hello.txt'),'hello world');await writeFile(join(root,'private.txt'),'private canary');
  const entries=new EntryService(db),entry=await entries.register('managed','分享測試',root),files=new FileService(entries);let now=Date.now();const shares=new ShareService(db,entries,files,()=>now);
  const app=buildApp({config:parseConfig({FILEHUB_LOG_LEVEL:'silent'}),dependencies:{identity,entries,files,shares}});onTestFinished(()=>app.close());
  const login=await app.inject({method:'POST',url:'/api/session',headers:{origin:'http://127.0.0.1:3000'},payload:{username:'admin',password}}),headers={origin:'http://127.0.0.1:3000',cookie:`filehub_session=${login.cookies[0]?.value}`,'x-csrf-token':login.json<{csrfToken:string}>().csrfToken};
  const create=async(path='folder',protectedBy?:string,user=admin.id)=>{const resource=await files.metadata(user,entry.id,path),input={id:randomUUID(),entryId:entry.id,path,version:resource.resource.version,secret:randomBytes(32).toString('base64url'),expiresAt:new Date(now+86400000).toISOString(),...(protectedBy?{password:protectedBy}:{})};await shares.create(user,input);return input;};
  return{...f,db,identity,admin,root,entries,entry,files,shares,app,headers,create,expire:()=>{now+=86400001;}};
}
test('擁有者 API 驗證 CSRF、私密欄位、完整輸入冪等及跨帳號隔離',async()=>{
  const f=await fixture(),input=await f.create('folder/hello.txt',password),headers=f.headers;
  const created=await f.app.inject({method:'POST',url:'/api/shares',headers,payload:input});expect(created.statusCode).toBe(200);expect(Check(ShareSchema,created.json())).toBe(true);
  expect(created.body).not.toContain(input.secret);expect(created.body).not.toContain('Hash');expect(created.body).not.toContain(f.root);
  const row=f.db.sqlite.prepare('SELECT * FROM shares WHERE id=?').get(input.id) as Record<string,unknown>;expect(row.secret_hash).toBe(createHash('sha256').update(input.secret).digest('hex'));expect(row.password_hash).not.toBe(password);expect(JSON.stringify(row)).not.toContain(input.secret);
  expect((await f.app.inject({method:'POST',url:'/api/shares',headers,payload:{...input,password:password+'changed'}})).statusCode).toBe(409);
  expect((await f.app.inject({method:'POST',url:'/api/shares',headers:{cookie:headers.cookie},payload:input})).statusCode).toBe(403);
  expect((await f.app.inject({url:'/api/shares'})).statusCode).toBe(401);
  const reader=await f.identity.createUser('reader',password);expect(()=>f.shares.get(reader.id,input.id)).toThrowError();expect(f.shares.list(reader.id).items).toEqual([]);
});
test('公開路由密碼前不洩漏名稱，獨立授權 Cookie 不能登入或跨分享重播',async()=>{
  const f=await fixture(),input=await f.create('folder/hello.txt',password),base=`/public/shares/${input.id}`,headers={authorization:`Bearer ${input.secret}`,origin:f.headers.origin};
  const challenge=await f.app.inject({url:`${base}/info`,headers});expect(challenge.statusCode).toBe(200);expect(challenge.body).not.toContain('hello');expect(challenge.json()).toMatchObject({passwordProtected:true});
  expect((await f.app.inject({url:`${base}/info`,headers:{...headers,authorization:`Bearer ${'z'.repeat(43)}`}})).statusCode).toBe(404);
  expect((await f.app.inject({url:`${base}/resource`,headers:f.headers})).statusCode).toBe(401);
  expect((await f.app.inject({method:'POST',url:`${base}/access`,headers,payload:{password:'wrong'}})).statusCode).toBe(403);
  expect((await f.app.inject({method:'POST',url:`${base}/access`,headers:{authorization:headers.authorization,origin:'https://evil.invalid'},payload:{password}})).statusCode).toBe(403);
  const access=await f.app.inject({method:'POST',url:`${base}/access`,headers,payload:{password}});expect(access.statusCode).toBe(200);expect(access.headers['set-cookie']).toContain(`Path=${base}`);expect(access.headers['set-cookie']).toContain('HttpOnly; SameSite=Strict');
  const cookie=access.cookies[0];if(!cookie)throw new Error('grant cookie missing');const grant={cookie:`${cookie.name}=${cookie.value}; filehub_session=invalid`};
  const resource=await f.app.inject({url:`${base}/resource`,headers:grant});expect(resource.statusCode).toBe(200);expect(Check(PublicShareResourceSchema,resource.json())).toBe(true);expect(resource.json()).toMatchObject({name:'hello.txt',path:''});expect(resource.body).not.toContain(f.entry.id);expect(resource.body).not.toContain('folder');
  expect((await f.app.inject({url:'/api/session',headers:{cookie:`filehub_session=${cookie.value}`}})).statusCode).toBe(401);
  const other=await f.create();expect(()=>f.shares.authorize(other.id,cookie.value)).toThrowError();
});
test('公開檔案支援 Range／HEAD／零 bytes，弱 If-Range 回完整原檔，拒絕目錄及越界',async()=>{
  const f=await fixture(),input=await f.create('folder'),grant=await f.shares.access(input.id,input.secret,undefined,'127.0.0.2'),headers={cookie:`filehub_public_${input.id.replaceAll('-','')}=${grant.token}`},base=`/public/shares/${input.id}`;
  const list=await f.app.inject({url:`${base}/files`,headers});expect(list.statusCode).toBe(200);expect(list.json<{items:{path:string}[]}>().items.map(item=>item.path)).toEqual(['nested','hello.txt']);expect(list.body).not.toContain('private');expect(list.body).not.toContain('entryId');
  const range=await f.app.inject({url:`${base}/download?path=hello.txt`,headers:{...headers,range:'bytes=1-4'}});expect(range.statusCode).toBe(206);expect(range.body).toBe('ello');expect(range.headers['content-disposition']).toContain('attachment');
  const full=await f.app.inject({url:`${base}/download?path=hello.txt`,headers:{...headers,range:'bytes=1-4','if-range':String(range.headers.etag)}});expect(full.statusCode).toBe(200);expect(full.body).toBe('hello world');
  const head=await f.app.inject({method:'HEAD',url:`${base}/download?path=hello.txt`,headers});expect(head.statusCode).toBe(200);expect(head.body).toBe('');expect(head.headers['content-length']).toBe('11');
  expect((await f.app.inject({url:`${base}/download?path=hello.txt`,headers:{...headers,range:'bytes=99-'}})).statusCode).toBe(416);
  await writeFile(join(f.root,'folder','empty.txt'),'');expect((await f.app.inject({url:`${base}/download?path=empty.txt`,headers})).body).toBe('');
  for(const path of ['../private.txt','/private.txt','nested\\..\\hello.txt','.filehub/private'])expect((await f.app.inject({url:`${base}/resource?${new URLSearchParams({path})}`,headers})).statusCode).toBe(400);
  expect((await f.app.inject({url:`${base}/resource?path=%252e%252e%2Fprivate.txt`,headers})).statusCode).toBe(404);
  expect(f.files.activeRequests).toBe(0);
});
test.each(['file','directory'] as const)('來源 %s 移動、同名替換後，原分享與已取得 Cookie 都失效',async(kind)=>{
  const f=await fixture(),path=kind==='file'?'folder/hello.txt':'folder',input=await f.create(path),grant=await f.shares.access(input.id,input.secret,undefined,'127.0.0.3');
  await rename(join(f.root,...path.split('/')),join(f.root,'old-source'));if(kind==='file')await writeFile(join(f.root,...path.split('/')),'replacement canary');else{await mkdir(join(f.root,'folder'));await writeFile(join(f.root,'folder','hello.txt'),'replacement canary');}
  await expect(f.shares.metadata(input.id,grant.token,'')).rejects.toMatchObject({code:'NOT_FOUND'});await expect(f.shares.challenge(input.id,input.secret,undefined)).rejects.toMatchObject({code:'NOT_FOUND'});expect(f.files.activeRequests).toBe(0);
});
test('撤銷、期限、帳號停用、入口停用與 owner grant 變更皆重新授權',async()=>{
  const f=await fixture(),reader=await f.identity.createUser('reader',password);await f.entries.grant('reader',f.entry.id,'folder',true);const input=await f.create('folder',undefined,reader.id),grant=await f.shares.access(input.id,input.secret,undefined,'127.0.0.4');
  await f.entries.revoke('reader',f.entry.id,'folder');await expect(f.shares.metadata(input.id,grant.token,'')).rejects.toMatchObject({code:'NOT_FOUND'});await f.entries.grant('reader',f.entry.id,'folder',true);
  const opened=await f.shares.openDownload(input.id,grant.token,'hello.txt',undefined,new AbortController().signal);try{await f.identity.disableUser('reader');await expect(opened.check()).rejects.toMatchObject({code:'NOT_FOUND'});}finally{await opened.close();}
  const revoked=await f.create();const prior=await f.shares.access(revoked.id,revoked.secret,undefined,'127.0.0.5');f.shares.revoke(f.admin.id,revoked.id);await expect(f.shares.challenge(revoked.id,revoked.secret,undefined)).rejects.toMatchObject({code:'NOT_FOUND'});expect(()=>f.shares.authorize(revoked.id,prior.token)).toThrowError();
  const expired=await f.create();f.expire();await expect(f.shares.challenge(expired.id,expired.secret,undefined)).rejects.toMatchObject({code:'NOT_FOUND'});
  const disabled=await f.create();await f.entries.disable(f.entry.id);await expect(f.shares.challenge(disabled.id,disabled.secret,undefined)).rejects.toMatchObject({code:'NOT_FOUND'});
  expect(f.files.activeRequests).toBe(0);
});
test('公開錯密碼與無效秘密共用有界 IP／分享嘗試限制',async()=>{
  const f=await fixture(),input=await f.create();for(let i=0;i<10;i++)await expect(f.shares.access(input.id,'z'.repeat(43),undefined,'198.51.100.9')).rejects.toMatchObject({code:'NOT_FOUND'});await expect(f.shares.access(input.id,input.secret,undefined,'198.51.100.9')).rejects.toMatchObject({code:'RATE_LIMITED'});expect(f.db.sqlite.prepare('SELECT count(*) AS n FROM share_throttle').get()).toEqual({n:2});
});
test('已開啟下載仍驗分享撤銷；刪除／symlink 不可藉公開路由越界',async()=>{
  const f=await fixture(),input=await f.create(),grant=await f.shares.access(input.id,input.secret,undefined,'127.0.0.6');const opened=await f.shares.openDownload(input.id,grant.token,'hello.txt',undefined,new AbortController().signal);try{f.shares.revoke(f.admin.id,input.id);await expect(opened.check()).rejects.toMatchObject({code:'UNAUTHORIZED'});}finally{await opened.close();}
  const removed=await f.create('folder/hello.txt');await unlink(join(f.root,'folder','hello.txt'));await expect(f.shares.challenge(removed.id,removed.secret,undefined)).rejects.toMatchObject({code:'NOT_FOUND'});
  if(process.platform==='linux'){await symlink(join(f.root,'private.txt'),join(f.root,'folder','link'));const dir=await f.create();const token=await f.shares.access(dir.id,dir.secret,undefined,'127.0.0.7');expect((await f.shares.listPublic(dir.id,token.token,'',{})).items.map(item=>item.name)).not.toContain('link');await expect(f.shares.metadata(dir.id,token.token,'link')).rejects.toMatchObject({code:'NOT_FOUND'});}
});
