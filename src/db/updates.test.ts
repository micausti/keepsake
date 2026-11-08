import { describe, expect, it } from 'vitest';
import { emptyDraft } from '../domain/draft.ts';
import { db } from './db.ts';
import { addUpdate, createItem, deleteItem, draftFromItem, setCoverPhoto, setStatus, updateItem } from './items.ts';

const photo = (n: number) => ({
  full: new Blob([`full-${n}`]),
  thumb: new Blob([`thumb-${n}`]),
  width: 10,
  height: 10,
  takenAt: new Date(2025, 0, n),
});

async function seed() {
  const item = await createItem(
    { ...emptyDraft([]), title: 'Coat', category: 'outerwear', condition: 'very_good', pricePaid: '25' },
    [photo(1)],
  );
  // Sale details are set in Phase 5; editing must not lose them.
  await db.items.update(item.id, { salePricePence: 800, salePlatform: 'vinted' });
  return item;
}

async function load(id: string) {
  const item = await db.items.get(id);
  if (!item) throw new Error('missing item');
  return item;
}

const kinds = async (itemId: string) => (await db.events.where('itemId').equals(itemId).sortBy('at')).map((e) => e.kind);

describe('editing items', () => {
  it('round-trips through the form and keeps sale details and cover photo', async () => {
    const item = await seed();
    const draft = draftFromItem(await load(item.id));
    expect(draft.pricePaid).toBe('25.00');

    const updated = await updateItem(item.id, { ...draft, title: 'Navy coat', brand: 'Boden' });
    expect(updated).toMatchObject({
      title: 'Navy coat',
      brand: 'Boden',
      pricePaidPence: 2500,
      salePricePence: 800,
      salePlatform: 'vinted',
      coverPhotoId: item.coverPhotoId,
      createdAt: item.createdAt,
    });
    expect(await kinds(item.id)).toEqual(['created']);
  });

  it('records status and condition changes on the timeline', async () => {
    const item = await seed();
    const draft = draftFromItem(await load(item.id));
    await updateItem(item.id, { ...draft, status: 'outgrown', condition: 'good', conditionNotes: 'Bobbled' });
    const events = await db.events.where('itemId').equals(item.id).toArray();
    expect(events.map((e) => e.kind).sort()).toEqual(['condition', 'created', 'status']);
    expect(events.find((e) => e.kind === 'condition')).toMatchObject({ condition: 'good', note: 'Bobbled' });
  });
});

describe('addUpdate', () => {
  it('adds photos, a condition and a note', async () => {
    const item = await seed();
    const event = await addUpdate(item.id, { condition: 'good', note: ' Faded knees ', photos: [photo(2), photo(3)] });
    expect(event).toMatchObject({ kind: 'condition', condition: 'good', note: 'Faded knees' });
    expect(event.photoIds).toHaveLength(2);
    expect(await db.photos.where('itemId').equals(item.id).count()).toBe(3);
    expect(await db.items.get(item.id)).toMatchObject({ condition: 'good', conditionNotes: 'Faded knees' });
  });

  it('records a note or photos alone without changing condition', async () => {
    const item = await seed();
    expect((await addUpdate(item.id, { note: 'Still fits', photos: [] })).kind).toBe('note');
    expect((await addUpdate(item.id, { photos: [photo(4)] })).kind).toBe('photos');
    expect((await db.items.get(item.id))?.condition).toBe('very_good');
  });

  it('makes the first photo the cover when there was none', async () => {
    const item = await createItem({ ...emptyDraft([]), title: 'Train', category: 'toys' }, []);
    const event = await addUpdate(item.id, { photos: [photo(5)] });
    expect((await db.items.get(item.id))?.coverPhotoId).toBe(event.photoIds?.[0]);
  });

  it('rejects an empty update', async () => {
    const item = await seed();
    await expect(addUpdate(item.id, { note: '  ', photos: [] })).rejects.toThrow('Add a photo');
  });
});

describe('status, cover and delete', () => {
  it('changes status once and records it', async () => {
    const item = await seed();
    await setStatus(item.id, 'to_sell');
    await setStatus(item.id, 'to_sell');
    expect((await db.items.get(item.id))?.status).toBe('to_sell');
    expect(await kinds(item.id)).toEqual(['created', 'status']);
  });

  it('sets the cover photo', async () => {
    const item = await seed();
    const event = await addUpdate(item.id, { photos: [photo(6)] });
    await setCoverPhoto(item.id, event.photoIds?.[0] ?? '');
    expect((await db.items.get(item.id))?.coverPhotoId).toBe(event.photoIds?.[0]);
  });

  it('deletes the item with its photos and history only', async () => {
    const keep = await seed();
    const gone = await seed();
    await deleteItem(gone.id);
    expect(await db.items.get(gone.id)).toBeUndefined();
    expect(await db.photos.where('itemId').equals(gone.id).count()).toBe(0);
    expect(await db.events.where('itemId').equals(gone.id).count()).toBe(0);
    expect(await db.items.get(keep.id)).toBeDefined();
    expect(await db.photos.where('itemId').equals(keep.id).count()).toBe(1);
  });
});
