import { describe, expect, it, vi } from 'vitest';
import { CHUNK_SIZE, crc32, crc32OfBlob, readZip, writeZip, ZipError } from './zip.ts';

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

describe('large photos', () => {
  const big = new Uint8Array(CHUNK_SIZE * 2 + 12345).map((_, i) => (i * 31 + 7) % 256);

  it('checksums a Blob in chunks with the same result', async () => {
    expect(await crc32OfBlob(new Blob([big]))).toBe(crc32(big));
  });

  it('never reads a whole photo into memory, and still writes it correctly', async () => {
    const photo = new Blob([big], { type: 'image/jpeg' });
    const whole = vi.spyOn(photo, 'arrayBuffer');
    const slice = vi.spyOn(photo, 'slice');
    const progress: [number, number][] = [];

    const zip = await writeZip(
      [
        { name: 'keepsake.json', data: '{}' },
        { name: 'photos/big.jpg', data: photo },
      ],
      (done, total) => progress.push([done, total]),
    );

    expect(whole).not.toHaveBeenCalled();
    expect(slice).toHaveBeenCalledTimes(3);
    for (const [start, end] of slice.mock.calls) expect((end ?? 0) - (start ?? 0)).toBeLessThanOrEqual(CHUNK_SIZE);
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);

    const back = await (await readZip(zip)).blob('photos/big.jpg', 'image/jpeg');
    expect(back.type).toBe('image/jpeg');
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(big);
  });
});
