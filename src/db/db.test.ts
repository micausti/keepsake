import { describe, expect, it } from 'vitest';
import { addChild, deleteChild, listChildren, updateChild } from './children.ts';
import { db, now } from './db.ts';
import { DEFAULT_MODEL, getSettings, looksLikeApiKey, maskApiKey, saveSetting } from './settings.ts';

describe('children', () => {
  it('adds, lists alphabetically and updates', async () => {
    const zoe = await addChild({ name: '  Zoe ', clothingSize: '4-5y' });
    await addChild({ name: 'Arlo', birthDate: '2023-05-01' });
    expect(zoe.name).toBe('Zoe');
    expect((await listChildren()).map((c) => c.name)).toEqual(['Arlo', 'Zoe']);

    await updateChild(zoe.id, { name: 'Zoë', clothingSize: '5-6y', shoeSize: '' });
    const updated = await db.children.get(zoe.id);
    expect(updated).toMatchObject({ name: 'Zoë', clothingSize: '5-6y', createdAt: zoe.createdAt });
    expect(updated?.shoeSize).toBeUndefined();
  });

  it('requires a name', async () => {
    await expect(addChild({ name: '   ' })).rejects.toThrow('Name is required');
  });

  it('keeps items but unassigns them when a child is removed', async () => {
    const child = await addChild({ name: 'Arlo' });
    const timestamp = now();
    await db.items.add({
      id: 'item-1',
      title: 'Red wellies',
      category: 'wellies_boots',
      childId: child.id,
      seasons: ['autumn', 'winter'],
      status: 'in_use',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await deleteChild(child.id);

    expect(await db.children.count()).toBe(0);
    const item = await db.items.get('item-1');
    expect(item?.title).toBe('Red wellies');
    expect(item?.childId).toBeUndefined();
  });

  it('indexes items by season', async () => {
    const timestamp = now();
    await db.items.bulkAdd([
      { id: 'a', title: 'Coat', category: 'outerwear', seasons: ['winter'], status: 'in_use', createdAt: timestamp, updatedAt: timestamp },
      { id: 'b', title: 'Shorts', category: 'shorts', seasons: ['summer'], status: 'in_use', createdAt: timestamp, updatedAt: timestamp },
    ]);
    expect((await db.items.where('seasons').equals('winter').toArray()).map((i) => i.id)).toEqual(['a']);
  });
});

describe('settings', () => {
  it('defaults the model to Sonnet 5.5 with no key', async () => {
    expect(await getSettings()).toEqual({ model: DEFAULT_MODEL });
    expect(DEFAULT_MODEL).toBe('claude-sonnet-5-5');
  });

  it('saves trimmed values and removes blank ones', async () => {
    await saveSetting('apiKey', '  sk-ant-api03-abc  ');
    await saveSetting('model', 'claude-opus-5-5');
    expect(await getSettings()).toEqual({ apiKey: 'sk-ant-api03-abc', model: 'claude-opus-5-5' });

    await saveSetting('apiKey', undefined);
    await saveSetting('model', '');
    expect(await getSettings()).toEqual({ model: DEFAULT_MODEL });
  });

  it('recognises and masks keys', () => {
    const key = 'sk-ant-api03-' + 'x'.repeat(80) + 'AbCd';
    expect(looksLikeApiKey(key)).toBe(true);
    expect(looksLikeApiKey('sk-proj-123')).toBe(false);
    expect(maskApiKey(key)).toBe('sk-ant-api03…AbCd');
    expect(maskApiKey(key)).not.toContain('xxxx');
  });
});
