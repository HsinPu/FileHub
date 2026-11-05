import { PublicError } from '../../plugins/errors.js';

export function byteRange(value: string | undefined, size: number): { start: number; end: number; partial: boolean } {
  if (!value) return { start: 0, end: size - 1, partial: false };
  if ((value.includes('=') && value.split('=')[0]?.toLowerCase() !== 'bytes') || value.includes(',')) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) throw new PublicError('RANGE_NOT_SATISFIABLE');
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if ((first !== undefined && !Number.isSafeInteger(first)) || (last !== undefined && !Number.isSafeInteger(last))) throw new PublicError('RANGE_NOT_SATISFIABLE');
  const start = first ?? Math.max(0, size - (last ?? 0));
  const end = first === undefined ? size - 1 : Math.min(last ?? size - 1, size - 1);
  if (start < 0 || start >= size || end < start || (first === undefined && last === 0)) throw new PublicError('RANGE_NOT_SATISFIABLE');
  return { start, end, partial: true };
}
