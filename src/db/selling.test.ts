import { describe, expect, it } from 'vitest';
import { emptyDraft } from '../domain/draft.ts';
import { db } from './db.ts';
import { createItem, draftFromItem, markListed, markSold, unlist, updateItem } from './items.ts';

const seed = () => createItem({ ...emptyDraft([]), title: 'Coat', category: 'outerwear', status: 'to_sell' }, []);
const notes = async (id: string) => (await db.events.where('itemId').equals(id).sortBy('at')).map((e) => e.note).filter(Boolean);

describe('selling', () => {
  it('lists, updates the listing, and sells', async () => {
    const item = await seed();
    await markListed(item.id, { platforms: ['vinted', 'ebay'], pricePence: 800 });
    const listed = await db.items.get(item.id);
    expect(listed).toMatchObject({ status: 'listed', listedOn: ['vinted', 'ebay'], listPricePence: 800 });

    await markListed(item.id, { platforms: ['vinted'], pricePence: 700 });
    const relisted = await db.items.get(item.id);
    expect(relisted).toMatchObject({ listedOn: ['vinted'], listPricePence: 700, listedAt: listed?.listedAt });

    await markSold(item.id, { platform: 'vinted', pricePence: 650 });
    expect(await db.items.get(item.id)).toMatchObject({ status: 'sold', salePlatform: 'vinted', salePricePence: 650 });
    expect((await db.items.get(item.id))?.listedOn).toBeUndefined();
    expect(await notes(item.id)).toEqual(['Listed on Vinted, eBay at £8.00', 'Listed on Vinted at £7.00', 'Sold on Vinted for £6.50']);
  });

  it('takes an item off sale', async () => {
    const item = await seed();
    await markListed(item.id, { platforms: ['depop'] });
    await unlist(item.id);
    expect(await db.items.get(item.id)).toMatchObject({ status: 'to_sell' });
    expect((await db.items.get(item.id))?.listedOn).toBeUndefined();
  });

  it('needs at least one platform', async () => {
    const item = await seed();
    await expect(markListed(item.id, { platforms: [] })).rejects.toThrow('Choose where');
  });

  it('keeps listing and sale details when the item is edited', async () => {
    const item = await seed();
    await markListed(item.id, { platforms: ['ebay'], pricePence: 500 });
    await markSold(item.id, { platform: 'ebay', pricePence: 450 });
    const sold = await db.items.get(item.id);
    if (!sold) throw new Error('missing');
    await updateItem(item.id, { ...draftFromItem(sold), title: 'Navy coat' });
    expect(await db.items.get(item.id)).toMatchObject({
      title: 'Navy coat',
      salePricePence: 450,
      salePlatform: 'ebay',
      listPricePence: 500,
      soldAt: sold.soldAt,
    });
  });
});
