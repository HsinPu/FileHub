import { randomUUID } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { createTemporaryDirectory } from '../../../../tests/helpers/temporary-directory.js';
import { parseConfig, parseWorkerConfig } from '../../src/config/index.js';
import { loadRemoteSources, parseRemoteSources } from '../../src/modules/remotes/config.js';

const sample = () => ({
  id: randomUUID(), label: 'C 的檔案',
  url: 'https://files.example.test/FileHub/?share=' + randomUUID() + '#' + 'A'.repeat(43),
  address: '192.168.1.20', users: ['reader'],
});

test('來源只接受受控目錄分享、固定 IP 與明確 HTTP opt-in，錯誤不含秘密', () => {
  const value = sample();
  expect(parseRemoteSources({ version: 1, sources: [value] })[0]).toMatchObject({
    label: value.label, origin: 'https://files.example.test', prefix: '/FileHub', address: value.address, users: ['reader'],
  });
  for (const change of [
    { address: 'c.example.test' }, { address: '0.0.0.0' }, { users: ['Reader'] },
    { url: value.url.replace('https:', 'http:') }, { url: value.url.replace('/FileHub/', '/arbitrary/') },
    { url: value.url.replace('https://', 'https://user:password@') }, { url: value.url.replace('#', '&other=1#') },
    { url: value.url.replace('files.example.test', '192.168.1.21') }, { secret: 'unexpected' },
  ]) {
    expect(() => parseRemoteSources({ version: 1, sources: [{ ...value, ...change }] })).toThrowError('私有遠端來源設定');
  }
  expect(parseRemoteSources({ version: 1, sources: [{ ...value, url: value.url.replace('https:', 'http:'), allowHttp: true }] })).toHaveLength(1);
  expect(() => parseRemoteSources({ version: 1, sources: [value, value] })).toThrowError();
  expect(() => parseRemoteSources({ version: 2, sources: [] })).toThrowError();
  expect(() => parseRemoteSources({ version: 1, sources: Array.from({ length: 17 }, sample) })).toThrowError();
});

test('同一 IPv6 位址的壓縮與展開寫法可用，異址與未指定的位址仍拒絕', () => {
  const value = sample();
  const url = value.url.replace('files.example.test', '[2001:db8::1]');
  const parse = (address: string, origin = url) => parseRemoteSources({ version: 1, sources: [{ ...value, url: origin, address }] });
  expect(parse('2001:0DB8:0000:0000:0000:0000:0000:0001')[0]?.origin).toBe('https://[2001:db8::1]');
  expect(() => parse('2001:db8::2')).toThrowError('私有遠端來源設定');
  expect(() => parse('0:0:0:0:0:0:0:0', value.url)).toThrowError('私有遠端來源設定');
  expect(parse('fe80::1%eth0', value.url)[0]?.address).toBe('fe80::1%eth0');
});

test('啟動載入私有設定，限制大小、檔案型別與 Linux 權限；worker 不解析 API 路徑', async () => {
  const temporary = await createTemporaryDirectory('filehub-remote-config-');
  onTestFinished(() => temporary.dispose());
  const filename = join(temporary.directory, 'remote-sources.json');
  await writeFile(filename, JSON.stringify({ version: 1, sources: [sample()] }), { mode: 0o600 });
  expect(loadRemoteSources(filename)).toHaveLength(1);
  expect(loadRemoteSources()).toEqual([]);
  expect(parseConfig({ FILEHUB_REMOTE_SOURCES_FILE: filename }).remoteSourcesFile).toBe(filename);
  expect(() => parseConfig({ FILEHUB_REMOTE_SOURCES_FILE: 'relative.json' })).toThrowError();
  expect(() => parseWorkerConfig({ FILEHUB_REMOTE_SOURCES_FILE: 'relative.json' })).not.toThrowError();
  if (process.platform === 'linux') {
    await chmod(filename, 0o644);
    expect(() => loadRemoteSources(filename)).toThrowError('檔案權限');
    await chmod(filename, 0o600);
  }
  await writeFile(filename, ' '.repeat(65537));
  expect(() => loadRemoteSources(filename)).toThrowError();
  await mkdir(join(temporary.directory, 'directory'));
  expect(() => loadRemoteSources(join(temporary.directory, 'directory'))).toThrowError();
});
