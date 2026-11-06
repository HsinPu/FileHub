import { stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyPluginAsync } from 'fastify';
import { FILEHUB_MOUNT_PATH } from '@filehub/contracts';

export const DEFAULT_WEB_ROOT = fileURLToPath(new URL('../../../web/build/', import.meta.url));

export const webRoutes: FastifyPluginAsync<{ webRoot: string }> = async (app, { webRoot }) => {
  if (!(await stat(join(webRoot, 'index.html'))).isFile() || !(await stat(join(webRoot, 'assets'))).isDirectory()) throw new Error('FileHub web build 不完整。');
  await app.register(fastifyStatic, {
    root: join(webRoot, 'assets'), prefix: '/assets/', wildcard: false, index: false, redirect: false,
    dotfiles: 'deny', immutable: true, maxAge: '1y',
    setHeaders: (reply, filename) => {
      reply.header('cache-control', extname(filename) === '.html' ? 'no-store' : 'public, max-age=31536000, immutable');
      reply.header('x-content-type-options', 'nosniff');
    },
  });
  app.get(FILEHUB_MOUNT_PATH, (request, reply) => {
    const query = request.originalUrl.indexOf('?');
    const suffix = query < 0 ? '' : request.originalUrl.slice(query);
    return reply.redirect(`${FILEHUB_MOUNT_PATH}/${suffix}`, 308);
  });
  // 工作空間用首頁 query 導覽；未知 API／檔案維持 JSON 404，不加全域 SPA catch-all。
  for (const url of ['/', '/index.html']) {
    app.get(url, (_request, reply) => {
      reply.header('cache-control', 'no-store').header('x-content-type-options', 'nosniff').header('referrer-policy', 'no-referrer');
      return reply.sendFile('index.html', webRoot, { cacheControl: false });
    });
  }
};
