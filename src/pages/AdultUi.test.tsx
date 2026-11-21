import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../App.tsx';
import { addChild } from '../db/children.ts';
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

const add = (d: Partial<ItemDraft>) => createItem({ ...emptyDraft([]), title: 'x', category: 'tops', ...d }, []);

describe('Adults in Settings', () => {
  it('adds me as an adult with just a name', async () => {
    render(<App />);
    await go('#/settings');
    fireEvent.click(await screen.findByRole('button', { name: 'Add an adult (e.g. you)' }));
    expect(screen.queryByLabelText('Clothing size now')).toBeNull();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Michelle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add adult' }));

    const people = screen.getByRole('region', { name: 'People' });
    expect(await within(people).findByText('Michelle')).toBeDefined();
    expect(within(people).getByText('Adult')).toBeDefined();
    expect((await db.children.toArray())[0]).toMatchObject({ name: 'Michelle', kind: 'adult' });
  });
});

describe('Adult items', () => {
  it('takes a free-text size, and clears it when switched to a child', async () => {
    const me = await addChild({ name: 'Michelle', kind: 'adult' });
    const layne = await addChild({ name: 'Layne', clothingSize: '2-3y' });
    const item = await add({ title: 'Black jeans', category: 'trousers', childId: me.id, size: 'W30 L32' });
    render(<App />);
    await go(`#/item/${item.id}/edit`);

    const size = (await screen.findByLabelText('Size')) as HTMLInputElement;
    expect(size.tagName).toBe('INPUT');
    expect(size.value).toBe('W30 L32');
    expect(screen.getByLabelText('Who')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Who'), { target: { value: layne.id } });
    const kidSize = screen.getByLabelText('Size') as HTMLSelectElement;
    expect(kidSize.tagName).toBe('SELECT');
    expect(kidSize.value).toBe('');
  });

  it('shows only my things with the Who filter', async () => {
    const me = await addChild({ name: 'Michelle', kind: 'adult' });
    const layne = await addChild({ name: 'Layne', clothingSize: '2-3y' });
    await add({ title: 'Black jeans', category: 'trousers', childId: me.id, size: 'W30 L32' });
    await add({ title: 'Dino top', size: '2-3y', childId: layne.id });
    render(<App />);
    await go('#/items');
    fireEvent.click(await screen.findByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('Who'), { target: { value: me.id } });
    expect(await screen.findByRole('link', { name: 'Black jeans' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Dino top' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('1 item of 2');
  });

  it('keeps adults out of Gaps and passing on', async () => {
    const me = await addChild({ name: 'Michelle', kind: 'adult' });
    const layne = await addChild({ name: 'Layne', clothingSize: '2-3y' });
    await addChild({ name: 'Lucile', clothingSize: '5-6y' });
    const jeans = await add({ title: 'Black jeans', category: 'trousers', childId: me.id, status: 'outgrown' });
    const top = await add({ title: 'Dino top', size: '2-3y', childId: layne.id });
    render(<App />);

    await go('#/gaps');
    expect(await screen.findByRole('region', { name: 'Layne' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Michelle' })).toBeNull();

    await go(`#/item/${jeans.id}`);
    expect(await screen.findByRole('heading', { name: 'Black jeans' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Pass/ })).toBeNull();

    await go(`#/item/${top.id}`);
    expect(await screen.findByRole('button', { name: 'Pass to Lucile' })).toBeDefined();
  });
});
