import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  STATUS_LABELS,
  categoryById,
  type CategoryId,
  type Condition,
  type ItemStatus,
  type Season,
} from './options.ts';
import { sizeLabel, sizesFor } from './sizes.ts';
import type { Child, Item } from './types.ts';

/** Statuses for items that have left the house (or gone missing). */
export const GONE_STATUSES: readonly ItemStatus[] = ['sold', 'donated', 'lost'];

export type StatusFilter = ItemStatus | 'active' | '';
export type SortOrder = 'recent' | 'name' | 'size';

export interface ItemQuery {
  text: string;
  /** '' = anyone, 'none' = unassigned. */
  childId: string;
  category: CategoryId | '';
  size: string;
  /** 'active' = everything except sold, donated and lost; '' = everything. */
  status: StatusFilter;
  season: Season | '';
  condition: Condition | '';
  sort: SortOrder;
}

export const DEFAULT_QUERY: ItemQuery = {
  text: '',
  childId: '',
  category: '',
  size: '',
  status: 'active',
  season: '',
  condition: '',
  sort: 'recent',
};

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** All the text a search can match for an item. */
export function searchText(item: Item, children: Child[]): string {
  const system = categoryById(item.category).sizeSystem;
  return normalise(
    [
      item.title,
      item.brand,
      item.colour,
      item.material,
      item.description,
      item.conditionNotes,
      item.storageLocation,
      CATEGORY_LABELS[item.category],
      STATUS_LABELS[item.status],
      item.condition && CONDITION_LABELS[item.condition],
      sizeLabel(system, item.size),
      children.find((c) => c.id === item.childId)?.name,
    ]
      .filter(Boolean)
      .join(' \n '),
  );
}

export function matchesQuery(item: Item, query: ItemQuery, haystack: string): boolean {
  if (query.childId === 'none' ? item.childId : query.childId && item.childId !== query.childId) return false;
  if (query.category && item.category !== query.category) return false;
  if (query.size && item.size !== query.size) return false;
  if (query.status === 'active' ? GONE_STATUSES.includes(item.status) : query.status && item.status !== query.status)
    return false;
  if (query.season && !item.seasons.includes(query.season)) return false;
  if (query.condition && item.condition !== query.condition) return false;
  const terms = normalise(query.text).split(/\s+/).filter(Boolean);
  return terms.every((term) => haystack.includes(term));
}

function sizeRank(item: Item): number {
  if (!item.size) return Number.MAX_SAFE_INTEGER;
  const index = sizesFor(categoryById(item.category).sizeSystem).findIndex((s) => s.id === item.size);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function filterItems(items: Item[], query: ItemQuery, children: Child[]): Item[] {
  const results = items.filter((item) => matchesQuery(item, query, searchText(item, children)));
  const byName = (a: Item, b: Item) => a.title.localeCompare(b.title, 'en-GB');
  switch (query.sort) {
    case 'name':
      return results.sort(byName);
    case 'size':
      return results.sort((a, b) => sizeRank(a) - sizeRank(b) || byName(a, b));
    case 'recent':
      return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

/** Number of filters set, not counting search text and sort order. */
export function activeFilterCount(query: ItemQuery): number {
  return (['childId', 'category', 'size', 'season', 'condition'] as const).filter((k) => query[k]).length +
    (query.status === DEFAULT_QUERY.status ? 0 : 1);
}
