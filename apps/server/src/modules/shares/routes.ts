import { Readable } from 'node:stream';
import type { FastifyPluginAsync,FastifyRequest,FastifyReply } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Static } from 'typebox';
import { ApiErrorResponseSchema,ShareParamsSchema,ShareCreateSchema,ShareSchema,ShareListSchema,ShareAccessSchema,PublicShareChallengeSchema,PublicShareInfoSchema,PublicShareResourceSchema,PublicShareListingSchema,ResourceQuerySchema,ListQuerySchema,fileHubMountPrefix } from '@filehub/contracts';
import type { AppConfig } from '../../config/index.js';
import { PublicError } from '../../plugins/errors.js';
import type { IdentityService } from '../identity/service.js';
import { requireCsrf,requireOrigin,sessionCookie } from '../identity/routes.js';
import { byteRange } from '../files/range.js';
import type { ShareService } from './service.js';

const errors={400:ApiErrorResponseSchema,401:ApiErrorResponseSchema,403:ApiErrorResponseSchema,404:ApiErrorResponseSchema,409:ApiErrorResponseSchema,416:ApiErrorResponseSchema,429:ApiErrorResponseSchema,503:ApiErrorResponseSchema};
export const publicCookieName=(id:string)=>`filehub_public_${id.replaceAll('-','')}`;
function grant(request:FastifyRequest,id:string){const name=publicCookieName(id),values=(request.headers.cookie??'').split(';').map(part=>part.trim()).filter(part=>part.startsWith(`${name}=`));return values.length===1?values[0]?.slice(name.length+1):undefined;}
function secret(request:FastifyRequest){const value=request.headers.authorization;return typeof value==='string'&&/^Bearer [A-Za-z0-9_-]{43}$/.test(value)?value.slice(7):undefined;}
export const shareRoutes:FastifyPluginAsync<{shares:ShareService;identity:IdentityService;config:AppConfig}>=async(instance,{shares,identity,config})=>{
  const app=instance.withTypeProvider<TypeBoxTypeProvider>();
  app.addHook('onRequest',async request=>{identity.authenticate(sessionCookie(request));});
  const session=(request:FastifyRequest)=>identity.authenticate(sessionCookie(request));
  app.get('/api/shares',{schema:{response:{200:ShareListSchema,...errors}}},async request=>shares.list(session(request).user.id));
  app.get('/api/shares/:id',{schema:{params:ShareParamsSchema,response:{200:ShareSchema,...errors}}},async request=>shares.get(session(request).user.id,request.params.id));
  app.post('/api/shares',{bodyLimit:4096,schema:{body:ShareCreateSchema,response:{200:ShareSchema,...errors}}},async request=>{const current=session(request);requireCsrf(request,current.csrfToken,config);return shares.create(current.user.id,request.body,()=>{session(request);});});
  app.post('/api/shares/:id/revoke',{schema:{params:ShareParamsSchema,response:{200:ShareSchema,...errors}}},async request=>{const current=session(request);requireCsrf(request,current.csrfToken,config);return shares.revoke(current.user.id,request.params.id);});
};

export const publicShareRoutes:FastifyPluginAsync<{shares:ShareService;config:AppConfig}>=async(instance,{shares,config})=>{
  const app=instance.withTypeProvider<TypeBoxTypeProvider>(),closing=new AbortController(),downloads=new Set<()=>Promise<void>>();
  app.addHook('onRequest',async(_request,reply)=>{reply.header('referrer-policy','no-referrer').header('x-content-type-options','nosniff');});
  app.addHook('preClose',async()=>{closing.abort();});
  app.addHook('onClose',async()=>{const results=await Promise.allSettled([...downloads].map(close=>close()));if(results.some(result=>result.status==='rejected'))throw new Error('分享下載未正常關閉');});
  const operation=(request:FastifyRequest,reply:FastifyReply)=>{const stop=new AbortController(),abort=()=>{stop.abort();},close=()=>{if(!reply.raw.writableEnded)abort();};request.raw.once('aborted',abort);reply.raw.once('close',close);return{signal:AbortSignal.any([stop.signal,closing.signal]),dispose:()=>{request.raw.off('aborted',abort);reply.raw.off('close',close);}};};
  app.get('/public/shares/:id/info',{schema:{params:ShareParamsSchema,response:{200:PublicShareChallengeSchema,...errors}}},async(request,reply)=>{const current=operation(request,reply);try{return await shares.challenge(request.params.id,secret(request),grant(request,request.params.id),current.signal);}finally{current.dispose();}});
  app.post('/public/shares/:id/access',{bodyLimit:2048,onRequest:async request=>{requireOrigin(request,config);},schema:{params:ShareParamsSchema,body:ShareAccessSchema,response:{200:PublicShareInfoSchema,...errors}}},async(request,reply)=>{
    const current=operation(request,reply);
    try {
      const result=await shares.access(request.params.id,secret(request),request.body.password,request.ip,current.signal);
      const cookiePath=`${fileHubMountPrefix(request.originalUrl)}/public/shares/${request.params.id}`;
      reply.header('set-cookie',`${publicCookieName(request.params.id)}=${result.token}; Path=${cookiePath}; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0,Math.floor((result.expiresAt-Date.now())/1000))}${config.publicOrigin?.startsWith('https:')?'; Secure':''}`);
      return result.info;
    } finally { current.dispose(); }
  });
  app.get('/public/shares/:id/resource',{schema:{params:ShareParamsSchema,querystring:ResourceQuerySchema,response:{200:PublicShareResourceSchema,...errors}}},async(request,reply)=>{const current=operation(request,reply);try{const result=await shares.metadata(request.params.id,grant(request,request.params.id),request.query.path??'',current.signal);if(request.query.version&&request.query.version!==result.version)throw new PublicError('CONFLICT');return result;}finally{current.dispose();}});
  app.get('/public/shares/:id/files',{schema:{params:ShareParamsSchema,querystring:ListQuerySchema,response:{200:PublicShareListingSchema,...errors}}},async(request,reply)=>{const current=operation(request,reply);try{return await shares.listPublic(request.params.id,grant(request,request.params.id),request.query.path??'',request.query,current.signal);}finally{current.dispose();}});
  instance.route<{Params:Static<typeof ShareParamsSchema>;Querystring:Static<typeof ResourceQuerySchema>}>({method:['GET','HEAD'],url:'/public/shares/:id/download',exposeHeadRoute:false,schema:{params:ShareParamsSchema,querystring:ResourceQuerySchema,response:errors},handler:async(request,reply)=>{
    const current=operation(request,reply),opened=await shares.openDownload(request.params.id,grant(request,request.params.id),request.query.path??'',request.query.version,current.signal).catch(error=>{current.dispose();throw error;});let transferred=false;
    try{
      await opened.check();const size=opened.resource.size??0,etag=`W/"${opened.resource.version}"`;let range;
      try{range=byteRange(request.method==='HEAD'||request.headers['if-range']!==undefined?undefined:request.headers.range,size);}catch(error){reply.header('content-range',`bytes */${size}`);throw error;}
      const filename=encodeURIComponent(opened.resource.name).replace(/[!'()*]/g,value=>`%${value.charCodeAt(0).toString(16).toUpperCase()}`);
      reply.header('content-type','application/octet-stream').header('content-disposition',`attachment; filename="download"; filename*=UTF-8''${filename}`).header('accept-ranges','bytes').header('etag',etag).header('content-length',String(range.end-range.start+1));if(range.partial)reply.header('content-range',`bytes ${range.start}-${range.end}/${size}`);
      if(request.method==='HEAD')return reply.code(200).send();
      let pending:Promise<Buffer>|undefined,stopped=false,closed:Promise<void>|undefined;
      const stream=Readable.from((async function*(){let position=range.start;try{while(!stopped&&position<=range.end){pending=(async()=>{await opened.check();const buffer=Buffer.alloc(Math.min(65536,range.end-position+1)),{bytesRead}=await opened.handle.read(buffer,0,buffer.length,position);if(!bytesRead)throw new PublicError('SERVICE_UNAVAILABLE');await opened.check();return buffer.subarray(0,bytesRead);})();const chunk=await pending;pending=undefined;position+=chunk.length;if(stopped)break;yield chunk;}}finally{await opened.close();}})(),{objectMode:false,highWaterMark:65536});
      const close=()=>closed??=(async()=>{stopped=true;stream.destroy();await pending?.catch(()=>undefined);await opened.close();})();downloads.add(close);
      const interrupted=()=>{if(!reply.raw.writableEnded)stream.destroy();};reply.raw.once('close',interrupted);stream.once('close',()=>{current.dispose();reply.raw.off('close',interrupted);void close().catch(()=>{request.log.error({event:'share_close_failed'},'分享資源未正常關閉');}).finally(()=>downloads.delete(close));});transferred=true;return reply.code(range.partial?206:200).send(stream);
    }finally{if(!transferred){current.dispose();await opened.close();}}
  }});
};
