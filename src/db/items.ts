import { parsePounds } from '../domain/money.ts';
import type { ItemDraft } from '../domain/draft.ts';
import type { Item, ItemEvent, Photo } from '../domain/types.ts';
import { db, newId, now, type KeepsakeDB } from './db.ts';

export interface NewPhoto {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  takenAt: Date;
}

export class DraftError extends Error {}

const opt = (value: string) => value.trim() || undefined;

/** Validates a draft and turns it into a stored item. */
export function itemFromDraft(draft: ItemDraft, id: string, timestamp: string): Item {
  const title = draft.title.trim();
  if (!title) throw new DraftError('Give the item a name.');
  if (!draft.category) throw new DraftError('Choose a category.');
  const pricePaidPence = draft.pricePaid.trim() ? parsePounds(draft.pricePaid) : undefined;
  if (draft.pricePaid.trim() && pricePaidPence === undefined) {
    throw new DraftError('Price paid should look like 12.50');
  }
  return {
    id,
    title,
    category: draft.category,
    childId: opt(draft.childId),
    size: opt(draft.size),
    seasons: draft.seasons,
    brand: opt(draft.brand),
    colour: opt(draft.colour),
    material: opt(draft.material),
    description: opt(draft.description),
    condition: draft.condition || undefined,
    conditionNotes: opt(draft.conditionNotes),
    status: draft.status,
    storageLocation: opt(draft.storageLocation),
    pricePaidPence,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Saves a new item with its photos and a first timeline entry, all or nothing. */
export async function createItem(draft: ItemDraft, photos: NewPhoto[], database: KeepsakeDB = db): Promise<Item> {
  const timestamp = now();
  const item = itemFromDraft(draft, newId(), timestamp);
  const photoRows: Photo[] = photos.map((p) => ({
    id: newId(),
    itemId: item.id,
    takenAt: p.takenAt.toISOString(),
    blob: p.full,
    thumb: p.thumb,
    width: p.width,
    height: p.height,
    createdAt: timestamp,
  }));
  item.coverPhotoId = photoRows[0]?.id;
  const event: ItemEvent = {
    id: newId(),
    itemId: item.id,
    at: timestamp,
    kind: 'created',
    condition: item.condition,
    status: item.status,
    note: item.conditionNotes,
    photoIds: photoRows.map((p) => p.id),
  };

  await database.transaction('rw', database.items, database.photos, database.events, async () => {
    await database.items.add(item);
    await database.photos.bulkAdd(photoRows);
    await database.events.add(event);
  });
  return item;
}

export function recentItems(limit = 20, database: KeepsakeDB = db): Promise<Item[]> {
  return database.items.orderBy('updatedAt').reverse().limit(limit).toArray();
}

/** Storage locations already used, for autocomplete. */
export async function knownStorageLocations(database: KeepsakeDB = db): Promise<string[]> {
  const locations = new Set<string>();
  await database.items.each((item) => {
    if (item.storageLocation) locations.add(item.storageLocation);
  });
  return [...locations].sort((a, b) => a.localeCompare(b));
}
