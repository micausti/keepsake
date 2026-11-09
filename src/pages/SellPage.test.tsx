import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../App.tsx';
import { db } from '../db/db.ts';
import { createItem } from '../db/items.ts';
import { emptyDraft } from '../domain/draft.ts';

const writeText = vi.fn(async () => {});

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

const seed = () =>
  createItem(
    {
      ...emptyDraft([]),
      title: 'Navy padded coat',
      category: 'outerwear',
      size: '2-3y',
      brand: 'Boden',
      condition: 'good',
      description: 'Warm coat.',
      status: 'to_sell',
      pricePaid: '40',
    },
    [{ full: new Blob(['f']), thumb: new Blob(['t']), width: 10, height: 10, takenAt: new Date(2025, 0, 1) }],
  );

describe('Sell page', () => {
  it('shows a listing per platform and copies fields', async () => {
    const item = await seed();
    render(<App />);
    await go(`#/item/${item.id}/sell`);

    const vinted = await screen.findByRole('region', { name: 'Vinted listing' });
    expect(within(vinted).getByText('Boden Navy padded coat, 2-3 years')).toBeDefined();
    expect(within(vinted).getByText('Good')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Asking price (£)'), { target: { value: '12' } });
    fireEvent.click(within(vinted).getByRole('button', { name: 'Copy price' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('12.00'));
    expect(await within(vinted).findByRole('button', { name: 'Copy price' })).toHaveProperty('textContent', 'Copied ✓');

    fireEvent.click(screen.getByRole('tab', { name: 'eBay' }));
    const ebay = await screen.findByRole('region', { name: 'eBay listing' });
    expect(within(ebay).getByText('Pre-owned')).toBeDefined();

    fireEvent.click(screen.getByRole('tab', { name: 'Depop' }));
    const depop = await screen.findByRole('region', { name: 'Depop listing' });
    expect(within(depop).queryByText('Title')).toBeNull();
    expect(within(depop).getByText(/#boden/)).toBeDefined();
  });

  it('marks as listed, then sold', async () => {
    const item = await seed();
    render(<App />);
    await go(`#/item/${item.id}/sell`);

    fireEvent.change(await screen.findByLabelText('Asking price (£)'), { target: { value: '12.50' } });
    for (const box of screen.getAllByRole('checkbox')) if ((box as HTMLInputElement).checked) fireEvent.click(box);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Vinted' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'eBay' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark as listed' }));
    expect(await screen.findByText(/On Vinted, eBay at £12\.50 since/)).toBeDefined();

    fireEvent.change(screen.getByLabelText('For (£)'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as sold' }));
    expect(await screen.findByText(/Sold on Vinted for £11\.00 on/)).toBeDefined();
    expect(await db.items.get(item.id)).toMatchObject({ status: 'sold', salePricePence: 1100 });
  });

  it('rejects a bad price', async () => {
    const item = await seed();
    render(<App />);
    await go(`#/item/${item.id}/sell`);
    fireEvent.change(await screen.findByLabelText('Asking price (£)'), { target: { value: 'cheap' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as listed' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Prices should look like 8.50');
  });

  it('explains when photos cannot be shared', async () => {
    const item = await seed();
    render(<App />);
    await go(`#/item/${item.id}/sell`);
    fireEvent.click(await screen.findByRole('button', { name: 'Save or share photo' }));
    expect(await screen.findByText(/can’t share photos/)).toBeDefined();
  });

  it('shows a selling summary on Home', async () => {
    const item = await seed();
    await createItem({ ...emptyDraft([]), title: 'Hat', category: 'accessories', status: 'to_sell' }, []);
    const { markSold } = await import('../db/items.ts');
    await markSold(item.id, { platform: 'vinted', pricePence: 900 });
    render(<App />);
    await go('#/');
    const selling = await screen.findByRole('region', { name: 'Selling' });
    expect(selling.textContent).toContain('1 to sell');
    expect(selling.textContent).toContain('1 sold');
    expect(selling.textContent).toContain('£9.00 earned so far.');
  });
});
