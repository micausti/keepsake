import { describe, expect, it } from 'vitest';
import { CATEGORIES, CONDITIONS, ITEM_STATUSES, PLATFORMS, SEASONS, categoryById } from './options.ts';
import { parsePounds, formatPence } from './money.ts';

describe('option lists', () => {
  it.each([
    ['categories', CATEGORIES],
    ['conditions', CONDITIONS],
    ['statuses', ITEM_STATUSES],
    ['platforms', PLATFORMS],
    ['seasons', SEASONS],
  ])('%s have unique ids', (_name, list) => {
    const ids = list.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has every status from the plan, plus lost', () => {
    expect(ITEM_STATUSES.map((s) => s.id)).toEqual([
      'in_use',
      'outgrown',
      'storage',
      'hand_down',
      'to_sell',
      'listed',
      'sold',
      'donated',
      'lost',
    ]);
  });

  it('maps categories to size scales', () => {
    expect(categoryById('outerwear').sizeSystem).toBe('clothing');
    expect(categoryById('wellies_boots').sizeSystem).toBe('shoes');
    expect(categoryById('toys').sizeSystem).toBe('toy_age');
    expect(categoryById('accessories')).toMatchObject({ label: 'Hats, gloves & scarves', sizeSystem: 'clothing' });
    expect(categoryById('bags_accessories')).toMatchObject({ label: 'Bags & other accessories', sizeSystem: 'none' });
  });
});

describe('money', () => {
  it.each([
    ['4', 400],
    ['£4.50', 450],
    ['4.5', 450],
    [' 1,250.99 ', 125099],
    ['0.10', 10],
  ])('parses %s', (input, pence) => {
    expect(parsePounds(input)).toBe(pence);
  });

  it.each(['', 'abc', '4.555', '-2', '£'])('rejects %j', (input) => {
    expect(parsePounds(input)).toBeUndefined();
  });

  it('formats pence as pounds', () => {
    expect(formatPence(450)).toBe('£4.50');
    expect(formatPence(undefined)).toBe('');
  });
});
