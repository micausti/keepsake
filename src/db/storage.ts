import { db, type KeepsakeDB } from './db.ts';

/**
 * Browsers may evict site data under storage pressure (Safari also clears
 * data for sites not visited in a while). Asking for persistent storage
 * protects the inventory; installed home-screen apps are usually granted it.
 */

export interface StorageStatus {
  supported: boolean;
  persisted: boolean;
  usageBytes?: number;
  quotaBytes?: number;
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage?.persisted) return { supported: false, persisted: false };
  const [persisted, estimate] = await Promise.all([
    storage.persisted(),
    storage.estimate ? storage.estimate() : Promise.resolve(undefined),
  ]);
  return {
    supported: true,
    persisted,
    usageBytes: estimate?.usage,
    quotaBytes: estimate?.quota,
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return 'unknown';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export interface AppUsage {
  bytes: number;
  photos: number;
  items: number;
}

/**
 * What Keepsake itself is storing, added up from the data. Safari's own
 * estimate leaves out most photos, so it can't be trusted for this.
 */
export async function appUsage(database: KeepsakeDB = db): Promise<AppUsage> {
  let bytes = 0;
  let photos = 0;
  // One photo at a time: reading a size doesn't load the picture.
  await database.photos.each((p) => {
    photos += 1;
    bytes += p.blob.size + p.thumb.size;
  });
  const text = (rows: unknown[]) => new Blob([JSON.stringify(rows)]).size;
  const [items, events, children] = await Promise.all([
    database.items.toArray(),
    database.events.toArray(),
    database.children.toArray(),
  ]);
  bytes += text(items) + text(events) + text(children);
  return { bytes, photos, items: items.length };
}
