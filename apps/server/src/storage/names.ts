import { relativePath, hasControlCharacters } from './scoped.js';
import { PublicError } from '../plugins/errors.js';

// 新名稱採可攜子集；既有 Linux 檔名仍可依 P1 的讀取契約顯示。
export function fileName(value: string): string {
  relativePath(value);
  if (!value || value.includes('/') || value !== value.trim() || /[. ]$/.test(value) || /[<>:"|?*]/.test(value)
    || hasControlCharacters(value) || value.toLowerCase() === '.filehub'
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) throw new PublicError('BAD_REQUEST');
  return value;
}
export const overlapsPath = (a: string, b: string) => a === '' || b === '' || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
