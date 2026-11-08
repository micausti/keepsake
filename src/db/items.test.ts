import { describe, expect, it } from 'vitest';
import { emptyDraft, type ItemDraft } from '../domain/draft.ts';
import { db } from './db.ts';
import { createItem, knownStorageLocations, recentItems } from './items.ts';

const draft = (overrides: Partial<ItemDraft> = {}): ItemDraft => ({
  ...emptyDraft([]),
  title: 'Red wellies',
  category: 'wellies_boots',
  ...overrides,
});

const photo = (n: number) => ({
  full: new Blob([`full-${n}`], { type: 'image/jpeg' }),
  thumb: new Blob([`thumb-${n}`], { type: 'image/jpeg' }),
  width: 2000,
  height: 1500,
  takenAt: new Date(2025, 0, n),
});

describe('createItem', () => {
  it('saves the item, its photos and a first timeline entry', async () => {
    const item = await createItem(
      draft({ condition: 'good', conditionNotes: ' Scuffed ', pricePaid: '£12.50', brand: '  ', seasons: ['winter'] }),
      [photo(1), photo(2)],
    );

    const stored = await db.items.get(item.id);
    expect(stored).toMatchObject({
      title: 'Red wellies',
      condition: 'good',
      conditionNotes: 'Scuffed',
      pricePaidPence: 1250,
      seasons: ['winter'],
      status: 'in_use',
    });
    expect(stored?.brand).toBeUndefined();

    const photos = await db.photos.where('itemId').equals(item.id).sortBy('takenAt');
    expect(photos).toHaveLength(2);
    expect(stored?.coverPhotoId).toBe(photos[0]?.id);
    expect(photos[0]?.takenAt).toBe(new Date(2025, 0, 1).toISOString());

    const events = await db.events.where('itemId').equals(item.id).toArray();
    expect(events).toEqual([
      expect.objectContaining({ kind: 'created', condition: 'good', photoIds: photos.map((p) => p.id) }),
    ]);
  });

  it('saves an item without photos', async () => {
    const item = await createItem(draft(), []);
    expect(item.coverPhotoId).toBeUndefined();
    expect(await db.items.count()).toBe(1);
  });

  it.each([
    [{ title: ' ' }, 'Give the item a name.'],
    [{ category: '' as const }, 'Choose a category.'],
    [{ pricePaid: 'twelve' }, 'Price paid should look like 12.50'],
  ])('rejects %j', async (overrides, message) => {
    await expect(createItem(draft(overrides), [photo(1)])).rejects.toThrow(message);
    expect(await db.items.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
  });
});

describe('queries', () => {
  it('lists recent items and known storage locations', async () => {
    await createItem(draft({ title: 'A', storageLocation: 'Loft box 2' }), []);
    await createItem(draft({ title: 'B', storageLocation: 'Under bed' }), []);
    await createItem(draft({ title: 'C', storageLocation: 'Loft box 2' }), []);
    expect(await knownStorageLocations()).toEqual(['Loft box 2', 'Under bed']);
    expect((await recentItems(2)).map((i) => i.title)).toHaveLength(2);
  });
});
