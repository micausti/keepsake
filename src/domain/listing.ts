import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  categoryById,
  type CategoryId,
  type Condition,
  type Platform,
} from './options.ts';
import { sizeLabel } from './sizes.ts';
import type { Item } from './types.ts';

export type ListingPlatform = Exclude<Platform, 'other'>;
export const LISTING_PLATFORMS: readonly ListingPlatform[] = ['vinted', 'ebay', 'facebook', 'depop'];

interface PlatformRules {
  /** Max title length; null when the platform has no separate title (Depop). */
  titleLimit: number | null;
  /** How the platform words each condition. */
  condition: Record<Condition, string>;
  hashtags: boolean;
}

export const PLATFORM_RULES: Record<ListingPlatform, PlatformRules> = {
  vinted: {
    titleLimit: 100,
    condition: {
      new_with_tags: 'New with tags',
      new_without_tags: 'New without tags',
      very_good: 'Very good',
      good: 'Good',
      satisfactory: 'Satisfactory',
    },
    hashtags: false,
  },
  ebay: {
    titleLimit: 80,
    condition: {
      new_with_tags: 'New with tags',
      new_without_tags: 'New without tags',
      very_good: 'Pre-owned',
      good: 'Pre-owned',
      satisfactory: 'Pre-owned',
    },
    hashtags: false,
  },
  facebook: {
    titleLimit: 100,
    condition: {
      new_with_tags: 'New',
      new_without_tags: 'New',
      very_good: 'Used – like new',
      good: 'Used – good',
      satisfactory: 'Used – fair',
    },
    hashtags: false,
  },
  depop: {
    titleLimit: null,
    condition: {
      new_with_tags: 'Brand new',
      new_without_tags: 'Like new',
      very_good: 'Used – excellent',
      good: 'Used – good',
      satisfactory: 'Used – fair',
    },
    hashtags: true,
  },
};

export interface Listing {
  title?: string;
  description: string;
  /** Value for the platform's condition picker. */
  condition?: string;
  size?: string;
  brand?: string;
  colour?: string;
}

/** Short size for titles: "2-3 years", "UK 6"; nothing for toys. */
function titleSize(item: Item): string | undefined {
  const system = categoryById(item.category).sizeSystem;
  if (system !== 'clothing' && system !== 'shoes') return undefined;
  return sizeLabel(system, item.size)?.replace(/–/g, '-');
}

/** Size as written in the description and size field. */
function listingSize(item: Item): string | undefined {
  const system = categoryById(item.category).sizeSystem;
  const label = sizeLabel(system, item.size);
  if (!label) return undefined;
  return system === 'toy_age' ? `Age ${label}` : label;
}

/** Cuts at a word boundary so the title fits. */
export function fitTitle(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit + 1);
  const space = cut.lastIndexOf(' ');
  return (space > limit * 0.6 ? cut.slice(0, space) : clean.slice(0, limit)).replace(/[\s,–-]+$/, '');
}

function buildTitle(item: Item): string {
  const brand = item.brand && !item.title.toLowerCase().includes(item.brand.toLowerCase()) ? item.brand : '';
  const size = titleSize(item);
  return [brand, item.title, size && `, ${size}`].filter(Boolean).join(' ').replace(' ,', ',');
}

const TAG_WORDS: Partial<Record<CategoryId, string>> = {
  tops: 'kidstops',
  jumpers: 'kidsjumper',
  trousers: 'kidstrousers',
  shorts: 'kidsshorts',
  dresses: 'girlsdress',
  bodysuits: 'babyclothes',
  outfits: 'kidsoutfit',
  outerwear: 'kidscoat',
  nightwear: 'kidspyjamas',
  swimwear: 'kidsswimwear',
  school_uniform: 'schooluniform',
  fancy_dress: 'fancydress',
  shoes: 'kidsshoes',
  wellies_boots: 'kidswellies',
  toys: 'kidstoys',
  games_puzzles: 'kidsgames',
  books: 'kidsbooks',
  outdoor: 'outdoortoys',
  baby_gear: 'babygear',
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Up to 5 Depop-style hashtags from brand, category, colour and a general tag. */
export function hashtags(item: Item): string[] {
  const group = categoryById(item.category).group;
  const tags = [
    item.brand && slug(item.brand),
    TAG_WORDS[item.category],
    item.colour && slug(item.colour.split(/[\s,]+/)[0] ?? ''),
    group === 'Toys & play' ? 'toys' : group === 'Other' ? 'baby' : 'kidswear',
    'preloved',
  ].filter((t): t is string => !!t && t.length > 1);
  return [...new Set(tags)].slice(0, 5).map((t) => `#${t}`);
}

export function buildListing(item: Item, platform: ListingPlatform): Listing {
  const rules = PLATFORM_RULES[platform];
  const size = listingSize(item);
  const conditionLine = item.condition
    ? `${CONDITION_LABELS[item.condition]}${item.conditionNotes ? `. ${item.conditionNotes.replace(/\.$/, '')}` : ''}.`
    : item.conditionNotes;

  const facts = [
    size && `Size: ${size}`,
    item.brand && `Brand: ${item.brand}`,
    item.colour && `Colour: ${item.colour}`,
    item.material && `Material: ${item.material}`,
    conditionLine && `Condition: ${conditionLine}`,
  ].filter(Boolean);

  const title = buildTitle(item);
  const paragraphs = [
    rules.titleLimit === null ? title : undefined,
    item.description?.trim() || `${CATEGORY_LABELS[item.category]}.`,
    facts.map((f) => `• ${f}`).join('\n'),
    rules.hashtags ? hashtags(item).join(' ') : undefined,
  ].filter(Boolean);

  return {
    title: rules.titleLimit === null ? undefined : fitTitle(title, rules.titleLimit),
    description: paragraphs.join('\n\n'),
    condition: item.condition ? rules.condition[item.condition] : undefined,
    size,
    brand: item.brand,
    colour: item.colour,
  };
}
