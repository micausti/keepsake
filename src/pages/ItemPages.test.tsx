import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../App.tsx';
import { addChild } from '../db/children.ts';
import { db } from '../db/db.ts';
import { createItem } from '../db/items.ts';
import { emptyDraft } from '../domain/draft.ts';

vi.mock('../photos/process.ts', () => ({
  processPhoto: vi.fn(async () => ({
    full: new Blob(['full']),
    thumb: new Blob(['thumb']),
    ai: new Blob(['ai']),
    width: 2000,
    height: 1500,
    takenAt: new Date(2026, 9, 1),
  })),
}));

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

const photo = { full: new Blob(['f']), thumb: new Blob(['t']), width: 10, height: 10, takenAt: new Date(2025, 5, 14) };

async function seed() {
  const arlo = await addChild({ name: 'Arlo', clothingSize: '2-3y' });
  const coat = await createItem(
    { ...emptyDraft([]), title: 'Navy padded coat', category: 'outerwear', size: '2-3y', childId: arlo.id, brand: 'Boden', condition: 'very_good', seasons: ['winter'] },
    [photo],
  );
  await createItem({ ...emptyDraft([]), title: 'Red wellies', category: 'wellies_boots', size: 'k6', childId: arlo.id }, []);
  await createItem({ ...emptyDraft([]), title: 'Old dress', category: 'dresses', status: 'donated' }, []);
  return { arlo, coat };
}

describe('Browse', () => {
  it('lists items, searches and filters', async () => {
    await seed();
    render(<App />);
    await go('#/items');

    expect(await screen.findByText('Navy padded coat')).toBeDefined();
    expect(screen.getByText('Red wellies')).toBeDefined();
    expect(screen.queryByText('Old dress')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('2 items of 3');

    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'boden' } });
    expect(screen.queryByText('Red wellies')).toBeNull();
    expect(screen.getByText('Navy padded coat')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: '' } });
    expect(await screen.findByText('Old dress')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'wellies_boots' } });
    expect(screen.getByRole('status').textContent).toBe('1 item of 3');
    expect(screen.getByRole('button', { name: 'Filters (2)' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    expect(screen.getByRole('status').textContent).toBe('2 items of 3');
  });

  it('opens an item from the list', async () => {
    const { coat } = await seed();
    render(<App />);
    await go('#/items');
    const link = (await screen.findByText('Navy padded coat')).closest('a');
    expect(link?.getAttribute('href')).toBe(`#/item/${coat.id}`);
  });
});

describe('Item page', () => {
  it('shows details and the timeline, and changes status', async () => {
    const { coat } = await seed();
    render(<App />);
    await go(`#/item/${coat.id}`);

    expect(await screen.findByRole('heading', { name: 'Navy padded coat' })).toBeDefined();
    const details = screen.getByRole('region', { name: 'Details' });
    expect(within(details).getByText('Boden')).toBeDefined();
    expect(within(details).getByText('2–3 years')).toBeDefined();
    expect(within(details).getByText('Arlo')).toBeDefined();
    expect(screen.getByText('Added to Keepsake')).toBeDefined();
    expect(screen.getByText('Taken 14 Jun 2025')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'outgrown' } });
    expect(await screen.findByText('Status: Outgrown')).toBeDefined();
    expect((await db.items.get(coat.id))?.status).toBe('outgrown');
  });

  it('adds an update with a photo, condition and note', async () => {
    const { coat } = await seed();
    render(<App />);
    await go(`#/item/${coat.id}/update`);

    fireEvent.change(await screen.findByTestId('library-input'), {
      target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] },
    });
    await screen.findByAltText('Photo 1');
    fireEvent.change(screen.getByLabelText('Condition now'), { target: { value: 'good' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Bobbling on cuffs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

    expect(await screen.findByText('Condition: Good')).toBeDefined();
    expect(screen.getByText('Bobbling on cuffs', { selector: '.timeline-note' })).toBeDefined();
    expect(await db.photos.where('itemId').equals(coat.id).count()).toBe(2);
  });

  it('edits details', async () => {
    const { coat } = await seed();
    render(<App />);
    await go(`#/item/${coat.id}/edit`);

    const name = (await screen.findByLabelText('Name')) as HTMLInputElement;
    expect(name.value).toBe('Navy padded coat');
    fireEvent.change(name, { target: { value: 'Navy hooded coat' } });
    fireEvent.change(screen.getByLabelText('Storage location'), { target: { value: 'Hall cupboard' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('heading', { name: 'Navy hooded coat' })).toBeDefined();
    expect(screen.getByText('Hall cupboard')).toBeDefined();
  });

  it('deletes after confirming', async () => {
    const { coat } = await seed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await go(`#/item/${coat.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete item' }));

    await waitFor(async () => expect(await db.items.get(coat.id)).toBeUndefined());
    expect(confirm).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Items' })).toBeDefined();
    confirm.mockRestore();
  });

  it('handles a missing item', async () => {
    render(<App />);
    await go('#/item/does-not-exist');
    expect(await screen.findByText('This item no longer exists.')).toBeDefined();
  });
});
