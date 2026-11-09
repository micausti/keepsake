import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../App.tsx';
import { db } from '../db/db.ts';
import { createItem } from '../db/items.ts';
import { getSettings, saveSetting } from '../db/settings.ts';
import { emptyDraft } from '../domain/draft.ts';

let downloaded: File | undefined;

beforeEach(() => {
  downloaded = undefined;
  // jsdom has no share sheet, so saving falls back to a download link.
  URL.createObjectURL = vi.fn((blob: Blob) => {
    downloaded = blob as File;
    return 'blob:backup';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

const addItem = (title: string) => createItem({ ...emptyDraft([]), title, category: 'toys' }, []);

describe('Backup in Settings', () => {
  it('exports, then restores after changes', async () => {
    await addItem('Wooden train');
    render(<App />);
    await go('#/settings');
    const section = await screen.findByRole('region', { name: 'Backup' });
    expect(within(section).getByText('No backup yet.')).toBeDefined();

    fireEvent.click(within(section).getByRole('button', { name: 'Prepare backup' }));
    fireEvent.click(await within(section).findByRole('button', { name: 'Save backup file' }));
    expect(await within(section).findByText('✓ Backup saved.')).toBeDefined();
    expect(downloaded?.name).toMatch(/^keepsake-backup-.*\.zip$/);
    await waitFor(async () => expect((await getSettings()).lastBackupAt).toBeDefined());
    expect(await within(section).findByText(/Last backup: today/)).toBeDefined();

    // Lose the item, add another, then restore.
    await db.items.clear();
    await addItem('Kite');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.change(screen.getByTestId('restore-input'), { target: { files: [downloaded] } });
    expect(await within(section).findByText(/✓ Restored 1 items/)).toBeDefined();
    expect(confirm.mock.calls[0]?.[0]).toContain('will REPLACE everything');
    expect((await db.items.toArray()).map((i) => i.title)).toEqual(['Wooden train']);
    confirm.mockRestore();
  });

  it('does nothing if restore is cancelled, and explains bad files', async () => {
    await addItem('Kite');
    render(<App />);
    await go('#/settings');
    const section = await screen.findByRole('region', { name: 'Backup' });
    fireEvent.change(screen.getByTestId('restore-input'), {
      target: { files: [new File(['nope'], 'photo.zip', { type: 'application/zip' })] },
    });
    expect((await within(section).findByRole('alert')).textContent).toBe('That isn’t a Keepsake backup file.');
    expect(await db.items.count()).toBe(1);
  });
});

describe('Backup reminder on Home', () => {
  it('appears when there are items and no recent backup', async () => {
    render(<App />);
    expect(screen.queryByRole('region', { name: 'Time for a backup' })).toBeNull();
    await addItem('Kite');
    expect(await screen.findByRole('region', { name: 'Time for a backup' })).toBeDefined();
    expect(screen.getByText(/You haven’t backed up yet/)).toBeDefined();
  });

  it('stays away for a week after a backup', async () => {
    await addItem('Kite');
    await saveSetting('lastBackupAt', new Date(Date.now() - 3 * 86_400_000).toISOString());
    render(<App />);
    await screen.findByRole('heading', { name: 'Keepsake' });
    expect(screen.queryByRole('region', { name: 'Time for a backup' })).toBeNull();

    await act(async () => saveSetting('lastBackupAt', new Date(Date.now() - 8 * 86_400_000).toISOString()));
    expect(await screen.findByText(/Your last backup was 8 days ago/)).toBeDefined();
  });
});
