import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../App.tsx';
import { db } from '../db/db.ts';
import { createItem } from '../db/items.ts';
import { emptyDraft, type ItemDraft } from '../domain/draft.ts';

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
});

async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

const add = (d: Partial<ItemDraft>) => createItem({ ...emptyDraft([]), title: 'x', category: 'shorts', ...d }, []);
const tile = (name: string) => within(screen.getByRole('list', { name: 'Items' })).getByRole('button', { name });

describe('Bulk update from Items', () => {
  it('selects the filtered items, updates them, and can undo', async () => {
    const a = await add({ title: 'Blue shorts' });
    const b = await add({ title: 'Red shorts' });
    const top = await add({ title: 'Striped top', category: 'tops' });
    render(<App />);
    await go('#/items');

    fireEvent.click(await screen.findByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'shorts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));

    // Tiles tick instead of opening.
    fireEvent.click(tile('Blue shorts'));
    expect(tile('Blue shorts').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Select all (2)' }));
    const bar = screen.getByRole('region', { name: 'Selection' });
    expect(bar.textContent).toContain('2 selected');

    fireEvent.click(within(bar).getByRole('button', { name: 'Update…' }));
    const sheet = screen.getByRole('dialog', { name: 'Update 2 items' });
    const submit = within(sheet).getByRole('button', { name: 'Update 2 items' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(sheet).getByLabelText('Storage location'), { target: { value: 'Loft box 3' } });
    fireEvent.change(within(sheet).getByLabelText('Status'), { target: { value: 'storage' } });
    fireEvent.click(submit);

    const done = await screen.findByRole('status', { name: 'Updated' });
    expect(done.textContent).toContain('Updated 2 items');
    await waitFor(async () =>
      expect((await db.items.bulkGet([a.id, b.id, top.id])).map((i) => [i?.status, i?.storageLocation])).toEqual([
        ['storage', 'Loft box 3'],
        ['storage', 'Loft box 3'],
        ['in_use', undefined],
      ]),
    );
    // Back to normal tiles that open items.
    expect(within(screen.getByRole('list', { name: 'Items' })).getAllByRole('link')).toHaveLength(2);

    fireEvent.click(within(done).getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.items.get(a.id))?.status).toBe('in_use'));
    expect((await db.items.get(b.id))?.storageLocation).toBeUndefined();
  });

  it('can be cancelled without changing anything', async () => {
    const a = await add({ title: 'Blue shorts' });
    render(<App />);
    await go('#/items');
    fireEvent.click(await screen.findByRole('button', { name: 'Select' }));
    fireEvent.click(tile('Blue shorts'));
    fireEvent.click(screen.getByRole('button', { name: 'Update…' }));
    const sheet = screen.getByRole('dialog', { name: 'Update 1 item' });
    fireEvent.change(within(sheet).getByLabelText('Status'), { target: { value: 'sold' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect((await db.items.get(a.id))?.status).toBe('in_use');
  });
});

describe('Keep status and location for the next item', () => {
  it('starts the next item with the same status and location until switched off', async () => {
    render(<App />);
    await go('#/add');
    fireEvent.click(await screen.findByRole('button', { name: 'Fill in myself' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Blue shorts' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'shorts' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'storage' } });
    fireEvent.change(screen.getByLabelText('Storage location'), { target: { value: 'Loft box 3' } });
    fireEvent.click(screen.getByLabelText('Keep status and location for the next item'));
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Add another item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fill in myself' }));
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('storage');
    expect((screen.getByLabelText('Storage location') as HTMLInputElement).value).toBe('Loft box 3');
    expect((screen.getByLabelText('Keep status and location for the next item') as HTMLInputElement).checked).toBe(true);

    // Switch it off: the item after starts fresh.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Red shorts' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'shorts' } });
    fireEvent.click(screen.getByLabelText('Keep status and location for the next item'));
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add another item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fill in myself' }));
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('in_use');
    expect((screen.getByLabelText('Storage location') as HTMLInputElement).value).toBe('');

    expect((await db.items.toArray()).map((i) => [i.title, i.status, i.storageLocation])).toEqual(
      expect.arrayContaining([
        ['Blue shorts', 'storage', 'Loft box 3'],
        ['Red shorts', 'storage', 'Loft box 3'],
      ]),
    );
  });
});
