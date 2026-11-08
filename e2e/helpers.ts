import { expect, type Page } from '@playwright/test';

/** Fails the test on any page error, console error or CSP violation. */
export function watchForProblems(page: Page): () => void {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || /Content Security Policy/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  return () => expect(problems, problems.join('\n')).toEqual([]);
}

/**
 * A 4032×3024 JPEG (iPhone size) drawn in the browser, with an EXIF block
 * holding a date taken and a fake GPS marker spliced in after the header.
 */
export async function makePhoto(page: Page, colour = '#2a4d8f'): Promise<Buffer> {
  const base64 = await page.evaluate(async (fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 4032;
    canvas.height = 3024;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 4032, 3024);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(1000, 800, 2000, 1400);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('no blob');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  }, colour);
  const jpeg = Buffer.from(base64, 'base64');
  return Buffer.concat([jpeg.subarray(0, 2), exifSegment('2025:06:14 09:30:05'), jpeg.subarray(2)]);
}

export const GPS_MARKER = 'SECRET-GPS-51.5074N';

/** Little-endian EXIF: IFD0 → Exif IFD (DateTimeOriginal) and GPS IFD (latitude ref). */
function exifSegment(date: string): Buffer {
  const u16 = (n: number) => [n & 255, n >> 8];
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];
  const ascii = [...date].map((c) => c.charCodeAt(0)).concat(0);
  const ifd0 = 8;
  const exif = ifd0 + 2 + 2 * 12 + 4;
  const gps = exif + 2 + 12 + 4;
  const strings = gps + 2 + 12 + 4;
  const tiff = [
    0x49, 0x49, ...u16(42), ...u32(ifd0),
    ...u16(2), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(exif), ...u16(0x8825), ...u16(4), ...u32(1), ...u32(gps), ...u32(0),
    ...u16(1), ...u16(0x9003), ...u16(2), ...u32(ascii.length), ...u32(strings), ...u32(0),
    ...u16(1), ...u16(1), ...u16(2), ...u32(2), 0x4e, 0, 0, 0, ...u32(0),
    ...ascii, ...Buffer.from(GPS_MARKER),
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const length = payload.length + 2;
  return Buffer.from([0xff, 0xe1, length >> 8, length & 255, ...payload]);
}

/** Reads every photo stored in the app's database. */
export async function storedPhotos(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('keepsake');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<{ blob: Blob; thumb: Blob; takenAt: string }[]>((resolve) => {
      const all = db.transaction('photos').objectStore('photos').getAll();
      all.onsuccess = () => resolve(all.result);
    });
    db.close();
    return Promise.all(
      rows.map(async (row) => {
        const full = await createImageBitmap(row.blob);
        const thumb = await createImageBitmap(row.thumb);
        const text = new TextDecoder('latin1').decode(await row.blob.arrayBuffer());
        return {
          size: [full.width, full.height],
          thumbSize: [thumb.width, thumb.height],
          takenAt: row.takenAt,
          hasExif: text.includes('Exif'),
          text,
        };
      }),
    );
  });
}
