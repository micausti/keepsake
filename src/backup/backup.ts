import { db, now, type KeepsakeDB, type SettingRow } from '../db/db.ts';
import type { Child, Item, ItemEvent, Photo } from '../domain/types.ts';
import { readZip, writeZip, ZipError, type ZipEntry } from './zip.ts';

/**
 * Backup file: a ZIP containing keepsake.json (all records) and every photo
 * as a JPEG under photos/. The API key is never included.
 */
export const BACKUP_FORMAT = 'keepsake-backup';
export const BACKUP_VERSION = 1;

/** Settings that stay on this device and never go into a backup. */
export const DEVICE_ONLY_SETTINGS = new Set(['apiKey', 'lastBackupAt', 'driveAccount', 'driveLastSyncAt']);

export type PhotoRecord = Omit<Photo, 'blob' | 'thumb'> & { file: string; thumbFile: string };

export interface BackupJson {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  appVersion: string;
  children: Child[];
  items: Item[];
  events: ItemEvent[];
  photos: PhotoRecord[];
  settings: SettingRow[];
}

export interface BackupSummary {
  exportedAt: string;
  children: number;
  items: number;
  photos: number;
}

export class BackupError extends Error {}

export const backupFileName = (date = new Date()) =>
  `keepsake-backup-${date.toISOString().slice(0, 10)}.zip`;

/** Every record, read in one go so they're consistent with each other. */
export async function readRecords(database: KeepsakeDB = db) {
  const [children, items, events, photos, settings] = await database.transaction(
    'r',
    [database.children, database.items, database.events, database.photos, database.settings],
    () =>
      Promise.all([
        database.children.toArray(),
        database.items.toArray(),
        database.events.toArray(),
        database.photos.toArray(),
        database.settings.toArray(),
      ]),
  );
  return { children, items, events, photos, settings: settings.filter((s) => !DEVICE_ONLY_SETTINGS.has(s.key)) };
}

/**
 * Replaces every record with a backup's. Photos already stored under the
 * backup's ids are kept (`photos` may be given separately or have been put
 * one at a time beforehand); any other photos are removed.
 */
export async function replaceRecords(json: BackupJson, photos: Photo[], database: KeepsakeDB = db): Promise<void> {
  const keepIds = new Set(json.photos.map((p) => p.id));
  await database.transaction(
    'rw',
    [database.children, database.items, database.events, database.photos, database.settings],
    async () => {
      await Promise.all([database.children.clear(), database.items.clear(), database.events.clear()]);
      const stale = (await database.photos.toCollection().primaryKeys()).filter((id) => !keepIds.has(id));
      await database.photos.bulkDelete(stale);
      // Keep this device's key, backup date and Drive connection; replace the rest.
      const keep = (await database.settings.toArray()).filter((s) => DEVICE_ONLY_SETTINGS.has(s.key));
      await database.settings.clear();
      await database.children.bulkAdd(json.children);
      await database.items.bulkAdd(json.items);
      await database.events.bulkAdd(json.events);
      await database.photos.bulkPut(photos);
      await database.settings.bulkPut([...json.settings.filter((s) => !DEVICE_ONLY_SETTINGS.has(s.key)), ...keep]);
    },
  );
}

/** Builds the backup file. Call markBackedUp once it has actually been saved. */
export async function exportBackup(
  appVersion: string,
  database: KeepsakeDB = db,
  onProgress?: (done: number, total: number) => void,
): Promise<{ file: File; summary: BackupSummary }> {
  const exportedAt = now();
  const { children, items, events, photos, settings } = await readRecords(database);

  const photoEntries: ZipEntry[] = [];
  const photoRecords: PhotoRecord[] = photos.map(({ blob, thumb, ...rest }) => {
    const file = `photos/${rest.id}.jpg`;
    const thumbFile = `photos/thumbs/${rest.id}.jpg`;
    const date = new Date(rest.takenAt);
    photoEntries.push({ name: file, data: blob, date }, { name: thumbFile, data: thumb, date });
    return { ...rest, file, thumbFile };
  });

  const json: BackupJson = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    appVersion,
    children,
    items,
    events,
    photos: photoRecords,
    settings,
  };

  const zip = await writeZip(
    [{ name: 'keepsake.json', data: JSON.stringify(json, null, 1) }, ...photoEntries],
    // Report progress in photos (each has a full-size copy and a thumbnail).
    onProgress && ((done, total) => onProgress(Math.floor(Math.max(0, done - 1) / 2), Math.floor((total - 1) / 2))),
  );
  return {
    file: new File([zip], backupFileName(new Date(exportedAt)), { type: 'application/zip' }),
    summary: { exportedAt, children: children.length, items: items.length, photos: photos.length },
  };
}

/** Records a successful backup, for the weekly reminder. */
export async function markBackedUp(at: string, database: KeepsakeDB = db): Promise<void> {
  await database.settings.put({ key: 'lastBackupAt', value: at });
}

export interface OpenedBackup {
  summary: BackupSummary;
  restore: (database?: KeepsakeDB) => Promise<void>;
}

/** Reads and checks a backup file without changing anything. */
/** Checks parsed backup JSON is one this version can restore. */
export function checkBackupJson(json: BackupJson): void {
  if (json?.format !== BACKUP_FORMAT) throw new BackupError('That isn’t a Keepsake backup.');
  if (json.version > BACKUP_VERSION) {
    throw new BackupError('This backup is from a newer version of Keepsake. Update the app first.');
  }
}

export async function openBackup(file: Blob): Promise<OpenedBackup> {
  let json: BackupJson;
  let zip: Awaited<ReturnType<typeof readZip>>;
  try {
    zip = await readZip(file);
    json = JSON.parse(await zip.text('keepsake.json')) as BackupJson;
  } catch (error) {
    throw new BackupError(
      error instanceof ZipError && error.message.includes('re-compressed')
        ? error.message
        : 'That isn’t a Keepsake backup file.',
    );
  }
  if (json?.format !== BACKUP_FORMAT) throw new BackupError('That isn’t a Keepsake backup file.');
  checkBackupJson(json);
  const missing = json.photos.find((p) => !zip.names.includes(p.file) || !zip.names.includes(p.thumbFile));
  if (missing) throw new BackupError('This backup is incomplete: some photos are missing.');

  return {
    summary: {
      exportedAt: json.exportedAt,
      children: json.children.length,
      items: json.items.length,
      photos: json.photos.length,
    },
    restore: async (database: KeepsakeDB = db) => {
      // Locate every photo before touching the database, so a bad file changes nothing.
      // They stay as slices of the backup file (not copies in memory); the
      // database reads each one as it's stored.
      const photos: Photo[] = await Promise.all(
        json.photos.map(async ({ file: path, thumbFile, ...rest }) => ({
          ...rest,
          blob: await zip.blob(path, 'image/jpeg'),
          thumb: await zip.blob(thumbFile, 'image/jpeg'),
        })),
      );
      await replaceRecords(json, photos, database);
    },
  };
}

const DAY = 24 * 60 * 60 * 1000;

/** Days since the last backup, or null if there's never been one. */
export function daysSinceBackup(lastBackupAt: string | undefined, today = new Date()): number | null {
  if (!lastBackupAt) return null;
  return Math.floor((today.getTime() - new Date(lastBackupAt).getTime()) / DAY);
}

export const BACKUP_REMINDER_DAYS = 7;

export function backupDue(lastBackupAt: string | undefined, itemCount: number, today = new Date()): boolean {
  if (itemCount === 0) return false;
  const days = daysSinceBackup(lastBackupAt, today);
  return days === null || days >= BACKUP_REMINDER_DAYS;
}
