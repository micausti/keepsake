/**
 * Reads the "date taken" from a JPEG's EXIF data, so photos picked from the
 * library keep their real date on the timeline. Only this one value is read;
 * the saved copy is re-encoded without any EXIF (so no GPS location).
 */

const TAG_ORIENTATION = 0x0112;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TYPE_ASCII = 2;

export interface ExifInfo {
  dateTaken?: Date;
  /** EXIF orientation 1–8; 1 means the pixels are already upright. */
  orientation: number;
}

export function readExifDateTaken(buffer: ArrayBuffer): Date | undefined {
  return readExif(buffer).dateTaken;
}

/** EXIF orientation 1–8 (1 when missing or unreadable). */
export function readExifOrientation(buffer: ArrayBuffer): number {
  return readExif(buffer).orientation;
}

export function readExif(buffer: ArrayBuffer): ExifInfo {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return { orientation: 1 }; // not a JPEG
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return { orientation: 1 }; // start of image data
      const length = view.getUint16(offset + 2);
      if (marker === 0xffe1 && isExifHeader(view, offset + 4)) {
        return readTiff(view, offset + 10, length - 8);
      }
      offset += 2 + length;
    }
  } catch {
    // Malformed metadata: fall back to the file date and no rotation.
  }
  return { orientation: 1 };
}

function isExifHeader(view: DataView, at: number): boolean {
  return view.getUint32(at) === 0x45786966 && view.getUint16(at + 4) === 0; // "Exif\0\0"
}

function readTiff(view: DataView, start: number, length: number): ExifInfo {
  const order = view.getUint16(start);
  if (order !== 0x4949 && order !== 0x4d4d) return { orientation: 1 };
  const little = order === 0x4949;
  const end = start + length;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);

  /** Byte offset of the 12-byte IFD entry for `tag`, if present. */
  const findEntry = (ifdOffset: number, tag: number): number | undefined => {
    const ifd = start + ifdOffset;
    if (ifd + 2 > end) return undefined;
    const entries = u16(ifd);
    for (let i = 0; i < entries; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > end) return undefined;
      if (u16(entry) === tag) return entry;
    }
    return undefined;
  };

  const readDate = (ifdOffset: number, tag: number): Date | undefined => {
    const entry = findEntry(ifdOffset, tag);
    if (entry === undefined || u16(entry + 2) !== TYPE_ASCII) return undefined;
    const count = u32(entry + 4);
    // Values of 4 bytes or fewer are stored inline; longer ones via an offset.
    const at = count <= 4 ? entry + 8 : start + u32(entry + 8);
    if (at + count > end) return undefined;
    let text = '';
    for (let i = 0; i < count; i++) {
      const c = view.getUint8(at + i);
      if (c === 0) break;
      text += String.fromCharCode(c);
    }
    return parseExifDate(text);
  };

  const ifd0 = u32(start + 4);
  const exifEntry = findEntry(ifd0, TAG_EXIF_IFD);
  const original = exifEntry !== undefined ? readDate(u32(exifEntry + 8), TAG_DATETIME_ORIGINAL) : undefined;
  const orientationEntry = findEntry(ifd0, TAG_ORIENTATION);
  const rawOrientation = orientationEntry !== undefined ? u16(orientationEntry + 8) : 1;
  return {
    dateTaken: original ?? readDate(ifd0, TAG_DATETIME),
    orientation: rawOrientation >= 1 && rawOrientation <= 8 ? rawOrientation : 1,
  };
}

/** "2026:11:07 14:03:22" (camera local time) → Date. */
export function parseExifDate(text: string): Date | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text.trim());
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m.map(Number) as [number, number, number, number, number, number, number];
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return new Date(y, mo - 1, d, h, mi, s);
}
