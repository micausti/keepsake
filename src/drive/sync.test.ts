// @vitest-environment node
// (Node keeps Blobs intact through the in-memory IndexedDB; jsdom's Blob does not.)
import { beforeEach, describe, expect, it } from 'vitest';
import { addChild } from '../db/children.ts';
import { db } from '../db/db.ts';
import { createItem, deleteItem } from '../db/items.ts';
import { getSettings, saveSetting } from '../db/settings.ts';
import { emptyDraft } from '../domain/draft.ts';
import type { DriveFile } from './client.ts';
import { DATA_FILE, DriveConflictError, backupToDrive, openDriveBackup, type DriveApi } from './sync.ts';

/** An in-memory Drive that records what was uploaded. */
class FakeDrive implements DriveApi {
  files = new Map<string, DriveFile & { data: Blob }>();
  uploads: string[] = [];
  private nextId = 1;

  async folder() {
    return 'folder-1';
  }
  async list() {
    return [...this.files.values()].map(({ id, name, appProperties }) => ({ id, name, appProperties }));
  }
  async upload(name: string, data: Blob, _folder: string, appProperties: Record<string, string>, existingId?: string) {
    this.uploads.push(name);
    const id = existingId ?? `file-${this.nextId++}`;
    this.files.set(id, { id, name, appProperties, data });
    return id;
  }
  async download(id: string, type?: string) {
    const file = this.files.get(id);
    if (!file) throw new Error('missing');
    return new Blob([await file.data.arrayBuffer()], { type });
  }
  async remove(id: string) {
    this.files.delete(id);
  }
  names() {
    return [...this.files.values()].map((f) => f.name).sort();
  }
}

const photo = (text: string) => ({
  full: new Blob([`full-${text}`], { type: 'image/jpeg' }),
  thumb: new Blob([`thumb-${text}`], { type: 'image/jpeg' }),
  width: 1600,
  height: 1200,
  takenAt: new Date(2025, 5, 14),
});

async function clearAll() {
  await Promise.all([db.children.clear(), db.items.clear(), db.events.clear(), db.photos.clear(), db.settings.clear()]);
}

async function seed() {
  const arlo = await addChild({ name: 'Arlo', clothingSize: '2-3y' });
  const coat = await createItem(
    { ...emptyDraft([]), title: 'Coat', category: 'outerwear', childId: arlo.id },
    [photo('a'), photo('b')],
  );
  const top = await createItem({ ...emptyDraft([]), title: 'Top', category: 'tops' }, [photo('c')]);
  await saveSetting('apiKey', 'sk-ant-secret-key');
  return { coat, top };
}

/** Fails the test if the value is missing. */
function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('missing');
  return value;
}

const text = async (b: Blob) => new TextDecoder().decode(await b.arrayBuffer());

beforeEach(clearAll);

describe('backupToDrive', () => {
  it('uploads every photo, thumbnail and the data file, but never the API key', async () => {
    await seed();
    const drive = new FakeDrive();
    const summary = await backupToDrive(drive, 'abc1234');
    expect(summary).toMatchObject({ items: 2, photos: 3, children: 1 });
    expect(drive.names().filter((n) => n.startsWith('photo-'))).toHaveLength(3);
    expect(drive.names().filter((n) => n.startsWith('thumb-'))).toHaveLength(3);
    const data = [...drive.files.values()].find((f) => f.name === DATA_FILE);
    expect(data?.appProperties).toMatchObject({ kind: 'data', items: '2', photos: '3' });
    const json = await text(must(data).data);
    expect(json).not.toContain('sk-ant-secret-key');
    expect((await getSettings()).lastBackupAt).toBe(summary.exportedAt);
  });

  it('only uploads photos that are new or changed next time, and removes deleted ones', async () => {
    const { coat, top } = await seed();
    const drive = new FakeDrive();
    await backupToDrive(drive, 'v1');

    drive.uploads = [];
    await backupToDrive(drive, 'v1');
    expect(drive.uploads).toEqual([DATA_FILE]);

    // Rotate one photo (changes its size), delete an item, add a new one.
    const coatPhotos = await db.photos.where('itemId').equals(coat.id).toArray();
    await db.photos.update(must(coatPhotos[0]).id, { width: 1200, height: 1600 });
    await deleteItem(top.id);
    await createItem({ ...emptyDraft([]), title: 'Hat', category: 'tops' }, [photo('d')]);
    drive.uploads = [];
    await backupToDrive(drive, 'v1');
    expect(drive.uploads.filter((n) => n !== DATA_FILE)).toHaveLength(4); // 2 photos × (full + thumb)
    expect(drive.names().filter((n) => n.startsWith('photo-'))).toHaveLength(3);
  });

  it('won’t replace a bigger backup from a new or emptied phone unless asked', async () => {
    await seed();
    const drive = new FakeDrive();
    await backupToDrive(drive, 'v1');
    await clearAll();
    await expect(backupToDrive(drive, 'v1')).rejects.toBeInstanceOf(DriveConflictError);
    expect(drive.names().filter((n) => n.startsWith('photo-'))).toHaveLength(3); // untouched
    await backupToDrive(drive, 'v1', { force: true });
    expect(drive.names()).toEqual([DATA_FILE]);
  });
});

describe('openDriveBackup', () => {
  it('returns null when there is no backup yet', async () => {
    expect(await openDriveBackup(new FakeDrive())).toBeNull();
  });

  it('restores everything onto an empty phone, keeping this phone’s API key', async () => {
    await seed();
    const drive = new FakeDrive();
    await backupToDrive(drive, 'v1');
    const before = (await db.photos.toArray()).map((p) => p.id).sort();
    await clearAll();
    await saveSetting('apiKey', 'sk-ant-this-phone');

    const backup = await openDriveBackup(drive);
    expect(backup?.summary).toMatchObject({ items: 2, photos: 3 });
    const progress: string[] = [];
    await must(backup).restore((d, t) => progress.push(`${d}/${t}`));
    expect(progress.at(-1)).toBe('3/3');
    expect((await db.items.toArray()).map((i) => i.title).sort()).toEqual(['Coat', 'Top']);
    const photos = await db.photos.toArray();
    expect(photos.map((p) => p.id).sort()).toEqual(before);
    expect(await text(must(photos.find((p) => p.id === before[0])).blob)).toMatch(/^full-/);
    expect(must(photos[0]).blob.type).toBe('image/jpeg');
    expect((await getSettings()).apiKey).toBe('sk-ant-this-phone');
  });

  it('replaces this phone’s items and photos with the backup’s', async () => {
    await seed();
    const drive = new FakeDrive();
    await backupToDrive(drive, 'v1');
    await createItem({ ...emptyDraft([]), title: 'Extra', category: 'tops' }, [photo('x')]);
    await must(await openDriveBackup(drive)).restore();
    expect((await db.items.toArray()).map((i) => i.title).sort()).toEqual(['Coat', 'Top']);
    expect(await db.photos.count()).toBe(3);
  });

  it('changes nothing if the backup is missing photos', async () => {
    await seed();
    const drive = new FakeDrive();
    await backupToDrive(drive, 'v1');
    const victim = must([...drive.files.values()].find((f) => f.name.startsWith('photo-')));
    drive.files.delete(victim.id);
    await expect(openDriveBackup(drive)).rejects.toThrow(/incomplete/);
  });
});

