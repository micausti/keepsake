import { Dexie, type EntityTable } from 'dexie';
import type { Child, Item, ItemEvent, Photo } from '../domain/types.ts';

export interface SettingRow {
  key: string;
  value: unknown;
}

export class KeepsakeDB extends Dexie {
  children!: EntityTable<Child, 'id'>;
  items!: EntityTable<Item, 'id'>;
  photos!: EntityTable<Photo, 'id'>;
  events!: EntityTable<ItemEvent, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name = 'keepsake') {
    super(name);
    // Only indexed fields are listed. Never edit a released version: add a new
    // `this.version(n + 1)` with an upgrade function instead.
    this.version(1).stores({
      children: 'id, name',
      items: 'id, childId, category, status, size, updatedAt, *seasons, [childId+category]',
      photos: 'id, itemId, takenAt',
      events: 'id, itemId, at',
      settings: 'key',
    });
  }
}

export const db = new KeepsakeDB();

export const newId = (): string => crypto.randomUUID();
export const now = (): string => new Date().toISOString();
