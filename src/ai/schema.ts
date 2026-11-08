import { z } from 'zod';
import { CATEGORIES, CONDITIONS, SEASONS } from '../domain/options.ts';
import { CLOTHING_SIZES, SHOE_SIZES, TOY_AGES } from '../domain/sizes.ts';

const ids = <T extends { id: string }>(list: readonly T[]) => list.map((o) => o.id) as [string, ...string[]];

export const SUGGESTION_FIELDS = [
  'title',
  'category',
  'size',
  'seasons',
  'brand',
  'colour',
  'material',
  'condition',
  'description',
] as const;

/** What Claude returns for a photographed item. */
export const ItemSuggestionSchema = z.object({
  title: z.string().describe('Short listing-style name, e.g. "Navy padded coat with hood". No brand or size.'),
  category: z.enum(ids(CATEGORIES)),
  sizeOnLabel: z
    .string()
    .nullable()
    .describe('Size text exactly as printed on a visible label or box, e.g. "2-3 Y", "EU 24". Null if none visible.'),
  size: z
    .enum([...ids(CLOTHING_SIZES), ...ids(SHOE_SIZES), ...ids(TOY_AGES)])
    .nullable()
    .describe('Best matching size id for the category. Only if a label or box shows it; otherwise null.'),
  seasons: z.array(z.enum(ids(SEASONS))).describe('Seasons it suits. All four for year-round items and toys.'),
  brand: z.string().nullable().describe('Only if visible on a label, tag or logo.'),
  colour: z.string().nullable().describe('Main colour(s) in plain British English, e.g. "Navy and white".'),
  material: z.string().nullable().describe('Only if visible on a care label, or obvious (e.g. "Wood").'),
  condition: z.enum(ids(CONDITIONS)),
  conditionNotes: z
    .string()
    .nullable()
    .describe('Visible wear, stains, bobbling, fading, missing parts. Null if none seen.'),
  description: z
    .string()
    .describe('2–3 factual sentences for a resale listing: what it is, notable features, style. British English.'),
  uncertain: z
    .array(z.enum(SUGGESTION_FIELDS))
    .describe('Fields that are guesses because the photos don\'t show them clearly.'),
});

export type ItemSuggestion = z.infer<typeof ItemSuggestionSchema>;
