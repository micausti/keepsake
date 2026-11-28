/**
 * One-off pass that re-saves photos taken before the 1600px change, to free
 * space on the phone and make backups smaller. One photo at a time, so it
 * never holds more than one picture in memory, and it can be stopped and
 * picked up again: photos already at the new size are skipped.
 */
import { FULL_EDGE, shrinkJpeg } from '../photos/process.ts';
import { db, type KeepsakeDB } from './db.ts';

export type Shrinker = (blob: Blob) => Promise<{ blob: Blob; width: number; height: number }>;

export interface ShrinkCandidates {
  count: number;
  bytes: number;
}

const tooBig = (p: { width: number; height: number }) => Math.max(p.width, p.height) > FULL_EDGE;

/** Photos larger than the current size, and how much space they take. */
export async function shrinkCandidates(database: KeepsakeDB = db): Promise<ShrinkCandidates> {
  let count = 0;
  let bytes = 0;
  await database.photos.each((p) => {
    if (!tooBig(p)) return;
    count += 1;
    bytes += p.blob.size;
  });
  return { count, bytes };
}

export interface ShrinkResult {
  shrunk: number;
  savedBytes: number;
}

export async function shrinkPhotos(
  onProgress?: (done: number, total: number) => void,
  options: { database?: KeepsakeDB; shrink?: Shrinker; shouldStop?: () => boolean } = {},
): Promise<ShrinkResult> {
  const { database = db, shrink = (b: Blob) => shrinkJpeg(b), shouldStop = () => false } = options;
  const ids: string[] = [];
  await database.photos.each((p) => {
    if (tooBig(p)) ids.push(p.id);
  });
  let shrunk = 0;
  let savedBytes = 0;
  onProgress?.(0, ids.length);
  for (const [index, id] of ids.entries()) {
    if (shouldStop()) break;
    const photo = await database.photos.get(id);
    if (photo && tooBig(photo)) {
      const smaller = await shrink(photo.blob);
      // Only keep the new copy if it really is smaller.
      if (smaller.blob.size < photo.blob.size) {
        await database.photos.update(id, { blob: smaller.blob, width: smaller.width, height: smaller.height });
        shrunk += 1;
        savedBytes += photo.blob.size - smaller.blob.size;
      } else {
        // Record the new size anyway so it isn't offered again.
        await database.photos.update(id, { width: smaller.width, height: smaller.height });
      }
    }
    onProgress?.(index + 1, ids.length);
  }
  return { shrunk, savedBytes };
}
