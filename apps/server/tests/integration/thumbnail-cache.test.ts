import { mkdir, writeFile, rename, open } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, test } from 'vitest';
import { databaseFixture } from '../helpers/database.js';
import { png } from '../../../../tests/helpers/preview-data.js';
import { IdentityService } from '../../src/modules/identity/service.js';
import { EntryService } from '../../src/modules/entries/service.js';
import { FileService } from '../../src/modules/files/service.js';
import { PreviewService } from '../../src/modules/previews/service.js';
import { renderImage } from '../../src/modules/previews/renderer.js';

async function fixture() {
  const f = await databaseFixture(); f.migrate(); const db = f.open(), identity = new IdentityService(db);
  const admin = await identity.bootstrap('admin', 'Synthetic-thumbnail-password-123!'), member = await identity.createUser('member', 'Synthetic-thumbnail-password-123!');
  const root = join(f.directory, 'files'); await mkdir(root); await writeFile(join(root, 'image.png'), png(600, 400));
  const entries = new EntryService(db), entry = await entries.register('external', '縮圖', root); await entries.grant('member', entry.id, '', true);
  const files = new FileService(entries), previews = new PreviewService(files);
  return { ...f, db, identity, admin, member, root, entries, entry, files, previews };
}
test('縮圖 profile／cache hit、同 path 換 inode 與重新開始皆不取錯衍生內容', async () => {
  const f = await fixture();
  const first = await f.previews.content(f.admin.id, f.entry.id, 'image.png', undefined, undefined, 'thumb');
  expect(await sharp(first.bytes).metadata()).toMatchObject({ format: 'jpeg', width: 256, height: 171 });
  const hit = await f.previews.content(f.admin.id, f.entry.id, 'image.png', undefined, undefined, 'thumb');
  expect(hit.bytes.equals(first.bytes)).toBe(true); expect(f.previews.cache.snapshot()).toMatchObject({ entries: 1, hits: 1, misses: 1 });
  await writeFile(join(f.root, 'replacement.png'), png(400, 600)); await rename(join(f.root, 'replacement.png'), join(f.root, 'image.png'));
  const replacement = await f.previews.content(f.admin.id, f.entry.id, 'image.png', undefined, undefined, 'thumb');
  expect(await sharp(replacement.bytes).metadata()).toMatchObject({ width: 171, height: 256 });
  expect(f.previews.cache.snapshot()).toMatchObject({ entries: 2, hits: 1, misses: 2 });
  const fresh = new PreviewService(f.files); const result = await fresh.content(f.admin.id, f.entry.id, 'image.png', undefined, undefined, 'thumb');
  expect(result.bytes.equals(replacement.bytes)).toBe(true); expect(fresh.cache.snapshot().hits).toBe(0);
});
test('cache 不授予權限：撤回 download／grant 及缺失來源皆拒絕', async () => {
  const f = await fixture(); await f.previews.content(f.member.id, f.entry.id, 'image.png', undefined, undefined, 'thumb');
  await f.entries.grant('member', f.entry.id, '', false);
  await expect(f.previews.content(f.member.id, f.entry.id, 'image.png', undefined, undefined, 'thumb')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await f.entries.revoke('member', f.entry.id, '');
  await expect(f.previews.content(f.member.id, f.entry.id, 'image.png', undefined, undefined, 'thumb')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await rename(join(f.root, 'image.png'), join(f.root, 'gone.png'));
  await expect(f.previews.content(f.admin.id, f.entry.id, 'image.png', undefined, undefined, 'thumb')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(f.files.activeRequests).toBe(0);
});
test('PNG／JPEG／WebP 實際解碼，來源 hash 不符與在途子程序取消不污染 cache', async () => {
  const f = await fixture();
  for (const format of ['jpeg', 'webp'] as const) {
    await writeFile(join(f.root, `image.${format}`), await sharp(png()).toFormat(format).toBuffer());
    const result = await f.previews.content(f.admin.id, f.entry.id, `image.${format}`, undefined, undefined, 'thumb');
    expect(await sharp(result.bytes).metadata()).toMatchObject({ format: 'jpeg', width: 12, height: 8 });
  }
  await writeFile(join(f.root, '16bit.png'), await sharp(png()).toColourspace('rgb16').png().toBuffer());
  await expect(f.previews.content(f.admin.id, f.entry.id, '16bit.png', undefined, undefined, 'thumb')).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  const source = await open(join(f.root, 'image.png'), 'r');
  try {
    await expect(renderImage(source, Number((await source.stat()).size), 'thumb', undefined, '0'.repeat(64))).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    const controller = new AbortController(), running = renderImage(source, Number((await source.stat()).size), 'thumb', controller.signal); controller.abort();
    await expect(running).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' }); expect((await source.stat()).isFile()).toBe(true);
  } finally { await source.close(); }
  expect(f.previews.cache.snapshot().entries).toBe(2);
});
