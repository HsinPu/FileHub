import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { isIP } from 'node:net';
import { Type, type Static } from 'typebox';
import { Check } from 'typebox/value';
import { FILEHUB_MOUNT_PATH } from '@filehub/contracts';
import { ConfigError } from '../../config/index.js';
import { hasControlCharacters } from '../../storage/scoped.js';

const SourceSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  label: Type.String({ minLength: 1, maxLength: 80 }),
  url: Type.String({ maxLength: 2048 }),
  address: Type.String({ maxLength: 64 }),
  allowHttp: Type.Optional(Type.Boolean()),
  users: Type.Array(Type.String({ pattern: '^[a-z0-9][a-z0-9._-]{2,31}$' }), { maxItems: 100, uniqueItems: true }),
}, { additionalProperties: false });
const SourcesSchema = Type.Object({
  version: Type.Literal(1),
  sources: Type.Array(SourceSchema, { maxItems: 16 }),
}, { additionalProperties: false });

export interface RemoteSource {
  readonly id: string;
  readonly label: string;
  readonly origin: string;
  readonly prefix: string;
  readonly address: string;
  readonly shareId: string;
  readonly secret: string;
  readonly users: readonly string[];
}

function invalid(): never {
  throw new ConfigError('FILEHUB_REMOTE_SOURCES_FILE', '須為合法的私有遠端來源設定。請檢查格式、固定 IP、授權連結及檔案權限。');
}

function source(value: Static<typeof SourceSchema>): RemoteSource {
  const url = new URL(value.url);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addressFamily = isIP(value.address);
  const shareId = url.searchParams.get('share');
  const secret = url.hash.slice(1);
  if (!addressFamily || ['0.0.0.0', '::'].includes(value.address)
    || (isIP(hostname) && hostname !== value.address)
    || url.username || url.password
    || !['/', FILEHUB_MOUNT_PATH + '/'].includes(url.pathname)
    || [...url.searchParams].length !== 1
    || !shareId || !Check(Type.String({ format: 'uuid' }), shareId)
    || !/^[A-Za-z0-9_-]{43}$/.test(secret)
    || !value.label.trim() || hasControlCharacters(value.label)
    || !(url.protocol === 'https:' || url.protocol === 'http:' && value.allowHttp === true)) invalid();
  return Object.freeze({
    id: value.id, label: value.label.trim(), origin: url.origin,
    prefix: url.pathname === '/' ? '' : FILEHUB_MOUNT_PATH,
    address: value.address, shareId, secret, users: Object.freeze([...value.users]),
  });
}

export function parseRemoteSources(value: unknown): readonly RemoteSource[] {
  try {
    if (!Check(SourcesSchema, value)) invalid();
    const result = value.sources.map(source);
    if (new Set(result.map(item => item.id)).size !== result.length) invalid();
    return Object.freeze(result);
  } catch { return invalid(); }
}

export function loadRemoteSources(filename?: string): readonly RemoteSource[] {
  if (filename === undefined) return [];
  let fd: number | undefined;
  try {
    if (!lstatSync(filename).isFile()) invalid();
    fd = openSync(filename, constants.O_RDONLY | (process.platform === 'linux' ? constants.O_NOFOLLOW : 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 65536 || stat.size === 0
      || process.platform === 'linux' && (stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0)) invalid();
    const bytes = Buffer.alloc(65537);
    const size = readSync(fd, bytes, 0, bytes.length, 0);
    if (size > 65536) invalid();
    return parseRemoteSources(JSON.parse(bytes.subarray(0, size).toString('utf8')));
  } catch { return invalid(); }
  finally { if (fd !== undefined) closeSync(fd); }
}
