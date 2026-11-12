/**
 * Fixed option lists used across the app. Stored values are the stable `id`s;
 * labels are for display only and can be reworded without a migration.
 */

export interface Option<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
}

function labelsOf<Id extends string>(options: readonly Option<Id>[]): Record<Id, string> {
  return Object.fromEntries(options.map((o) => [o.id, o.label])) as Record<Id, string>;
}

// --- Status -----------------------------------------------------------------

export const ITEM_STATUSES = [
  { id: 'in_use', label: 'In use' },
  { id: 'outgrown', label: 'Outgrown' },
  { id: 'storage', label: 'In storage' },
  { id: 'hand_down', label: 'To hand down' },
  { id: 'to_sell', label: 'To sell' },
  { id: 'listed', label: 'Listed' },
  { id: 'sold', label: 'Sold' },
  { id: 'donated', label: 'Donated' },
  { id: 'lost', label: 'Lost' },
] as const satisfies readonly Option[];
export type ItemStatus = (typeof ITEM_STATUSES)[number]['id'];
export const STATUS_LABELS = labelsOf<ItemStatus>(ITEM_STATUSES);

// --- Condition --------------------------------------------------------------
// Matches Vinted's scale so listings in Phase 5 need no translation.

export const CONDITIONS = [
  { id: 'new_with_tags', label: 'New with tags' },
  { id: 'new_without_tags', label: 'New without tags' },
  { id: 'very_good', label: 'Very good' },
  { id: 'good', label: 'Good' },
  { id: 'satisfactory', label: 'Satisfactory' },
] as const satisfies readonly Option[];
export type Condition = (typeof CONDITIONS)[number]['id'];
export const CONDITION_LABELS = labelsOf<Condition>(CONDITIONS);

// --- Season -----------------------------------------------------------------

export const SEASONS = [
  { id: 'spring', label: 'Spring' },
  { id: 'summer', label: 'Summer' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'winter', label: 'Winter' },
] as const satisfies readonly Option[];
export type Season = (typeof SEASONS)[number]['id'];
export const SEASON_LABELS = labelsOf<Season>(SEASONS);

// --- Sale platform ----------------------------------------------------------

export const PLATFORMS = [
  { id: 'vinted', label: 'Vinted' },
  { id: 'ebay', label: 'eBay' },
  { id: 'facebook', label: 'Facebook Marketplace' },
  { id: 'depop', label: 'Depop' },
  { id: 'other', label: 'Other' },
] as const satisfies readonly Option[];
export type Platform = (typeof PLATFORMS)[number]['id'];
export const PLATFORM_LABELS = labelsOf<Platform>(PLATFORMS);

// --- Category ---------------------------------------------------------------

/** Which size scale applies to a category. */
export type SizeSystem = 'clothing' | 'shoes' | 'toy_age' | 'none';

export interface CategoryOption extends Option {
  readonly group: 'Clothes' | 'Shoes' | 'Toys & play' | 'Other';
  readonly sizeSystem: SizeSystem;
}

export const CATEGORIES = [
  { id: 'tops', label: 'Tops & T-shirts', group: 'Clothes', sizeSystem: 'clothing' },
  { id: 'jumpers', label: 'Jumpers & hoodies', group: 'Clothes', sizeSystem: 'clothing' },
  { id: 'trousers', label: 'Trousers & leggings', group: 'Clothes', sizeSystem: 'clothing' },
  { id: 'shorts', label: 'Shorts', group: 'Clothes', sizeSystem: 'clothing' },
  { id: 'dresses', label: 'Dresses & skirts', group: 'Clothes', sizeSystem: 'clothing' },
  { id: 'bodysuits', label: 'Bodysuits & sleepsuits', group: 'Clothes', sizeSystem: 'clothing' },
  { id: 'outfits', label: 'Outfits & dungarees', group: 'Clothes', sizeSystem: 'clothing' },
  { id: 'outerwear', label: 'Coats & jackets', group: 'Clothes', sizeSystem: 'clothing' },
  { id: 'nightwear', label: 'Pyjamas & nightwear', group: 'Clothes', sizeSystem: 'clothing' },
  { id: 'swimwear', label: 'Swimwear', group: 'Clothes', sizeSystem: 'clothing' },
  { id: 'underwear', label: 'Underwear & socks', group: 'Clothes', sizeSystem: 'clothing' },
  { id: 'school_uniform', label: 'School uniform', group: 'Clothes', sizeSystem: 'clothing' },
  { id: 'fancy_dress', label: 'Fancy dress', group: 'Clothes', sizeSystem: 'clothing' },
  // Kept as 'accessories' so existing items stay put; now sized by age like other clothes.
  { id: 'accessories', label: 'Hats, gloves & scarves', group: 'Clothes', sizeSystem: 'clothing' },
  { id: 'shoes', label: 'Shoes', group: 'Shoes', sizeSystem: 'shoes' },
  { id: 'wellies_boots', label: 'Wellies & boots', group: 'Shoes', sizeSystem: 'shoes' },
  { id: 'toys', label: 'Toys', group: 'Toys & play', sizeSystem: 'toy_age' },
  { id: 'games_puzzles', label: 'Games & puzzles', group: 'Toys & play', sizeSystem: 'toy_age' },
  { id: 'books', label: 'Books', group: 'Toys & play', sizeSystem: 'toy_age' },
  { id: 'outdoor', label: 'Outdoor & ride-ons', group: 'Toys & play', sizeSystem: 'toy_age' },
  { id: 'bags_accessories', label: 'Bags & other accessories', group: 'Other', sizeSystem: 'none' },
  { id: 'baby_gear', label: 'Baby gear', group: 'Other', sizeSystem: 'none' },
  { id: 'other', label: 'Other', group: 'Other', sizeSystem: 'none' },
] as const satisfies readonly CategoryOption[];
export type CategoryId = (typeof CATEGORIES)[number]['id'];
export const CATEGORY_LABELS = labelsOf<CategoryId>(CATEGORIES);

export function categoryById(id: CategoryId): CategoryOption {
  const found = CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown category: ${id}`);
  return found;
}
