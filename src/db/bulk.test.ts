import { describe, expect, it } from 'vitest';
import { emptyDraft, type ItemDraft } from '../domain/draft.ts';
import { db } from './db.ts';
import { bulkUpdate, createItem, undoBulkUpdate } from './items.ts';

const add = (d: Partial<ItemDraft>) => createItem({ ...emptyDraft([]), title: 'x', category: 'shorts', ...d }, []);
const notes = async (id: string) =>
  (await db.events.where('itemId').equals(id).toArray()).filter((e) => e.kind !== 'created');

describe('bulkUpdate', () => {
  it('changes only the chosen fields and records moves, statuses and owners', async () => {
    const a = await add({ title: 'Blue shorts', childId: 'layne', seasons: ['summer'], storageLocation: 'Drawer' });
    const b = await add({ title: 'Red shorts', status: 'storage', storageLocation: 'Loft box 3' });
    const other = await add({ title: 'Untouched' });

    await bulkUpdate([a.id, b.id], { storageLocation: ' Loft box 3 ', status: 'storage', childId: 'lucile', addSeason: 'spring', removeSeason: 'summer' });

    expect(await db.items.get(a.id)).toMatchObject({ storageLocation: 'Loft box 3', status: 'storage', childId: 'lucile', seasons: ['spring'], brand: undefined });
    expect(await db.items.get(b.id)).toMatchObject({ storageLocation: 'Loft box 3', status: 'storage', childId: 'lucile', seasons: ['spring'] });
    expect(await db.items.get(other.id)).toMatchObject({ status: 'in_use', storageLocation: undefined });

    // Only real changes go on the timeline.
    expect((await notes(a.id)).map((e) => e.kind).sort()).toEqual(['handdown', 'note', 'status']);
    expect((await notes(a.id)).find((e) => e.kind === 'note')?.note).toBe('Moved to Loft box 3');
    expect((await notes(b.id)).map((e) => e.kind)).toEqual(['handdown']);
  });

  it('can unassign items', async () => {
    const a = await add({ childId: 'layne' });
    await bulkUpdate([a.id], { childId: '' });
    expect((await db.items.get(a.id))?.childId).toBeUndefined();
  });

  it('refuses an update that changes nothing, and skips missing items', async () => {
    const a = await add({});
    await expect(bulkUpdate([a.id], { storageLocation: '  ' })).rejects.toThrow('Choose something to change');
    const undo = await bulkUpdate([a.id, 'gone'], { status: 'outgrown' });
    expect(undo.before.map((b) => b.id)).toEqual([a.id]);
  });
});

describe('undoBulkUpdate', () => {
  it('puts everything back exactly, including empty fields, and removes the timeline entries', async () => {
    const a = await add({ title: 'Blue shorts', seasons: ['summer'] });
    const before = await db.items.get(a.id);
    const undo = await bulkUpdate([a.id], { storageLocation: 'Loft box 3', status: 'storage', childId: 'lucile', addSeason: 'winter' });
    await undoBulkUpdate(undo);

    expect(await db.items.get(a.id)).toEqual(before);
    expect(await notes(a.id)).toEqual([]);
  });
});
