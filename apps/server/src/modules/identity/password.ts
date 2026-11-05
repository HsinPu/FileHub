import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { PublicError } from '../../plugins/errors.js';

const pattern = /^scrypt:131072:8:1:([a-f0-9]{32}):([a-f0-9]{64})$/;
const dummy = `scrypt:131072:8:1:${'00'.repeat(16)}:${'00'.repeat(32)}`;
let running = false;

async function derive(password: string, salt: string): Promise<Buffer> {
  if (running) throw new PublicError('RATE_LIMITED');
  running = true;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, Buffer.from(salt, 'hex'), 32, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
    });
  } finally { running = false; }
}

export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')): Promise<string> {
  if ([...password].length < 15 || [...password].length > 128 || Buffer.byteLength(password) > 512 || password.includes('\0')) throw new PublicError('BAD_REQUEST');
  if (!/^[a-f0-9]{32}$/.test(salt)) throw new PublicError('BAD_REQUEST');
  return `scrypt:131072:8:1:${salt}:${(await derive(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password: string, encoded?: string): Promise<boolean> {
  const parsed = pattern.exec(encoded ?? dummy);
  const salt = parsed?.[1] ?? '00'.repeat(16);
  const expected = Buffer.from(parsed?.[2] ?? '00'.repeat(32), 'hex');
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected) && encoded !== undefined && parsed !== null;
}
