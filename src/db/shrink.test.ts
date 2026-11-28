// @vitest-environment node
// (Node keeps Blobs intact through the in-memory IndexedDB; jsdom's Blob does not.)
import { describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { createItem } from './items.ts';
import { emptyDraft } from '../domain/draft.ts';
import { shrinkCandidates, shrinkPhotos, type Shrinker } from './shrink.ts';

const photo = (bytes: number, width: number, height: number) => ({
  full: new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }),
  thumb: new Blob(['t'], { type: 'image/jpeg' }),
  width,
  height,
  takenAt: new Date(2025, 5, 14),
});

/** Pretends to re-encode at 1600px: output is a quarter of the input. */
const fakeShrink: Shrinker = async (blob) => ({
  blob: new Blob([new Uint8Array(Math.floor(blob.size / 4))], { type: 'image/jpeg' }),
  width: 1600,
  height: 1200,
});

async function seed() {
  await db.photos.clear();
  await createItem({ ...emptyDraft([]), title: 'Coat', category: 'outerwear' }, [
    photo(4000, 2000, 1500),
    photo(8000, 1500, 2000),
    photo(1000, 1600, 1200), // already the new size
  ]);
}

describe('shrinkPhotos', () => {
  it('finds only photos larger than the current size', async () => {
    await seed();
    expect(await shrinkCandidates()).toEqual({ count: 2, bytes: 12000 });
  });

  it('re-saves large photos, keeps the rest, and is not offered again', async () => {
    await seed();
    const progress: string[] = [];
    const result = await shrinkPhotos((d, t) => progress.push(`${d}/${t}`), { shrink: fakeShrink });
    expect(result).toEqual({ shrunk: 2, savedBytes: 9000 });
    expect(progress).toEqual(['0/2', '1/2', '2/2']);
    const sizes = (await db.photos.toArray()).map((p) => p.blob.size).sort((a, b) => a - b);
    expect(sizes).toEqual([1000, 1000, 2000]);
    expect(await shrinkCandidates()).toEqual({ count: 0, bytes: 0 });
  });

  it('never replaces a photo with a bigger copy', async () => {
    await seed();
    const bigger: Shrinker = async (blob) => ({ blob: new Blob([new Uint8Array(blob.size + 1)]), width: 1600, height: 1200 });
    expect(await shrinkPhotos(undefined, { shrink: bigger })).toEqual({ shrunk: 0, savedBytes: 0 });
    expect((await db.photos.toArray()).map((p) => p.blob.size).sort((a, b) => a - b)).toEqual([1000, 4000, 8000]);
  });

  it('can be stopped and picked up later', async () => {
    await seed();
    let calls = 0;
    const once: Shrinker = async (b) => {
      calls += 1;
      return fakeShrink(b);
    };
    await shrinkPhotos(undefined, { shrink: once, shouldStop: () => calls >= 1 });
    expect((await shrinkCandidates()).count).toBe(1);
    await shrinkPhotos(undefined, { shrink: fakeShrink });
    expect((await shrinkCandidates()).count).toBe(0);
  });
});
