import { Readable } from 'node:stream';
import type { FastifyPluginAsync } from 'fastify';
import type { Static } from 'typebox';
import { OperationParamsSchema,ApiErrorResponseSchema } from '@filehub/contracts';
import type { IdentityService } from '../identity/service.js';
import { sessionCookie } from '../identity/routes.js';
import { byteRange } from '../files/range.js';
import { PublicError } from '../../plugins/errors.js';
import type { ArtifactStore } from './artifacts.js';
export const artifactRoutes:FastifyPluginAsync<{artifacts:ArtifactStore;identity:IdentityService}>=async(app,{artifacts,identity})=>{
  const closing=new AbortController(),downloads=new Set<()=>Promise<void>>();app.addHook('preClose',async()=>{closing.abort();});app.addHook('onClose',async()=>{const results=await Promise.allSettled([...downloads].map(close=>close()));if(results.some(result=>result.status==='rejected'))throw new Error('封存下載未正常關閉');});
  app.addHook('onRequest',async request=>{identity.authenticate(sessionCookie(request));});
  const errors={400:ApiErrorResponseSchema,401:ApiErrorResponseSchema,403:ApiErrorResponseSchema,404:ApiErrorResponseSchema,409:ApiErrorResponseSchema,416:ApiErrorResponseSchema,503:ApiErrorResponseSchema};
  app.route<{Params:Static<typeof OperationParamsSchema>}>({method:['GET','HEAD'],url:'/api/operations/:id/artifact',exposeHeadRoute:false,schema:{params:OperationParamsSchema,response:errors},handler:async(request,reply)=>{
    const stop=new AbortController(),abort=()=>{stop.abort();},onClose=()=>{if(!reply.raw.writableEnded)abort();};request.raw.once('aborted',abort);reply.raw.once('close',onClose);const signal=AbortSignal.any([stop.signal,closing.signal]),dispose=()=>{request.raw.off('aborted',abort);reply.raw.off('close',onClose);};
    const session=()=>identity.authenticate(sessionCookie(request)),user=session().user.id;
    const opened=await artifacts.openDownload(user,request.params.id,()=>{session();},signal,request.method!=='HEAD').catch(error=>{dispose();throw error;});let transferred=false;
    try{
      opened.check(true);const etag=`"${opened.sha256}"`;let range;
      try{range=byteRange(request.method==='HEAD'||request.headers['if-range']!==undefined&&request.headers['if-range']!==etag?undefined:request.headers.range,opened.bytes);}catch(error){reply.header('content-range',`bytes */${opened.bytes}`);throw error;}
      reply.header('content-type','application/zip').header('content-disposition',`attachment; filename="FileHub-${request.params.id.slice(0,8)}.zip"`).header('x-content-type-options','nosniff').header('accept-ranges','bytes').header('etag',etag).header('content-length',String(range.end-range.start+1));if(range.partial)reply.header('content-range',`bytes ${range.start}-${range.end}/${opened.bytes}`);
      if(request.method==='HEAD')return reply.code(200).send();
      const stream=Readable.from((async function*(){const buffer=Buffer.alloc(65536);let position=range.start;try{while(position<=range.end){opened.check();const {bytesRead}=await opened.handle.read(buffer,0,Math.min(buffer.length,range.end-position+1),position);if(!bytesRead)throw new PublicError('SERVICE_UNAVAILABLE');opened.check();position+=bytesRead;yield Buffer.from(buffer.subarray(0,bytesRead));}}finally{await opened.close();}})(),{objectMode:false,highWaterMark:65536});
      const close=async()=>{stream.destroy();await opened.close();};downloads.add(close);const interrupted=()=>{if(!reply.raw.writableEnded)stream.destroy();};reply.raw.once('close',interrupted);stream.once('close',()=>{dispose();reply.raw.off('close',interrupted);void opened.close().catch(()=>{request.log.error({event:'artifact_close_failed'},'封存資源未正常關閉');}).finally(()=>downloads.delete(close));});transferred=true;return reply.code(range.partial?206:200).send(stream);
    }finally{if(!transferred){dispose();await opened.close();}}
  }});
};
