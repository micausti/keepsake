import { parsePounds } from '../domain/money.ts';
import { PLATFORM_LABELS, type Condition, type ItemStatus, type Platform } from '../domain/options.ts';
import { formatPence } from '../domain/money.ts';
import type { ItemDraft } from '../domain/draft.ts';
import type { Item, ItemEvent, Photo } from '../domain/types.ts';
import { rotateJpeg } from '../photos/process.ts';
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

/** Validates a draft and turns it into a stored item (sale and photo fields are left out). */
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
  const photoRows = toPhotoRows(item.id, photos, timestamp);
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

function toPhotoRows(itemId: string, photos: NewPhoto[], timestamp: string): Photo[] {
  return photos.map((p) => ({
    id: newId(),
    itemId,
    takenAt: p.takenAt.toISOString(),
    blob: p.full,
    thumb: p.thumb,
    width: p.width,
    height: p.height,
    createdAt: timestamp,
  }));
}

/** Pence → "12.50" for the price field. */
const poundsText = (pence?: number) => (pence === undefined ? '' : (pence / 100).toFixed(2));

export function draftFromItem(item: Item): ItemDraft {
  return {
    title: item.title,
    category: item.category,
    childId: item.childId ?? '',
    size: item.size ?? '',
    seasons: [...item.seasons],
    brand: item.brand ?? '',
    colour: item.colour ?? '',
    material: item.material ?? '',
    description: item.description ?? '',
    condition: item.condition ?? '',
    conditionNotes: item.conditionNotes ?? '',
    status: item.status,
    storageLocation: item.storageLocation ?? '',
    pricePaid: poundsText(item.pricePaidPence),
  };
}

async function requireItem(id: string, database: KeepsakeDB): Promise<Item> {
  const item = await database.items.get(id);
  if (!item) throw new Error('Item not found');
  return item;
}

/**
 * Saves edits from the form. Sale details and the cover photo are kept, and
 * a change of status or condition is recorded on the timeline.
 */
export async function updateItem(id: string, draft: ItemDraft, database: KeepsakeDB = db): Promise<Item> {
  const timestamp = now();
  return database.transaction('rw', database.items, database.events, async () => {
    const existing = await requireItem(id, database);
    const edited = itemFromDraft(draft, id, timestamp);
    const item: Item = {
      ...edited,
      createdAt: existing.createdAt,
      coverPhotoId: existing.coverPhotoId,
      listPricePence: existing.listPricePence,
      listedOn: existing.listedOn,
      listedAt: existing.listedAt,
      salePricePence: existing.salePricePence,
      salePlatform: existing.salePlatform,
      soldAt: existing.soldAt,
    };
    await database.items.put(item);
    if (item.status !== existing.status) {
      await database.events.add({ id: newId(), itemId: id, at: timestamp, kind: 'status', status: item.status });
    }
    if (item.condition && item.condition !== existing.condition) {
      await database.events.add({
        id: newId(),
        itemId: id,
        at: timestamp,
        kind: 'condition',
        condition: item.condition,
        note: item.conditionNotes,
      });
    }
    return item;
  });
}

export interface ItemUpdate {
  condition?: Condition;
  note?: string;
  photos: NewPhoto[];
}

/**
 * Adds a dated entry to an item's timeline: new photos, a condition check
 * and/or a note. A new condition also becomes the item's current condition.
 */
export async function addUpdate(itemId: string, update: ItemUpdate, database: KeepsakeDB = db): Promise<ItemEvent> {
  const note = update.note?.trim() || undefined;
  if (!update.condition && !note && update.photos.length === 0) {
    throw new DraftError('Add a photo, a condition or a note.');
  }
  const timestamp = now();
  return database.transaction('rw', database.items, database.photos, database.events, async () => {
    const item = await requireItem(itemId, database);
    const photoRows = toPhotoRows(itemId, update.photos, timestamp);
    const event: ItemEvent = {
      id: newId(),
      itemId,
      at: timestamp,
      kind: update.condition ? 'condition' : note ? 'note' : 'photos',
      condition: update.condition,
      note,
      photoIds: photoRows.length ? photoRows.map((p) => p.id) : undefined,
    };
    await database.photos.bulkAdd(photoRows);
    await database.events.add(event);
    await database.items.put({
      ...item,
      condition: update.condition ?? item.condition,
      conditionNotes: update.condition ? note : item.conditionNotes,
      coverPhotoId: item.coverPhotoId ?? photoRows[0]?.id,
      updatedAt: timestamp,
    });
    return event;
  });
}

export async function setStatus(itemId: string, status: ItemStatus, database: KeepsakeDB = db): Promise<void> {
  const timestamp = now();
  await database.transaction('rw', database.items, database.events, async () => {
    const item = await requireItem(itemId, database);
    if (item.status === status) return;
    await database.items.put({ ...item, status, updatedAt: timestamp });
    await database.events.add({ id: newId(), itemId, at: timestamp, kind: 'status', status });
  });
}

export async function setCoverPhoto(itemId: string, photoId: string, database: KeepsakeDB = db): Promise<void> {
  await database.items.update(itemId, { coverPhotoId: photoId });
}

/** Deletes an item with all its photos and history. */
export async function deleteItem(itemId: string, database: KeepsakeDB = db): Promise<void> {
  await database.transaction('rw', database.items, database.photos, database.events, async () => {
    await database.photos.where('itemId').equals(itemId).delete();
    await database.events.where('itemId').equals(itemId).delete();
    await database.items.delete(itemId);
  });
}

/**
 * Passes an item to another child. It becomes "in use" if it fits them now,
 * otherwise it goes into storage until they grow into it.
 */
export async function handDown(
  itemId: string,
  toChildId: string,
  fitsNow: boolean,
  database: KeepsakeDB = db,
): Promise<void> {
  const timestamp = now();
  await database.transaction('rw', database.items, database.events, async () => {
    const item = await requireItem(itemId, database);
    if (item.childId === toChildId) return;
    const status: ItemStatus = fitsNow ? 'in_use' : 'storage';
    await database.items.put({ ...item, childId: toChildId, status, updatedAt: timestamp });
    await database.events.add({
      id: newId(),
      itemId,
      at: timestamp,
      kind: 'handdown',
      fromChildId: item.childId,
      toChildId,
      status,
    });
  });
}

/** Marks several items as outgrown at once, each with a timeline entry. */
export async function markOutgrown(itemIds: string[], database: KeepsakeDB = db): Promise<void> {
  for (const id of itemIds) await setStatus(id, 'outgrown', database);
}

const platformList = (platforms: Platform[]) => platforms.map((p) => PLATFORM_LABELS[p]).join(', ');

/** Records that an item is listed for sale, where and at what price. */
export async function markListed(
  itemId: string,
  listing: { platforms: Platform[]; pricePence?: number },
  database: KeepsakeDB = db,
): Promise<void> {
  if (!listing.platforms.length) throw new DraftError('Choose where it’s listed.');
  const timestamp = now();
  await database.transaction('rw', database.items, database.events, async () => {
    const item = await requireItem(itemId, database);
    await database.items.put({
      ...item,
      status: 'listed',
      listedOn: listing.platforms,
      listPricePence: listing.pricePence,
      listedAt: item.status === 'listed' ? item.listedAt : timestamp,
      updatedAt: timestamp,
    });
    const price = listing.pricePence !== undefined ? ` at ${formatPence(listing.pricePence)}` : '';
    await database.events.add({
      id: newId(),
      itemId,
      at: timestamp,
      kind: 'status',
      status: 'listed',
      note: `Listed on ${platformList(listing.platforms)}${price}`,
    });
  });
}

/** Records a sale. */
export async function markSold(
  itemId: string,
  sale: { platform: Platform; pricePence?: number },
  database: KeepsakeDB = db,
): Promise<void> {
  const timestamp = now();
  await database.transaction('rw', database.items, database.events, async () => {
    const item = await requireItem(itemId, database);
    await database.items.put({
      ...item,
      status: 'sold',
      salePlatform: sale.platform,
      salePricePence: sale.pricePence,
      soldAt: timestamp,
      listedOn: undefined,
      updatedAt: timestamp,
    });
    const price = sale.pricePence !== undefined ? ` for ${formatPence(sale.pricePence)}` : '';
    await database.events.add({
      id: newId(),
      itemId,
      at: timestamp,
      kind: 'status',
      status: 'sold',
      note: `Sold on ${PLATFORM_LABELS[sale.platform]}${price}`,
    });
  });
}

/** Takes an item off sale but keeps it ready to sell again. */
export async function unlist(itemId: string, database: KeepsakeDB = db): Promise<void> {
  const timestamp = now();
  await database.transaction('rw', database.items, database.events, async () => {
    const item = await requireItem(itemId, database);
    await database.items.put({ ...item, status: 'to_sell', listedOn: undefined, updatedAt: timestamp });
    await database.events.add({ id: newId(), itemId, at: timestamp, kind: 'status', status: 'to_sell', note: 'Taken off sale' });
  });
}

/** Turns a saved photo (and its thumbnail) a quarter turn clockwise. */
export async function rotatePhoto(photoId: string, database: KeepsakeDB = db): Promise<void> {
  const photo = await database.photos.get(photoId);
  if (!photo) throw new Error('Photo not found');
  const [full, thumb] = await Promise.all([rotateJpeg(photo.blob, 0.85), rotateJpeg(photo.thumb, 0.8)]);
  await database.photos.update(photoId, { blob: full.blob, thumb: thumb.blob, width: full.width, height: full.height });
}
