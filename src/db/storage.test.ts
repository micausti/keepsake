// @vitest-environment node
// (Node keeps Blobs intact through the in-memory IndexedDB; jsdom's Blob does not.)
import { describe, expect, it } from 'vitest';
import { emptyDraft } from '../domain/draft.ts';
import { db } from './db.ts';
import { createItem } from './items.ts';
import { appUsage, formatBytes } from './storage.ts';

const photo = (bytes: number) => ({
  full: new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }),
  thumb: new Blob([new Uint8Array(100)], { type: 'image/jpeg' }),
  width: 1600,
  height: 1200,
  takenAt: new Date(2025, 5, 14),
});

describe('appUsage', () => {
  it('adds up photos, thumbnails and records', async () => {
    await Promise.all([db.photos.clear(), db.items.clear(), db.events.clear(), db.children.clear()]);
    await createItem({ ...emptyDraft([]), title: 'Coat', category: 'outerwear' }, [photo(300_000), photo(200_000)]);
    await createItem({ ...emptyDraft([]), title: 'Top', category: 'tops' }, []);
    const usage = await appUsage();
    expect(usage.photos).toBe(2);
    expect(usage.items).toBe(2);
    expect(usage.bytes).toBeGreaterThan(500_200);
    expect(usage.bytes).toBeLessThan(510_000);
    expect(formatBytes(310 * 1024 * 1024)).toBe('310.0 MB');
  });
});
