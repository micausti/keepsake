import { describe, expect, it } from 'vitest';
import type { ItemSuggestion } from '../ai/schema.ts';
import { addChild } from '../db/children.ts';
import { db } from '../db/db.ts';
import { draftFromSuggestion, emptyDraft, guessChild, sizeKeptFor } from './draft.ts';
import { computeGaps, handDownSuggestions } from './gaps.ts';
import { ADULT_CLOTHING_SUGGESTIONS, ADULT_SHOE_SUGGESTIONS, adultSizeSuggestions } from './sizes.ts';
import { childrenOnly, isAdult, type Child, type Item } from './types.ts';

const me: Child = { id: 'me', name: 'Michelle', kind: 'adult', createdAt: '', updatedAt: '' };
const layne: Child = { id: 'layne', name: 'Layne', clothingSize: '2-3y', shoeSize: 'k6', createdAt: '', updatedAt: '' };
const lucile: Child = { id: 'lucile', name: 'Lucile', kind: 'child', clothingSize: '5-6y', createdAt: '', updatedAt: '' };

const suggestion: ItemSuggestion = {
  title: 'Black wool coat',
  category: 'outerwear',
  sizeOnLabel: 'UK 10',
  size: null,
  seasons: ['winter'],
  brand: 'Whistles',
  colour: 'Black',
  material: 'Wool',
  condition: 'very_good',
  conditionNotes: null,
  description: 'A tailored coat.',
  uncertain: [],
};

describe('people', () => {
  it('tells adults from children (missing kind means child)', () => {
    expect(isAdult(me)).toBe(true);
    expect(isAdult(layne)).toBe(false);
    expect(childrenOnly([me, layne, lucile]).map((p) => p.id)).toEqual(['layne', 'lucile']);
  });

  it('stores an adult with just a name', async () => {
    const adult = await addChild({ name: ' Michelle ', kind: 'adult', clothingSize: '2-3y', birthDate: '1990-01-01' });
    expect(await db.children.get(adult.id)).toMatchObject({ name: 'Michelle', kind: 'adult' });
    expect(adult.clothingSize).toBeUndefined();
    expect(adult.birthDate).toBeUndefined();
    const kid = await addChild({ name: 'Layne', clothingSize: '2-3y' });
    expect(kid).toMatchObject({ kind: 'child', clothingSize: '2-3y' });
  });
});

describe('adult sizes', () => {
  it('suggests letter, UK and shoe sizes', () => {
    expect(ADULT_CLOTHING_SUGGESTIONS).toEqual(expect.arrayContaining(['XS', 'M', 'XXL', 'One size', 'UK 10', 'UK 24']));
    expect(ADULT_SHOE_SUGGESTIONS).toEqual(expect.arrayContaining(['UK 2', 'UK 5.5', 'UK 13']));
    expect(adultSizeSuggestions('none')).toEqual([]);
  });

  it('keeps any typed size for an adult’s clothes and shoes, but not for bags', () => {
    expect(sizeKeptFor(me, 'trousers', 'W30 L32')).toBe(true);
    expect(sizeKeptFor(me, 'shoes', 'UK 6')).toBe(true);
    expect(sizeKeptFor(me, 'bags_accessories', 'M')).toBe(false);
    expect(sizeKeptFor(layne, 'tops', 'M')).toBe(false);
    expect(sizeKeptFor(layne, 'tops', '2-3y')).toBe(true);
  });

  it('uses the label’s size for an adult’s item filled in by AI', () => {
    const draft = draftFromSuggestion(suggestion, [me, layne], { ...emptyDraft([me, layne]), childId: 'me' });
    expect(draft).toMatchObject({ size: 'UK 10', childId: 'me', conditionNotes: '' });
  });

  it('never guesses an adult from a size, but picks the only person', () => {
    expect(guessChild([me, layne], 'tops', '2-3y')).toBe('layne');
    expect(guessChild([me], 'tops', null)).toBe('me');
    expect(emptyDraft([me]).childId).toBe('me');
    expect(emptyDraft([me, layne]).childId).toBe('');
  });
});

describe('gaps ignore adults', () => {
  it('suggests nothing to or from an adult', () => {
    const coat: Item = {
      id: 'c', title: 'Coat', category: 'outerwear', size: '2-3y', childId: 'lucile', status: 'outgrown',
      seasons: [], createdAt: '', updatedAt: '',
    };
    const kids = childrenOnly([me, layne, lucile]);
    expect(handDownSuggestions(kids, [coat]).map((s) => s.to.id)).toEqual(['layne']);
    const coats = computeGaps(layne, [coat], { outerwear: 1 }).find((r) => r.category === 'outerwear');
    expect(coats?.cells[0]?.handMeDowns).toBe(1);
  });
});
