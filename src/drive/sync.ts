/**
 * Backs up to, and restores from, a "Keepsake" folder in Google Drive.
 *
 * Each photo (and its thumbnail) is its own file, uploaded once and only sent
 * again if it changes (rotated or made smaller). keepsake-data.json holds
 * every record, in the same shape as a backup file. So after the first time,
 * a backup is a few new photos and one small file.
 */
import { db, now, type KeepsakeDB } from '../db/db.ts';
import type { Photo } from '../domain/types.ts';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupError,
  checkBackupJson,
  markBackedUp,
  readRecords,
  replaceRecords,
  type BackupJson,
  type BackupSummary,
  type PhotoRecord,
} from '../backup/backup.ts';
import type { DriveClient, DriveFile } from './client.ts';

export type DriveApi = Pick<DriveClient, 'folder' | 'list' | 'upload' | 'download' | 'remove'>;

export const DATA_FILE = 'keepsake-data.json';
const photoName = (id: string) => `photo-${id}.jpg`;
const thumbName = (id: string) => `thumb-${id}.jpg`;
const isPhotoFile = (name: string) => /^(photo|thumb)-.+\.jpg$/.test(name);

/** Changes when a photo is rotated or re-saved, so it gets uploaded again. */
const signature = (p: Photo) => `${p.blob.size}:${p.thumb.size}:${p.width}x${p.height}`;

/**
 * Drive has a backup with many more items than this phone: probably a new or
 * reset phone, where backing up would replace a good backup with an empty one.
 */
export class DriveConflictError extends Error {
  constructor(
    readonly driveItems: number,
    readonly localItems: number,
  ) {
    super(`Google Drive has a backup with ${driveItems} items, but this phone has ${localItems}.`);
  }
}

/** A photo's details without the pictures, as listed in the data file. */
function photoRecord(photo: Photo): PhotoRecord {
  const record: Partial<Photo> & PhotoRecord = { ...photo, file: photoName(photo.id), thumbFile: thumbName(photo.id) };
  delete record.blob;
  delete record.thumb;
  return record;
}

export interface SyncProgress {
  stage: 'checking' | 'photos' | 'saving' | 'tidying';
  done: number;
  total: number;
}

async function pool<T>(tasks: T[], limit: number, run: (task: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await run(tasks[next++] as T);
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

export async function backupToDrive(
  drive: DriveApi,
  appVersion: string,
  options: { database?: KeepsakeDB; force?: boolean; onProgress?: (p: SyncProgress) => void } = {},
): Promise<BackupSummary> {
  const { database = db, force = false, onProgress } = options;
  onProgress?.({ stage: 'checking', done: 0, total: 0 });
  const folder = await drive.folder();
  const existing = new Map((await drive.list(folder)).map((f) => [f.name, f]));
  const records = await readRecords(database);

  const driveItems = Number(existing.get(DATA_FILE)?.appProperties?.items ?? 0);
  if (!force && driveItems > 0 && records.items.length < driveItems / 2) {
    throw new DriveConflictError(driveItems, records.items.length);
  }

  // Photos first, so the data file never lists a photo that isn't there yet.
  const toUpload = records.photos.filter((p) => {
    const sig = signature(p);
    return (
      existing.get(photoName(p.id))?.appProperties?.sig !== sig ||
      existing.get(thumbName(p.id))?.appProperties?.sig !== sig
    );
  });
  let done = 0;
  onProgress?.({ stage: 'photos', done, total: toUpload.length });
  await pool(toUpload, 3, async (p) => {
    // Read each photo fresh, one at a time, rather than holding them all.
    const photo = (await database.photos.get(p.id)) ?? p;
    const sig = signature(photo);
    const props = { kind: 'photo', photoId: photo.id, sig };
    await drive.upload(photoName(photo.id), photo.blob, folder, props, existing.get(photoName(photo.id))?.id);
    await drive.upload(thumbName(photo.id), photo.thumb, folder, props, existing.get(thumbName(photo.id))?.id);
    done += 1;
    onProgress?.({ stage: 'photos', done, total: toUpload.length });
  });

  onProgress?.({ stage: 'saving', done: 0, total: 0 });
  const exportedAt = now();
  const json: BackupJson = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    appVersion,
    children: records.children,
    items: records.items,
    events: records.events,
    photos: records.photos.map(photoRecord),
    settings: records.settings,
  };
  await drive.upload(
    DATA_FILE,
    new Blob([JSON.stringify(json)], { type: 'application/json' }),
    folder,
    { kind: 'data', items: String(records.items.length), photos: String(records.photos.length), exportedAt },
    existing.get(DATA_FILE)?.id,
  );

  // Only now that the new data file is saved: remove photos that were deleted here.
  const wanted = new Set(json.photos.flatMap((p) => [p.file, p.thumbFile]));
  const stale = [...existing.values()].filter((f) => isPhotoFile(f.name) && !wanted.has(f.name));
  onProgress?.({ stage: 'tidying', done: 0, total: stale.length });
  await pool(stale, 3, (f) => drive.remove(f.id));

  await markBackedUp(exportedAt, database);
  await database.settings.put({ key: 'driveLastSyncAt', value: exportedAt });
  return { exportedAt, children: json.children.length, items: json.items.length, photos: json.photos.length };
}

export interface DriveBackupInfo {
  summary: BackupSummary;
  restore: (onProgress?: (done: number, total: number) => void) => Promise<void>;
}

/** Finds and checks the backup in Drive without changing anything here. Null if there isn't one. */
export async function openDriveBackup(drive: DriveApi, database: KeepsakeDB = db): Promise<DriveBackupInfo | null> {
  const folder = await drive.folder();
  const files = new Map<string, DriveFile>((await drive.list(folder)).map((f) => [f.name, f]));
  const dataFile = files.get(DATA_FILE);
  if (!dataFile) return null;
  let json: BackupJson;
  try {
    json = JSON.parse(await (await drive.download(dataFile.id, 'application/json')).text()) as BackupJson;
  } catch {
    throw new BackupError('The backup in Google Drive couldn’t be read.');
  }
  checkBackupJson(json);
  const missing = json.photos.find((p) => !files.has(p.file) || !files.has(p.thumbFile));
  if (missing) throw new BackupError('The backup in Google Drive is incomplete: some photos are missing.');

  return {
    summary: {
      exportedAt: json.exportedAt,
      children: json.children.length,
      items: json.items.length,
      photos: json.photos.length,
    },
    restore: async (onProgress) => {
      // Photos one at a time, each stored as soon as it arrives, so the phone
      // never holds more than one in memory. Records are only replaced once
      // every photo is safely stored; until then nothing here is lost.
      let done = 0;
      onProgress?.(done, json.photos.length);
      await pool(json.photos, 3, async ({ file, thumbFile, ...rest }) => {
        const [blob, thumb] = await Promise.all([
          drive.download((files.get(file) as DriveFile).id, 'image/jpeg'),
          drive.download((files.get(thumbFile) as DriveFile).id, 'image/jpeg'),
        ]);
        await database.photos.put({ ...rest, blob, thumb });
        done += 1;
        onProgress?.(done, json.photos.length);
      });
      await replaceRecords(json, [], database);
      await database.settings.put({ key: 'driveLastSyncAt', value: json.exportedAt });
    },
  };
}
