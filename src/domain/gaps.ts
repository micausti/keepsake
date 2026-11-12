import { CATEGORIES, categoryById, type CategoryId, type ItemStatus, type Season } from './options.ts';
import { CLOTHING_SIZES, SHOE_SIZES, clothingSizeForAge, type SizeOption } from './sizes.ts';
import type { Child, Item } from './types.ts';

/** How many of each thing a child needs per size. 0 hides the category. */
export type GapTargets = Partial<Record<CategoryId, number>>;

export const DEFAULT_TARGETS: GapTargets = {
  tops: 7,
  jumpers: 3,
  trousers: 5,
  shorts: 3,
  dresses: 0,
  bodysuits: 0,
  outfits: 0,
  outerwear: 1,
  nightwear: 3,
  swimwear: 1,
  underwear: 0,
  school_uniform: 0,
  fancy_dress: 0,
  accessories: 0,
  shoes: 2,
  wellies_boots: 1,
};

/** Categories that gaps can be worked out for (they have a clothing or shoe size). */
export const GAP_CATEGORIES = CATEGORIES.filter((c) => c.sizeSystem === 'clothing' || c.sizeSystem === 'shoes');

/** Statuses for things that can still be worn by the child they belong to. */
const WEARABLE: readonly ItemStatus[] = ['in_use', 'storage', 'hand_down'];
/** Statuses for a sibling's things that could be handed down. */
const PASSABLE: readonly ItemStatus[] = ['outgrown', 'hand_down', 'storage'];

export const targetFor = (targets: GapTargets, category: CategoryId) =>
  targets[category] ?? DEFAULT_TARGETS[category] ?? 0;

type Scale = 'clothing' | 'shoes';
const SCALES: Record<Scale, readonly SizeOption[]> = { clothing: CLOTHING_SIZES, shoes: SHOE_SIZES };

/** The child's current size on a scale (clothing falls back to their age). */
export function currentSize(child: Child, scale: Scale): string | undefined {
  if (scale === 'shoes') return child.shoeSize;
  return child.clothingSize ?? (child.birthDate ? clothingSizeForAge(child.birthDate) : undefined);
}

/** Current size and the one after it. */
export function nowAndNext(child: Child, scale: Scale): SizeOption[] {
  const list = SCALES[scale];
  const index = list.findIndex((s) => s.id === currentSize(child, scale));
  if (index === -1) return [];
  return list.slice(index, index + 2);
}

const fitsSeason = (item: Item, season?: Season) =>
  !season || item.seasons.length === 0 || item.seasons.includes(season);

export interface GapCell {
  size: SizeOption;
  /** Wearable items the child already has (theirs or unassigned). */
  have: number;
  /** Siblings' outgrown or stored items in this size that could be handed down. */
  handMeDowns: number;
  target: number;
  state: 'ok' | 'low' | 'none';
}

export interface GapRow {
  category: CategoryId;
  label: string;
  cells: GapCell[];
}

export function computeGaps(
  child: Child,
  items: Item[],
  targets: GapTargets,
  season?: Season,
): GapRow[] {
  const rows: GapRow[] = [];
  for (const category of GAP_CATEGORIES) {
    const target = targetFor(targets, category.id);
    if (target <= 0) continue;
    const sizes = nowAndNext(child, category.sizeSystem as Scale);
    if (!sizes.length) continue;
    const inCategory = items.filter((i) => i.category === category.id && fitsSeason(i, season));
    const cells = sizes.map((size): GapCell => {
      const inSize = inCategory.filter((i) => i.size === size.id);
      const have = inSize.filter(
        (i) => WEARABLE.includes(i.status) && (!i.childId || i.childId === child.id),
      ).length;
      const handMeDowns = inSize.filter(
        (i) => i.childId && i.childId !== child.id && PASSABLE.includes(i.status),
      ).length;
      return { size, have, handMeDowns, target, state: have >= target ? 'ok' : have === 0 ? 'none' : 'low' };
    });
    rows.push({ category: category.id, label: category.label, cells });
  }
  return rows;
}

export interface HandDownSuggestion {
  item: Item;
  to: Child;
  /** Fits them now, or in their next size. */
  when: 'now' | 'next';
}

/** A sibling's outgrown or stored items that fit another child now or next. */
export function handDownSuggestions(children: Child[], items: Item[]): HandDownSuggestion[] {
  const suggestions: HandDownSuggestion[] = [];
  for (const item of items) {
    if (!item.childId || !item.size || !PASSABLE.includes(item.status)) continue;
    const system = categoryById(item.category).sizeSystem;
    if (system !== 'clothing' && system !== 'shoes') continue;
    for (const child of children) {
      if (child.id === item.childId) continue;
      const [now, next] = nowAndNext(child, system);
      if (now?.id === item.size) suggestions.push({ item, to: child, when: 'now' });
      else if (next?.id === item.size) suggestions.push({ item, to: child, when: 'next' });
    }
  }
  return suggestions.sort((a, b) => (a.when === b.when ? a.item.title.localeCompare(b.item.title) : a.when === 'now' ? -1 : 1));
}

/** The child's items still marked "in use" in sizes smaller than they wear now. */
export function likelyOutgrown(child: Child, items: Item[]): Item[] {
  return items.filter((item) => {
    if (item.childId !== child.id || item.status !== 'in_use' || !item.size) return false;
    const system = categoryById(item.category).sizeSystem;
    if (system !== 'clothing' && system !== 'shoes') return false;
    const list = SCALES[system];
    const current = list.findIndex((s) => s.id === currentSize(child, system));
    const own = list.findIndex((s) => s.id === item.size);
    return current !== -1 && own !== -1 && own < current;
  });
}
