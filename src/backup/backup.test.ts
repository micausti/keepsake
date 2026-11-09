// @vitest-environment node
// (Node keeps Blobs intact through the in-memory IndexedDB; jsdom's Blob does not.)
import { describe, expect, it } from 'vitest';
import { addChild } from '../db/children.ts';
import { db } from '../db/db.ts';
import { addUpdate, createItem } from '../db/items.ts';
import { getSettings, saveSetting } from '../db/settings.ts';
import { emptyDraft } from '../domain/draft.ts';
import { backupDue, daysSinceBackup, exportBackup, markBackedUp, openBackup } from './backup.ts';
import { readZip, writeZip } from './zip.ts';

const photo = (text: string) => ({
  full: new Blob([`full-${text}`], { type: 'image/jpeg' }),
  thumb: new Blob([`thumb-${text}`], { type: 'image/jpeg' }),
  width: 2000,
  height: 1500,
  takenAt: new Date(2025, 5, 14),
});

async function seed() {
  const arlo = await addChild({ name: 'Arlo', clothingSize: '2-3y' });
  const coat = await createItem(
    { ...emptyDraft([]), title: 'Coat', category: 'outerwear', childId: arlo.id, condition: 'good' },
    [photo('a'), photo('b')],
  );
  await addUpdate(coat.id, { note: 'Still fits', photos: [] });
  await saveSetting('apiKey', 'sk-ant-secret-key');
  await saveSetting('model', 'claude-opus-5-5');
  await saveSetting('gapTargets', { tops: 4 });
  return { arlo, coat };
}

const blobText = async (b: Blob) => new TextDecoder().decode(await b.arrayBuffer());

describe('exportBackup', () => {
  it('writes records and photos, never the API key', async () => {
    await seed();
    const { file, summary } = await exportBackup('abc1234');

    expect(file.name).toMatch(/^keepsake-backup-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(summary).toMatchObject({ children: 1, items: 1, photos: 2 });
    const zip = await readZip(file);
    expect(zip.names.filter((n) => n.startsWith('photos/'))).toHaveLength(4);
    const json = await zip.text('keepsake.json');
    expect(json).not.toContain('sk-ant-secret-key');
    expect(JSON.parse(json)).toMatchObject({ format: 'keepsake-backup', version: 1, appVersion: 'abc1234' });
    expect((await getSettings()).lastBackupAt).toBeUndefined(); // not until it's saved
    await markBackedUp(summary.exportedAt);
    expect((await getSettings()).lastBackupAt).toBe(summary.exportedAt);
  });
});

describe('restore', () => {
  it('replaces everything with the backup but keeps this device’s key', async () => {
    const { coat } = await seed();
    const { file } = await exportBackup('v1');

    // Change things after the backup.
    await createItem({ ...emptyDraft([]), title: 'Extra', category: 'tops' }, []);
    await db.children.clear();
    await saveSetting('apiKey', 'sk-ant-new-key');
    await saveSetting('model', 'claude-haiku-5-5');

    const backup = await openBackup(file);
    expect(backup.summary).toMatchObject({ children: 1, items: 1, photos: 2 });
    await backup.restore();

    expect((await db.items.toArray()).map((i) => i.title)).toEqual(['Coat']);
    expect((await db.children.toArray()).map((c) => c.name)).toEqual(['Arlo']);
    expect(await db.events.where('itemId').equals(coat.id).count()).toBe(2);
    const photos = await db.photos.where('itemId').equals(coat.id).toArray();
    expect(await Promise.all(photos.map((p) => blobText(p.blob)))).toEqual(
      expect.arrayContaining(['full-a', 'full-b']),
    );
    expect(await blobText(photos[0]?.thumb ?? new Blob())).toMatch(/^thumb-/);
    const settings = await getSettings();
    expect(settings).toMatchObject({ apiKey: 'sk-ant-new-key', model: 'claude-opus-5-5', gapTargets: { tops: 4 } });
  });

  it('rejects files that are not backups and changes nothing', async () => {
    await seed();
    await expect(openBackup(new Blob(['hello']))).rejects.toThrow('isn’t a Keepsake backup');
    await expect(openBackup(await writeZip([{ name: 'keepsake.json', data: '{"format":"other"}' }]))).rejects.toThrow(
      'isn’t a Keepsake backup',
    );
    const newer = await writeZip([
      { name: 'keepsake.json', data: JSON.stringify({ format: 'keepsake-backup', version: 99, photos: [] }) },
    ]);
    await expect(openBackup(newer)).rejects.toThrow('newer version');
    expect(await db.items.count()).toBe(1);
  });

  it('rejects a backup with missing photos', async () => {
    await seed();
    const { file } = await exportBackup('v1');
    const zip = await readZip(file);
    const broken = await writeZip([{ name: 'keepsake.json', data: await zip.text('keepsake.json') }]);
    await expect(openBackup(broken)).rejects.toThrow('some photos are missing');
  });
});

describe('reminder', () => {
  const today = new Date('2026-11-09T12:00:00Z');
  it('counts days and is due weekly once there are items', () => {
    expect(daysSinceBackup(undefined, today)).toBeNull();
    expect(daysSinceBackup('2026-11-02T13:00:00Z', today)).toBe(6);
    expect(backupDue(undefined, 0, today)).toBe(false);
    expect(backupDue(undefined, 3, today)).toBe(true);
    expect(backupDue('2026-11-04T12:00:00Z', 3, today)).toBe(false);
    expect(backupDue('2026-11-02T12:00:00Z', 3, today)).toBe(true);
  });
});
