import { describe, expect, it } from 'vitest';
import type { ItemSuggestion } from '../ai/schema.ts';
import { draftFromSuggestion, emptyDraft, guessChild, sizeFitsCategory } from './draft.ts';
import type { Child } from './types.ts';

const child = (id: string, clothingSize?: string, shoeSize?: string): Child => ({
  id,
  name: id,
  clothingSize,
  shoeSize,
  createdAt: '',
  updatedAt: '',
});

const suggestion = (overrides: Partial<ItemSuggestion> = {}): ItemSuggestion => ({
  title: 'Navy padded coat',
  category: 'outerwear',
  sizeOnLabel: '2-3 Y',
  size: '2-3y',
  seasons: ['autumn', 'winter', 'winter'],
  brand: 'Boden',
  colour: 'Navy',
  material: null,
  condition: 'very_good',
  conditionNotes: null,
  description: 'A warm padded coat.',
  uncertain: [],
  ...overrides,
});

describe('draftFromSuggestion', () => {
  const kids = [child('arlo', '2-3y', 'k6'), child('zoe', '5-6y', 'k11')];

  it('copies the suggestion and picks the child whose size matches', () => {
    const draft = draftFromSuggestion(suggestion(), kids, emptyDraft(kids));
    expect(draft).toMatchObject({
      title: 'Navy padded coat',
      category: 'outerwear',
      size: '2-3y',
      childId: 'arlo',
      seasons: ['autumn', 'winter'],
      brand: 'Boden',
      material: '',
      condition: 'very_good',
      status: 'in_use',
    });
  });

  it('drops a size from the wrong scale but keeps the label text', () => {
    const draft = draftFromSuggestion(
      suggestion({ category: 'shoes', size: '2-3y', sizeOnLabel: 'EU 24', conditionNotes: 'Scuffed toes' }),
      kids,
      emptyDraft(kids),
    );
    expect(draft.size).toBe('');
    expect(draft.childId).toBe('');
    expect(draft.conditionNotes).toBe('Scuffed toes. Label says size EU 24');
  });

  it('keeps a child already chosen', () => {
    const base = { ...emptyDraft(kids), childId: 'zoe' };
    expect(draftFromSuggestion(suggestion(), kids, base).childId).toBe('zoe');
  });
});

describe('guessChild', () => {
  it('picks the only child', () => {
    expect(guessChild([child('solo')], 'toys', null)).toBe('solo');
    expect(emptyDraft([child('solo')]).childId).toBe('solo');
  });

  it('matches shoe sizes and gives up when ambiguous', () => {
    const kids = [child('a', '2-3y', 'k6'), child('b', '2-3y', 'k8')];
    expect(guessChild(kids, 'shoes', 'k8')).toBe('b');
    expect(guessChild(kids, 'tops', '2-3y')).toBe('');
    expect(guessChild(kids, 'toys', '3y+')).toBe('');
  });
});

describe('sizeFitsCategory', () => {
  it('checks the scale for the category', () => {
    expect(sizeFitsCategory('tops', '2-3y')).toBe(true);
    expect(sizeFitsCategory('tops', 'k6')).toBe(false);
    expect(sizeFitsCategory('toys', '3y+')).toBe(true);
    expect(sizeFitsCategory('', '2-3y')).toBe(false);
  });
});
