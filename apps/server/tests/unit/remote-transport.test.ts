import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { expect, onTestFinished, test } from 'vitest';
import { parseRemoteSources } from '../../src/modules/remotes/config.js';
import { remoteRequest } from '../../src/modules/remotes/transport.js';

test('固定 IP 可連無 DNS 主機名稱，拒絕轉址、過大／非 JSON 與中斷回應', async () => {
  let mode = 'json', redirects = 0;
  const server = createServer((request, response) => {
    if (request.url === '/redirected') { redirects++; response.end('unexpected'); return; }
    response.setHeader('content-type', 'application/json');
    if (mode === 'redirect') { response.writeHead(302, { location: '/redirected' }); response.end('{}'); }
    else if (mode === 'oversize') response.end(Buffer.alloc(1048577, 0x20));
    else if (mode === 'html') { response.setHeader('content-type', 'text/html'); response.end('<html>private canary</html>'); }
    else if (mode === 'invalid') response.end('{');
    else if (mode === 'compressed') { response.setHeader('content-encoding', 'gzip'); response.end('{}'); }
    else if (mode === 'wait') { response.flushHeaders(); }
    else response.end(JSON.stringify({ host: request.headers.host, url: request.url }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test address');
  const origin = 'http://filehub-never-resolves.invalid:' + address.port;
  const [source] = parseRemoteSources({ version: 1, sources: [{
    id: randomUUID(), label: 'C', url: origin + '/?share=' + randomUUID() + '#' + 'A'.repeat(43),
    address: '127.0.0.1', allowHttp: true, users: [],
  }] });
  if (!source) throw new Error('Missing source');
  const response = await remoteRequest(source, 'info', AbortSignal.timeout(1000));
  expect(response.status).toBe(200);
  expect(response.value).toMatchObject({ host: 'filehub-never-resolves.invalid:' + address.port });
  expect(JSON.stringify(response.value)).not.toContain(source.secret);
  for (mode of ['redirect', 'oversize', 'html', 'invalid', 'compressed', 'wait']) {
    await expect(remoteRequest(source, 'info', AbortSignal.timeout(150))).rejects.toMatchObject({ code: 'REMOTE_UNAVAILABLE' });
  }
  expect(redirects).toBe(0);
});
