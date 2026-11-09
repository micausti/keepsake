import { describe, expect, it } from 'vitest';
import { buildListing, fitTitle, hashtags, LISTING_PLATFORMS } from './listing.ts';
import type { Item } from './types.ts';

const coat: Item = {
  id: 'c',
  title: 'Navy padded coat with hood',
  category: 'outerwear',
  size: '2-3y',
  seasons: ['winter'],
  brand: 'Boden',
  colour: 'Navy',
  material: 'Polyester',
  description: 'Warm padded coat with a detachable hood and fleece lining.',
  condition: 'very_good',
  conditionNotes: 'Tiny mark on the left cuff.',
  status: 'to_sell',
  createdAt: '',
  updatedAt: '',
};

describe('buildListing', () => {
  it('writes a Vinted listing', () => {
    expect(buildListing(coat, 'vinted')).toEqual({
      title: 'Boden Navy padded coat with hood, 2-3 years',
      description: [
        'Warm padded coat with a detachable hood and fleece lining.',
        '• Size: 2–3 years\n• Brand: Boden\n• Colour: Navy\n• Material: Polyester\n• Condition: Very good. Tiny mark on the left cuff.',
      ].join('\n\n'),
      condition: 'Very good',
      size: '2–3 years',
      brand: 'Boden',
      colour: 'Navy',
    });
  });

  it('uses each platform’s condition wording', () => {
    expect(buildListing(coat, 'ebay').condition).toBe('Pre-owned');
    expect(buildListing(coat, 'facebook').condition).toBe('Used – like new');
    expect(buildListing(coat, 'depop').condition).toBe('Used – excellent');
    expect(buildListing({ ...coat, condition: 'new_with_tags' }, 'facebook').condition).toBe('New');
  });

  it('keeps eBay titles to 80 characters at a word boundary', () => {
    const long = { ...coat, title: 'Navy padded winter coat with detachable hood fleece lining and reflective piping details' };
    const title = buildListing(long, 'ebay').title ?? '';
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith(' ')).toBe(false);
    expect(long.title.includes(title.replace('Boden ', ''))).toBe(true);
  });

  it('puts the title and hashtags into the Depop description', () => {
    const listing = buildListing(coat, 'depop');
    expect(listing.title).toBeUndefined();
    expect(listing.description.startsWith('Boden Navy padded coat with hood, 2-3 years\n\n')).toBe(true);
    expect(listing.description.endsWith('#boden #kidscoat #navy #kidswear #preloved')).toBe(true);
  });

  it('copes with sparse items and toys', () => {
    const train: Item = { id: 't', title: 'Wooden train set', category: 'toys', size: '3y+', seasons: [], status: 'to_sell', createdAt: '', updatedAt: '' };
    for (const platform of LISTING_PLATFORMS) {
      const listing = buildListing(train, platform);
      expect(listing.description).toContain('• Size: Age 3 years +');
      expect(listing.description).not.toContain('undefined');
    }
    expect(buildListing(train, 'vinted').title).toBe('Wooden train set');
    expect(buildListing(train, 'vinted').condition).toBeUndefined();
  });

  it('does not repeat a brand already in the title', () => {
    expect(buildListing({ ...coat, title: 'Boden padded coat' }, 'vinted').title).toBe('Boden padded coat, 2-3 years');
  });
});

describe('helpers', () => {
  it('fits titles', () => {
    expect(fitTitle('  short   title ', 80)).toBe('short title');
    expect(fitTitle('word '.repeat(30), 20)).toBe('word word word word');
  });

  it('makes at most 5 unique hashtags', () => {
    expect(hashtags({ ...coat, brand: 'H&M', colour: 'Navy, white' })).toEqual(['#hm', '#kidscoat', '#navy', '#kidswear', '#preloved']);
    expect(hashtags({ ...coat, brand: undefined, colour: undefined, category: 'books' })).toEqual(['#kidsbooks', '#toys', '#preloved']);
  });
});
