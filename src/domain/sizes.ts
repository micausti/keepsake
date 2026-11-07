/**
 * UK children's size scales. Stored values are the `id`s; each list is in
 * ascending order, so list position can be used to compare sizes (Phase 4).
 */
import type { Option, SizeSystem } from './options.ts';

export type SizeOption = Option;

export const CLOTHING_SIZES: readonly SizeOption[] = [
  { id: 'tiny_baby', label: 'Tiny baby' },
  { id: 'newborn', label: 'Newborn' },
  { id: '0-3m', label: '0–3 months' },
  { id: '3-6m', label: '3–6 months' },
  { id: '6-9m', label: '6–9 months' },
  { id: '9-12m', label: '9–12 months' },
  { id: '12-18m', label: '12–18 months' },
  { id: '18-24m', label: '18–24 months' },
  ...Array.from({ length: 14 }, (_, i) => ({
    id: `${i + 2}-${i + 3}y`,
    label: `${i + 2}–${i + 3} years`,
  })),
];

const half = (n: number) => (Number.isInteger(n) ? String(n) : `${Math.floor(n)}½`);

/** UK infant/kids sizes 0–13½, then junior sizes 1–7. */
export const SHOE_SIZES: readonly SizeOption[] = [
  ...Array.from({ length: 28 }, (_, i) => i / 2).map((n) => ({
    id: `k${n}`,
    label: `UK ${half(n)}`,
  })),
  ...Array.from({ length: 13 }, (_, i) => 1 + i / 2).map((n) => ({
    id: `j${n}`,
    label: `UK ${half(n)} (junior)`,
  })),
];

export const TOY_AGES: readonly SizeOption[] = [
  { id: '0m+', label: 'Birth +' },
  { id: '3m+', label: '3 months +' },
  { id: '6m+', label: '6 months +' },
  { id: '12m+', label: '12 months +' },
  { id: '18m+', label: '18 months +' },
  ...[2, 3, 4, 5, 6, 7, 8, 10, 12, 14].map((y) => ({ id: `${y}y+`, label: `${y} years +` })),
];

export function sizesFor(system: SizeSystem): readonly SizeOption[] {
  switch (system) {
    case 'clothing':
      return CLOTHING_SIZES;
    case 'shoes':
      return SHOE_SIZES;
    case 'toy_age':
      return TOY_AGES;
    case 'none':
      return [];
  }
}

export function sizeLabel(system: SizeSystem, id: string | undefined): string | undefined {
  if (!id) return undefined;
  return sizesFor(system).find((s) => s.id === id)?.label ?? id;
}

/** Whole months between an ISO date (YYYY-MM-DD) and `today`. */
export function ageInMonths(birthDate: string, today = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${birthDate}`);
  let months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
  if (today.getDate() < d) months -= 1;
  return Math.max(0, months);
}

export function formatAge(birthDate: string, today = new Date()): string {
  const months = ageInMonths(birthDate, today);
  if (months < 24) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'}`;
}

/**
 * The UK clothing size that matches a child's age, e.g. 2y 4m → "2–3 years".
 * A starting point only: plenty of children wear a size up or down.
 */
export function clothingSizeForAge(birthDate: string, today = new Date()): string {
  const months = ageInMonths(birthDate, today);
  if (months < 1) return 'newborn';
  const bands: [number, string][] = [
    [3, '0-3m'],
    [6, '3-6m'],
    [9, '6-9m'],
    [12, '9-12m'],
    [18, '12-18m'],
    [24, '18-24m'],
  ];
  for (const [limit, id] of bands) if (months < limit) return id;
  const years = Math.min(Math.floor(months / 12), 15);
  return `${years}-${years + 1}y`;
}
