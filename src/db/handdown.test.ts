import { describe, expect, it } from 'vitest';
import { emptyDraft } from '../domain/draft.ts';
import { db } from './db.ts';
import { createItem, handDown, markOutgrown } from './items.ts';

describe('handDown', () => {
  it('reassigns the item, sets status by fit, and records it', async () => {
    const item = await createItem(
      { ...emptyDraft([]), title: 'Coat', category: 'outerwear', childId: 'arlo', status: 'outgrown' },
      [],
    );
    await handDown(item.id, 'zoe', false);
    expect(await db.items.get(item.id)).toMatchObject({ childId: 'zoe', status: 'storage' });
    const events = await db.events.where('itemId').equals(item.id).toArray();
    expect(events.find((e) => e.kind === 'handdown')).toMatchObject({ fromChildId: 'arlo', toChildId: 'zoe', status: 'storage' });

    await handDown(item.id, 'zoe', true); // already theirs: no change
    expect((await db.items.get(item.id))?.status).toBe('storage');
  });

  it('marks items in use when they fit now', async () => {
    const item = await createItem({ ...emptyDraft([]), title: 'Top', category: 'tops' }, []);
    await handDown(item.id, 'zoe', true);
    expect(await db.items.get(item.id)).toMatchObject({ childId: 'zoe', status: 'in_use' });
  });
});

describe('markOutgrown', () => {
  it('marks each item outgrown with a timeline entry', async () => {
    const a = await createItem({ ...emptyDraft([]), title: 'A', category: 'tops' }, []);
    const b = await createItem({ ...emptyDraft([]), title: 'B', category: 'tops' }, []);
    await markOutgrown([a.id, b.id]);
    expect((await db.items.bulkGet([a.id, b.id])).map((i) => i?.status)).toEqual(['outgrown', 'outgrown']);
    expect((await db.events.toArray()).filter((e) => e.kind === 'status')).toHaveLength(2);
  });
});
