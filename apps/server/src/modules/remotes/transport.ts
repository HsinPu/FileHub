import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import type { RemoteSource } from './config.js';
import { PublicError } from '../../plugins/errors.js';

export interface RemoteResponse {
  readonly status: number;
  readonly value: unknown;
  readonly cookies: readonly string[];
}

export function remoteRequest(source: RemoteSource, endpoint: string, signal: AbortSignal, cookie?: string): Promise<RemoteResponse> {
  const url = new URL(source.prefix + '/public/shares/' + source.shareId + '/' + endpoint, source.origin);
  const access = endpoint === 'access';
  const body = access ? '{}' : undefined;
  const lookup: LookupFunction = (_hostname, options, callback) => {
    const record = { address: source.address, family: isIP(source.address) };
    if (options.all) callback(null, [record]);
    else callback(null, record.address, record.family);
  };
  return new Promise((resolve, reject) => {
    const fail = () => reject(new PublicError('REMOTE_UNAVAILABLE'));
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: access ? 'POST' : 'GET', agent: false, lookup, signal, maxHeaderSize: 16384,
      headers: {
        accept: 'application/json', origin: source.origin,
        ...(access ? { authorization: 'Bearer ' + source.secret, 'content-type': 'application/json', 'content-length': '2' } : {}),
        ...(cookie ? { cookie } : {}),
      },
    }, response => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      if ((response.statusCode ?? 500) >= 300 && (response.statusCode ?? 500) < 400
        || !/^application\/json(?:;|$)/i.test(response.headers['content-type'] ?? '')
        || response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
        response.destroy(); request.destroy(); fail(); return;
      }
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1048576) { response.destroy(); request.destroy(); fail(); }
        else chunks.push(chunk);
      });
      response.on('error', fail);
      response.on('aborted', fail);
      response.on('end', () => {
        try {
          if (!response.complete) { fail(); return; }
          const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve({ status: response.statusCode ?? 500, value, cookies: response.headers['set-cookie'] ?? [] });
        } catch { fail(); }
      });
    });
    request.on('error', fail);
    request.on('close', fail);
    request.end(body);
  });
}
