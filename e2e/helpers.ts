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
 * A 4032×3024 JPEG (iPhone size) drawn in the browser: red left half, blue
 * right half, with an EXIF block (date taken, fake GPS marker and an optional
 * orientation) spliced in after the header. Orientation 6 is how an iPhone
 * stores a portrait photo: sideways pixels plus "turn 90° clockwise".
 */
export async function makePhoto(page: Page, { orientation }: { orientation?: number } = {}): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4032;
    canvas.height = 3024;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 2016, 3024);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(2016, 0, 2016, 3024);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('no blob');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  });
  const jpeg = Buffer.from(base64, 'base64');
  return Buffer.concat([jpeg.subarray(0, 2), exifSegment('2025:06:14 09:30:05', orientation), jpeg.subarray(2)]);
}

export const GPS_MARKER = 'SECRET-GPS-51.5074N';

/** Little-endian EXIF: IFD0 (orientation) → Exif IFD (DateTimeOriginal) and GPS IFD (latitude ref). */
function exifSegment(date: string, orientation?: number): Buffer {
  const u16 = (n: number) => [n & 255, n >> 8];
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];
  const ascii = [...date].map((c) => c.charCodeAt(0)).concat(0);
  const ifd0 = 8;
  const ifd0Count = orientation ? 3 : 2;
  const exif = ifd0 + 2 + ifd0Count * 12 + 4;
  const gps = exif + 2 + 12 + 4;
  const strings = gps + 2 + 12 + 4;
  const tiff = [
    0x49, 0x49, ...u16(42), ...u32(ifd0),
    ...u16(ifd0Count),
    ...(orientation ? [...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0] : []),
    ...u16(0x8769), ...u16(4), ...u32(1), ...u32(exif), ...u16(0x8825), ...u16(4), ...u32(1), ...u32(gps), ...u32(0),
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
        // Which colour is at the top, bottom, left and right edges ("r" or "b").
        const canvas = document.createElement('canvas');
        canvas.width = full.width;
        canvas.height = full.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        ctx.drawImage(full, 0, 0);
        const at = (fx: number, fy: number) => {
          const [r, , b] = ctx.getImageData(Math.floor(full.width * fx), Math.floor(full.height * fy), 1, 1).data;
          return (r ?? 0) > (b ?? 0) ? 'r' : 'b';
        };
        return {
          colours: { top: at(0.5, 0.05), bottom: at(0.5, 0.95), left: at(0.05, 0.5), right: at(0.95, 0.5) },
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
