import { crc32 } from 'node:zlib';
import { expect } from 'vitest';
// Independent central-directory-first reader for the bounded STORE profile.
// It shares no encoder code; the production-image fixture is also checked by
// Python zipfile outside the container during release validation.
export function readStoredZip(buffer:Buffer):Map<string,Buffer>{
  const end=buffer.length-22;expect(buffer.readUInt32LE(end)).toBe(0x06054b50);const count=buffer.readUInt16LE(end+10),start=buffer.readUInt32LE(end+16);expect(start+buffer.readUInt32LE(end+12)).toBe(end);const result=new Map<string,Buffer>();let at=start;
  for(let i=0;i<count;i++){
    expect(buffer.readUInt32LE(at)).toBe(0x02014b50);expect(buffer.readUInt16LE(at+10)).toBe(0);const flags=buffer.readUInt16LE(at+8);expect(flags&0x800).toBe(0x800);const crc=buffer.readUInt32LE(at+16),size=buffer.readUInt32LE(at+24),nameLength=buffer.readUInt16LE(at+28),extra=buffer.readUInt16LE(at+30),comment=buffer.readUInt16LE(at+32),local=buffer.readUInt32LE(at+42);expect(buffer.readUInt32LE(at+20)).toBe(size);
    const name=buffer.subarray(at+46,at+46+nameLength).toString('utf8');expect(name).not.toMatch(/^(?:\/|[a-z]:)|(?:^|\/)\.\.(?:\/|$)/i);expect(result.has(name)).toBe(false);expect(buffer.readUInt32LE(local)).toBe(0x04034b50);expect(buffer.readUInt16LE(local+6)).toBe(flags);
    const localNameLength=buffer.readUInt16LE(local+26),data=local+30+localNameLength+buffer.readUInt16LE(local+28);expect(buffer.subarray(local+30,local+30+localNameLength).toString('utf8')).toBe(name);const content=Buffer.from(buffer.subarray(data,data+size));expect(crc32(content)).toBe(crc);
    if(flags&8){expect(buffer.readUInt32LE(data+size)).toBe(0x08074b50);expect(buffer.readUInt32LE(data+size+4)).toBe(crc);expect(buffer.readUInt32LE(data+size+12)).toBe(size);}else{expect(size).toBe(0);expect(name.endsWith('/')).toBe(true);expect(buffer.readUInt32LE(at+38)&0x10).toBe(0x10);}
    result.set(name,content);at+=46+nameLength+extra+comment;
  }
  expect(at).toBe(end);expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);return result;
}
