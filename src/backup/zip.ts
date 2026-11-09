/**
 * Minimal ZIP writer/reader for backups. Entries are stored, not compressed:
 * the bulk is JPEGs, which don't compress further. Standard ZIP, so a backup
 * can also be opened on a computer. No dependency needed.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Blob | string;
  date?: Date;
}

function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const UTF8_FLAG = 0x0800;

/** Builds a stored (uncompressed) ZIP. Reads one entry at a time to limit memory use. */
export async function writeZip(entries: ZipEntry[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const bytes: Uint8Array<ArrayBuffer> =
      typeof entry.data === 'string' ? encoder.encode(entry.data) : new Uint8Array(await entry.data.arrayBuffer());
    const crc = crc32(bytes);
    const { time, day } = dosDateTime(entry.date ?? new Date());

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, UTF8_FLAG, true);
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name, bytes);

    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 20, true);
    header.setUint16(8, UTF8_FLAG, true);
    header.setUint16(10, 0, true);
    header.setUint16(12, time, true);
    header.setUint16(14, day, true);
    header.setUint32(16, crc, true);
    header.setUint32(20, bytes.length, true);
    header.setUint32(24, bytes.length, true);
    header.setUint16(28, name.length, true);
    header.setUint32(42, offset, true);
    const record = new Uint8Array(46 + name.length);
    record.set(new Uint8Array(header.buffer), 0);
    record.set(name, 46);
    central.push(record);

    offset += 30 + name.length + bytes.length;
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

export class ZipError extends Error {}

export interface ZipReader {
  names: string[];
  blob(name: string): Promise<Blob>;
  text(name: string): Promise<string>;
}

const readView = async (blob: Blob, start: number, length: number) =>
  new DataView(await blob.slice(start, start + length).arrayBuffer());

/** Opens a ZIP written by writeZip (stored entries only), reading lazily with slices. */
export async function readZip(file: Blob): Promise<ZipReader> {
  const tailLength = Math.min(file.size, 22 + 0xffff);
  const tail = await readView(file, file.size - tailLength, tailLength);
  let eocd = -1;
  for (let i = tailLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new ZipError('Not a zip file');
  const count = tail.getUint16(eocd + 10, true);
  const centralSize = tail.getUint32(eocd + 12, true);
  const centralOffset = tail.getUint32(eocd + 16, true);
  const central = await readView(file, centralOffset, centralSize);
  const decoder = new TextDecoder();

  const entries = new Map<string, { offset: number; size: number; method: number; crc: number }>();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (central.getUint32(p, true) !== 0x02014b50) throw new ZipError('Damaged zip file');
    const method = central.getUint16(p + 10, true);
    const crc = central.getUint32(p + 16, true);
    const size = central.getUint32(p + 20, true);
    const nameLength = central.getUint16(p + 28, true);
    const extraLength = central.getUint16(p + 30, true);
    const commentLength = central.getUint16(p + 32, true);
    const offset = central.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(central.buffer, central.byteOffset + p + 46, nameLength));
    entries.set(name, { offset, size, method, crc });
    p += 46 + nameLength + extraLength + commentLength;
  }

  const blob = async (name: string): Promise<Blob> => {
    const entry = entries.get(name);
    if (!entry) throw new ZipError(`Missing ${name}`);
    if (entry.method !== 0) throw new ZipError('This backup was re-compressed by another app');
    const local = await readView(file, entry.offset, 30);
    if (local.getUint32(0, true) !== 0x04034b50) throw new ZipError('Damaged zip file');
    const start = entry.offset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    return file.slice(start, start + entry.size);
  };

  return {
    names: [...entries.keys()],
    blob,
    text: async (name) => {
      const data = await blob(name);
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (crc32(bytes) !== entries.get(name)?.crc) throw new ZipError(`${name} is damaged`);
      return decoder.decode(bytes);
    },
  };
}
