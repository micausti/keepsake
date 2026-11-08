import type { ItemSuggestion } from '../ai/schema.ts';
import { categoryById, type CategoryId, type Condition, type ItemStatus, type Season } from './options.ts';
import { sizesFor } from './sizes.ts';
import type { Child } from './types.ts';

/** The editable form state for a new item. Prices are kept as typed text. */
export interface ItemDraft {
  title: string;
  category: CategoryId | '';
  childId: string;
  size: string;
  seasons: Season[];
  brand: string;
  colour: string;
  material: string;
  description: string;
  condition: Condition | '';
  conditionNotes: string;
  status: ItemStatus;
  storageLocation: string;
  pricePaid: string;
}

export const emptyDraft = (children: Child[]): ItemDraft => ({
  title: '',
  category: '',
  childId: children.length === 1 ? (children[0]?.id ?? '') : '',
  size: '',
  seasons: [],
  brand: '',
  colour: '',
  material: '',
  description: '',
  condition: '',
  conditionNotes: '',
  status: 'in_use',
  storageLocation: '',
  pricePaid: '',
});

/** Is `size` on the scale for `category`? */
export function sizeFitsCategory(category: CategoryId | '', size: string): boolean {
  if (!category || !size) return false;
  return sizesFor(categoryById(category).sizeSystem).some((s) => s.id === size);
}

/**
 * Guesses which child an item belongs to: the only child, or the one whose
 * current size matches the item's size.
 */
export function guessChild(children: Child[], category: CategoryId, size: string | null): string {
  if (children.length === 1) return children[0]?.id ?? '';
  if (!size) return '';
  const system = categoryById(category).sizeSystem;
  const matches = children.filter((c) =>
    system === 'clothing' ? c.clothingSize === size : system === 'shoes' ? c.shoeSize === size : false,
  );
  return matches.length === 1 ? (matches[0]?.id ?? '') : '';
}

export function draftFromSuggestion(s: ItemSuggestion, children: Child[], base: ItemDraft): ItemDraft {
  const category = s.category as CategoryId;
  const size = s.size && sizeFitsCategory(category, s.size) ? s.size : '';
  const notes = [s.conditionNotes, s.sizeOnLabel && !size ? `Label says size ${s.sizeOnLabel}` : null]
    .filter(Boolean)
    .join('. ');
  return {
    ...base,
    title: s.title,
    category,
    size,
    childId: base.childId || guessChild(children, category, size || null),
    seasons: [...new Set(s.seasons as Season[])],
    brand: s.brand ?? '',
    colour: s.colour ?? '',
    material: s.material ?? '',
    description: s.description,
    condition: s.condition as Condition,
    conditionNotes: notes,
  };
}
