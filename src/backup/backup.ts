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
const DEVICE_ONLY_SETTINGS = new Set(['apiKey', 'lastBackupAt']);

type PhotoRecord = Omit<Photo, 'blob' | 'thumb'> & { file: string; thumbFile: string };

interface BackupJson {
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

/** Builds the backup file. Call markBackedUp once it has actually been saved. */
export async function exportBackup(
  appVersion: string,
  database: KeepsakeDB = db,
): Promise<{ file: File; summary: BackupSummary }> {
  const exportedAt = now();
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
    settings: settings.filter((s) => !DEVICE_ONLY_SETTINGS.has(s.key)),
  };

  const zip = await writeZip([{ name: 'keepsake.json', data: JSON.stringify(json, null, 1) }, ...photoEntries]);
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
  if (json.format !== BACKUP_FORMAT) throw new BackupError('That isn’t a Keepsake backup file.');
  if (json.version > BACKUP_VERSION) {
    throw new BackupError('This backup is from a newer version of Keepsake. Update the app first.');
  }
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
      // Read every photo before touching the database, so a bad file changes nothing.
      const photos: Photo[] = await Promise.all(
        json.photos.map(async ({ file: path, thumbFile, ...rest }) => ({
          ...rest,
          blob: new Blob([await (await zip.blob(path)).arrayBuffer()], { type: 'image/jpeg' }),
          thumb: new Blob([await (await zip.blob(thumbFile)).arrayBuffer()], { type: 'image/jpeg' }),
        })),
      );
      await database.transaction(
        'rw',
        [database.children, database.items, database.events, database.photos, database.settings],
        async () => {
          await Promise.all([
            database.children.clear(),
            database.items.clear(),
            database.events.clear(),
            database.photos.clear(),
          ]);
          // Keep this device's key and backup date; replace the rest.
          const keep = (await database.settings.toArray()).filter((s) => DEVICE_ONLY_SETTINGS.has(s.key));
          await database.settings.clear();
          await database.children.bulkAdd(json.children);
          await database.items.bulkAdd(json.items);
          await database.events.bulkAdd(json.events);
          await database.photos.bulkAdd(photos);
          await database.settings.bulkPut([
            ...json.settings.filter((s) => !DEVICE_ONLY_SETTINGS.has(s.key)),
            ...keep,
          ]);
        },
      );
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
