import type { GapTargets } from '../domain/gaps.ts';
import { db, type KeepsakeDB } from './db.ts';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

export interface Settings {
  /** Anthropic API key. Stored only in this browser's IndexedDB. */
  apiKey?: string;
  /** Model id used for AI auto-fill. */
  model: string;
  /** Wanted number of items per category per size; missing ones use the defaults. */
  gapTargets?: GapTargets;
  /** When the last backup file was made. */
  lastBackupAt?: string;
}

const DEFAULTS: Settings = { model: DEFAULT_MODEL };

export async function getSettings(database: KeepsakeDB = db): Promise<Settings> {
  const rows = await database.settings.toArray();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Settings>;
  return { ...DEFAULTS, ...stored };
}

export async function saveSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K] | undefined,
  database: KeepsakeDB = db,
): Promise<void> {
  const trimmed = typeof value === 'string' ? value.trim() : value;
  if (trimmed === undefined || trimmed === '') await database.settings.delete(key);
  else await database.settings.put({ key, value: trimmed });
}

/** Light sanity check; the real test is calling the API. */
export function looksLikeApiKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim());
}

/** "sk-ant-api03-…AbCd" – enough to recognise a key without revealing it. */
export function maskApiKey(key: string): string {
  return key.length <= 16 ? '••••' : `${key.slice(0, 12)}…${key.slice(-4)}`;
}
