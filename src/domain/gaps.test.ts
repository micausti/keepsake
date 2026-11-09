import { describe, expect, it } from 'vitest';
import { computeGaps, handDownSuggestions, likelyOutgrown, nowAndNext } from './gaps.ts';
import type { Child, Item } from './types.ts';

const child = (id: string, clothingSize?: string, shoeSize?: string, birthDate?: string): Child => ({
  id,
  name: id[0]?.toUpperCase() + id.slice(1),
  clothingSize,
  shoeSize,
  birthDate,
  createdAt: '',
  updatedAt: '',
});

let n = 0;
const item = (overrides: Partial<Item>): Item => ({
  id: `i${++n}`,
  title: `Item ${n}`,
  category: 'tops',
  seasons: [],
  status: 'in_use',
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

const arlo = child('arlo', '4-5y', 'k10');
const zoe = child('zoe', '2-3y', 'k6');

describe('nowAndNext', () => {
  it('gives the current and next size', () => {
    expect(nowAndNext(zoe, 'clothing').map((s) => s.id)).toEqual(['2-3y', '3-4y']);
    expect(nowAndNext(zoe, 'shoes').map((s) => s.id)).toEqual(['k6', 'k6.5']);
  });

  it('falls back to age for clothing, and to nothing for shoes', () => {
    const baby = child('baby', undefined, undefined, '2026-01-01');
    expect(nowAndNext(baby, 'clothing').length).toBe(2);
    expect(nowAndNext(baby, 'shoes')).toEqual([]);
  });

  it('has no next size at the end of the scale', () => {
    expect(nowAndNext(child('teen', '15-16y'), 'clothing').map((s) => s.id)).toEqual(['15-16y']);
  });
});

describe('computeGaps', () => {
  const items = [
    item({ category: 'tops', size: '2-3y', childId: 'zoe' }),
    item({ category: 'tops', size: '2-3y' }), // unassigned counts
    item({ category: 'tops', size: '2-3y', childId: 'zoe', status: 'sold' }), // gone: doesn't count
    item({ category: 'tops', size: '2-3y', childId: 'zoe', status: 'outgrown' }), // outgrown: doesn't count
    item({ category: 'tops', size: '2-3y', childId: 'zoe', status: 'lost' }), // lost: doesn't count
    item({ category: 'tops', size: '3-4y', childId: 'arlo', status: 'lost' }), // sibling's lost: not a hand-me-down
    item({ category: 'tops', size: '3-4y', childId: 'arlo', status: 'outgrown' }), // sibling's: hand-me-down
    item({ category: 'tops', size: '3-4y', childId: 'arlo', status: 'in_use' }), // sibling still wearing it
    item({ category: 'outerwear', size: '2-3y', childId: 'zoe', seasons: ['winter'] }),
    item({ category: 'shorts', size: '2-3y', childId: 'zoe', seasons: ['summer'] }),
  ];

  it('counts what the child has against targets, now and next', () => {
    const rows = computeGaps(zoe, items, { tops: 3, outerwear: 1, shorts: 2 });
    const tops = rows.find((r) => r.category === 'tops');
    expect(tops?.cells.map((c) => [c.size.id, c.have, c.handMeDowns, c.state])).toEqual([
      ['2-3y', 2, 0, 'low'],
      ['3-4y', 0, 1, 'none'],
    ]);
    expect(rows.find((r) => r.category === 'outerwear')?.cells[0]?.state).toBe('ok');
  });

  it('hides categories with a target of 0 and uses defaults for the rest', () => {
    const rows = computeGaps(zoe, items, { jumpers: 0 });
    expect(rows.some((r) => r.category === 'jumpers')).toBe(false);
    expect(rows.find((r) => r.category === 'tops')?.cells[0]?.target).toBe(7);
    expect(rows.find((r) => r.category === 'shoes')?.cells[0]?.size.id).toBe('k6');
  });

  it('filters by season, counting items with no season', () => {
    const rows = computeGaps(zoe, items, { tops: 3, outerwear: 1, shorts: 2 }, 'winter');
    expect(rows.find((r) => r.category === 'shorts')?.cells[0]?.have).toBe(0);
    expect(rows.find((r) => r.category === 'outerwear')?.cells[0]?.have).toBe(1);
    expect(rows.find((r) => r.category === 'tops')?.cells[0]?.have).toBe(2);
  });
});

describe('handDownSuggestions', () => {
  it('suggests siblings’ outgrown things that fit now or next', () => {
    const items = [
      item({ title: 'Next coat', category: 'outerwear', size: '3-4y', childId: 'arlo', status: 'outgrown' }),
      item({ title: 'Now wellies', category: 'wellies_boots', size: 'k6', childId: 'arlo', status: 'storage' }),
      item({ title: 'In use', category: 'tops', size: '2-3y', childId: 'arlo', status: 'in_use' }),
      item({ title: 'Too small', category: 'tops', size: '12-18m', childId: 'arlo', status: 'outgrown' }),
      item({ title: 'Toy', category: 'toys', size: '3y+', childId: 'arlo', status: 'outgrown' }),
      item({ title: 'Lost coat', category: 'outerwear', size: '3-4y', childId: 'arlo', status: 'lost' }),
    ];
    expect(handDownSuggestions([arlo, zoe], items).map((s) => [s.item.title, s.to.id, s.when])).toEqual([
      ['Now wellies', 'zoe', 'now'],
      ['Next coat', 'zoe', 'next'],
    ]);
  });
});

describe('likelyOutgrown', () => {
  it('finds smaller items still marked in use', () => {
    const items = [
      item({ title: 'Small', size: '3-4y', childId: 'arlo' }),
      item({ title: 'Current', size: '4-5y', childId: 'arlo' }),
      item({ title: 'Small but stored', size: '2-3y', childId: 'arlo', status: 'storage' }),
      item({ title: 'Small shoes', category: 'shoes', size: 'k9', childId: 'arlo' }),
      item({ title: 'Zoe’s', size: '2-3y', childId: 'zoe' }),
    ];
    expect(likelyOutgrown(arlo, items).map((i) => i.title)).toEqual(['Small', 'Small shoes']);
  });
});
