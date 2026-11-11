import { describe, expect, it } from 'vitest';
import { parseExifDate, readExifDateTaken, readExifOrientation } from './exif.ts';

/** Builds a minimal JPEG with an EXIF block containing the given dates. */
function jpegWithExif({
  original,
  modified,
  orientation,
  little = true,
}: {
  original?: string;
  modified?: string;
  orientation?: number;
  little?: boolean;
}) {
  const tiff: number[] = [];
  const u16 = (n: number) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n: number) =>
    little ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);

  // Layout: header(8) | IFD0 | Exif IFD | strings
  const ifd0Entries = (modified ? 1 : 0) + (orientation ? 1 : 0) + 1;
  const ifd0Size = 2 + ifd0Entries * 12 + 4;
  const exifIfdOffset = 8 + ifd0Size;
  const exifIfdSize = 2 + (original ? 1 : 0) * 12 + 4;
  let dataOffset = exifIfdOffset + exifIfdSize;
  const data: number[] = [];
  const place = (bytes: number[]) => {
    const at = dataOffset;
    data.push(...bytes);
    dataOffset += bytes.length;
    return at;
  };

  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  tiff.push(...u16(ifd0Entries));
  if (orientation) tiff.push(...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0);
  if (modified) {
    const s = ascii(modified);
    tiff.push(...u16(0x0132), ...u16(2), ...u32(s.length), ...u32(place(s)));
  }
  tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfdOffset), ...u32(0));
  tiff.push(...u16(original ? 1 : 0));
  if (original) {
    const s = ascii(original);
    tiff.push(...u16(0x9003), ...u16(2), ...u32(s.length), ...u32(place(s)));
  }
  tiff.push(...u32(0), ...data);

  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const length = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...app1, 0xff, 0xda, 0, 2]).buffer;
}

describe('readExifDateTaken', () => {
  it('reads DateTimeOriginal (little-endian, as iPhones write)', () => {
    const date = readExifDateTaken(jpegWithExif({ original: '2025:06:14 09:30:05', modified: '2026:01:01 00:00:00' }));
    expect(date).toEqual(new Date(2025, 5, 14, 9, 30, 5));
  });

  it('reads big-endian files', () => {
    const date = readExifDateTaken(jpegWithExif({ original: '2024:12:25 18:00:00', little: false }));
    expect(date).toEqual(new Date(2024, 11, 25, 18, 0, 0));
  });

  it('falls back to DateTime when there is no original date', () => {
    expect(readExifDateTaken(jpegWithExif({ modified: '2023:03:03 03:03:03' }))).toEqual(new Date(2023, 2, 3, 3, 3, 3));
  });

  it('returns undefined for non-JPEGs, missing EXIF and junk', () => {
    expect(readExifDateTaken(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeUndefined();
    expect(readExifDateTaken(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeUndefined();
    expect(readExifDateTaken(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3]).buffer)).toBeUndefined();
  });
});

describe('parseExifDate', () => {
  it('rejects blank or invalid dates', () => {
    expect(parseExifDate('0000:00:00 00:00:00')).toBeUndefined();
    expect(parseExifDate('    :  :     :  :  ')).toBeUndefined();
  });
});

describe('readExifOrientation', () => {
  it('reads the orientation an iPhone writes for portrait photos', () => {
    expect(readExifOrientation(jpegWithExif({ original: '2025:06:14 09:30:05', orientation: 6 }))).toBe(6);
    expect(readExifOrientation(jpegWithExif({ orientation: 8, little: false }))).toBe(8);
  });

  it('defaults to upright when missing or invalid', () => {
    expect(readExifOrientation(jpegWithExif({ original: '2025:06:14 09:30:05' }))).toBe(1);
    expect(readExifOrientation(jpegWithExif({ orientation: 42 }))).toBe(1);
    expect(readExifOrientation(new Uint8Array([0x89, 0x50]).buffer)).toBe(1);
  });

  it('still reads the date alongside the orientation', () => {
    expect(readExifDateTaken(jpegWithExif({ original: '2025:06:14 09:30:05', orientation: 6 }))).toEqual(
      new Date(2025, 5, 14, 9, 30, 5),
    );
  });
});
