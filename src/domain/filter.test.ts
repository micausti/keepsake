import { describe, expect, it } from 'vitest';
import { DEFAULT_QUERY, activeFilterCount, filterItems, type ItemQuery } from './filter.ts';
import type { Child, Item } from './types.ts';

const children: Child[] = [
  { id: 'arlo', name: 'Arlo', createdAt: '', updatedAt: '' },
  { id: 'zoe', name: 'Zoë', createdAt: '', updatedAt: '' },
];

let n = 0;
const item = (overrides: Partial<Item>): Item => {
  n += 1;
  return {
    id: `i${n}`,
    title: `Item ${n}`,
    category: 'tops',
    seasons: [],
    status: 'in_use',
    createdAt: `2026-01-0${n}T00:00:00Z`,
    updatedAt: `2026-01-0${n}T00:00:00Z`,
    ...overrides,
  };
};

const items = [
  item({ title: 'Navy padded coat', category: 'outerwear', size: '2-3y', childId: 'arlo', brand: 'Boden', seasons: ['autumn', 'winter'], condition: 'good' }),
  item({ title: 'Red wellies', category: 'wellies_boots', size: 'k6', childId: 'arlo', seasons: ['autumn', 'winter', 'spring'], storageLocation: 'Loft box 2' }),
  item({ title: 'Floral dress', category: 'dresses', size: '5-6y', childId: 'zoe', colour: 'Pink and green', seasons: ['summer'], status: 'sold' }),
  item({ title: 'Wooden train set', category: 'toys', size: '3y+', seasons: [], status: 'storage', description: 'Brio-style track' }),
  item({ title: 'Striped top', category: 'tops', size: '12-18m', childId: 'zoe', status: 'hand_down', condition: 'very_good' }),
  item({ title: 'Blue mitten', category: 'accessories', status: 'lost' }),
];

const run = (q: Partial<ItemQuery>) => filterItems(items, { ...DEFAULT_QUERY, ...q }, children).map((i) => i.title);

describe('filterItems', () => {
  it('hides sold, donated and lost items by default, newest first', () => {
    expect(run({})).toEqual(['Striped top', 'Wooden train set', 'Red wellies', 'Navy padded coat']);
    expect(run({ status: '' })).toHaveLength(6);
    expect(run({ status: 'sold' })).toEqual(['Floral dress']);
    expect(run({ status: 'lost' })).toEqual(['Blue mitten']);
  });

  it('searches across fields, ignoring case and accents, requiring every word', () => {
    expect(run({ text: 'boden' })).toEqual(['Navy padded coat']);
    expect(run({ text: 'LOFT' })).toEqual(['Red wellies']);
    expect(run({ text: 'brio' })).toEqual(['Wooden train set']);
    expect(run({ text: 'zoe' })).toEqual(['Striped top']);
    expect(run({ text: 'arlo coat' })).toEqual(['Navy padded coat']);
    expect(run({ text: 'arlo dress' })).toEqual([]);
    expect(run({ text: '2–3 years' })).toEqual(['Navy padded coat']);
    expect(run({ text: 'hand down' })).toEqual(['Striped top']);
  });

  it('filters by child, including unassigned', () => {
    expect(run({ childId: 'arlo' })).toEqual(['Red wellies', 'Navy padded coat']);
    expect(run({ childId: 'none' })).toEqual(['Wooden train set']);
  });

  it('filters by category, size, season and condition', () => {
    expect(run({ category: 'outerwear', size: '2-3y' })).toEqual(['Navy padded coat']);
    expect(run({ season: 'spring' })).toEqual(['Red wellies']);
    expect(run({ condition: 'very_good' })).toEqual(['Striped top']);
  });

  it('sorts by name and by size', () => {
    expect(run({ sort: 'name' })).toEqual(['Navy padded coat', 'Red wellies', 'Striped top', 'Wooden train set']);
    expect(run({ category: 'tops', sort: 'size', status: '' })).toEqual(['Striped top']);
    const tops = [
      item({ title: 'B', category: 'tops', size: '4-5y' }),
      item({ title: 'A', category: 'tops', size: '6-9m' }),
      item({ title: 'C', category: 'tops' }),
    ];
    expect(filterItems(tops, { ...DEFAULT_QUERY, sort: 'size' }, []).map((i) => i.title)).toEqual(['A', 'B', 'C']);
  });

  it('counts active filters', () => {
    expect(activeFilterCount(DEFAULT_QUERY)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_QUERY, text: 'x', sort: 'name' })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_QUERY, childId: 'arlo', status: '' })).toBe(2);
  });
});
