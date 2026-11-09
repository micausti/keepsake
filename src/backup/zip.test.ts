import { describe, expect, it } from 'vitest';
import { crc32, readZip, writeZip, ZipError } from './zip.ts';

describe('zip', () => {
  it('computes CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips text and binary entries', async () => {
    const binary = new Uint8Array(1000).map((_, i) => (i * 7) % 256);
    const zip = await writeZip([
      { name: 'keepsake.json', data: '{"hello":"wörld"}' },
      { name: 'photos/a.jpg', data: new Blob([binary]) },
    ]);
    const reader = await readZip(zip);
    expect(reader.names).toEqual(['keepsake.json', 'photos/a.jpg']);
    expect(await reader.text('keepsake.json')).toBe('{"hello":"wörld"}');
    expect(new Uint8Array(await (await reader.blob('photos/a.jpg')).arrayBuffer())).toEqual(binary);
  });

  it('writes a standard zip header', async () => {
    const zip = await writeZip([{ name: 'a.txt', data: 'x' }]);
    const head = new Uint8Array(await zip.slice(0, 4).arrayBuffer());
    expect([...head]).toEqual([0x50, 0x4b, 0x03, 0x04]); // "PK\3\4"
  });

  it('rejects non-zip files and missing entries', async () => {
    await expect(readZip(new Blob(['not a zip']))).rejects.toThrow(ZipError);
    const reader = await readZip(await writeZip([]));
    await expect(reader.text('nope')).rejects.toThrow('Missing nope');
  });
});
