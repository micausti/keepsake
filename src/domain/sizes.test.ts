import { describe, expect, it } from 'vitest';
import {
  CLOTHING_SIZES,
  SHOE_SIZES,
  TOY_AGES,
  ageInMonths,
  clothingSizeForAge,
  formatAge,
  sizeLabel,
} from './sizes.ts';

const today = new Date(2026, 10, 7); // 7 Nov 2026

describe('size scales', () => {
  it.each([
    ['clothing', CLOTHING_SIZES],
    ['shoes', SHOE_SIZES],
    ['toy ages', TOY_AGES],
  ])('%s ids are unique', (_name, list) => {
    expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
  });

  it('runs clothing sizes from tiny baby to 15–16 years', () => {
    expect(CLOTHING_SIZES[0]?.id).toBe('tiny_baby');
    expect(CLOTHING_SIZES.at(-1)?.label).toBe('15–16 years');
  });

  it('labels shoe sizes with halves and junior sizes', () => {
    expect(SHOE_SIZES.map((s) => s.label)).toEqual(
      expect.arrayContaining(['UK 0', 'UK 4½', 'UK 13½', 'UK 1 (junior)', 'UK 7 (junior)']),
    );
    // Kids' 13½ comes before junior 1.
    const labels = SHOE_SIZES.map((s) => s.label);
    expect(labels.indexOf('UK 13½')).toBeLessThan(labels.indexOf('UK 1 (junior)'));
  });

  it('looks up labels, falling back to the raw id', () => {
    expect(sizeLabel('clothing', '2-3y')).toBe('2–3 years');
    expect(sizeLabel('shoes', 'k7.5')).toBe('UK 7½');
    expect(sizeLabel('clothing', 'odd')).toBe('odd');
    expect(sizeLabel('none', undefined)).toBeUndefined();
  });
});

describe('ages', () => {
  it('counts whole months', () => {
    expect(ageInMonths('2026-10-07', today)).toBe(1);
    expect(ageInMonths('2026-10-08', today)).toBe(0);
    expect(ageInMonths('2024-07-01', today)).toBe(28);
    expect(ageInMonths('2027-01-01', today)).toBe(0);
  });

  it('formats ages in months under 2, years after', () => {
    expect(formatAge('2025-11-07', today)).toBe('12 months');
    expect(formatAge('2026-10-07', today)).toBe('1 month');
    expect(formatAge('2022-03-15', today)).toBe('4 years');
  });

  it.each([
    ['2026-11-01', 'newborn'],
    ['2026-09-01', '0-3m'],
    ['2026-02-01', '9-12m'],
    ['2025-06-01', '12-18m'],
    ['2024-07-01', '2-3y'],
    ['2019-11-07', '7-8y'],
    ['2005-01-01', '15-16y'],
  ])('suggests the clothing size for a child born %s', (birth, size) => {
    expect(clothingSizeForAge(birth, today)).toBe(size);
    expect(CLOTHING_SIZES.some((s) => s.id === size)).toBe(true);
  });
});
