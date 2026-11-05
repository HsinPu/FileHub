import { deflateSync, crc32 } from 'node:zlib';

export function png(width = 12, height = 8, headerOnly = false): Buffer {
  const chunk = (name: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(name), data]), prefix = Buffer.alloc(4), crc = Buffer.alloc(4);
    prefix.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([prefix, body, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(headerOnly ? 4 : (width * 3 + 1) * height, 0);
  if (!headerOnly) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const offset = y * (width * 3 + 1) + 1 + x * 3; pixels[offset] = 40; pixels[offset + 1] = 100; pixels[offset + 2] = 220; }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
export function pdf(): Buffer {
  const stream = '0.2 0.4 0.8 rg 30 30 100 100 re f\n';
  const objects = ['<< /Type /Catalog /Pages 2 0 R /OpenAction 5 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << >> /Contents 4 0 R >>', `<< /Length ${stream.length} >>\nstream\n${stream}endstream`, '<< /S /JavaScript /JS (app.alert("FILEHUB_SCRIPT_CANARY");) >>'];
  let output = '%PDF-1.7\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}
