import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

async function seed() {
  const arlo = await addChild({ name: 'Arlo', clothingSize: '4-5y', shoeSize: 'k10' });
  const zoe = await addChild({ name: 'Zoe', clothingSize: '2-3y', shoeSize: 'k6' });
  await add({ title: 'Zoe top 1', size: '2-3y', childId: zoe.id });
  await add({ title: 'Zoe top 2', size: '2-3y', childId: zoe.id });
  await add({ title: 'Arlo old coat', category: 'outerwear', size: '3-4y', childId: arlo.id, status: 'outgrown' });
  await add({ title: 'Arlo small top', size: '3-4y', childId: arlo.id });
  return { arlo, zoe };
}

describe('Gaps', () => {
  it('shows counts per child and size', async () => {
    await seed();
    render(<App />);
    await go('#/gaps');

    const zoe = await screen.findByRole('region', { name: 'Zoe' });
    const topsRow = within(zoe).getByRole('rowheader', { name: /Tops & T-shirts/ }).closest('tr');
    expect(topsRow?.textContent).toContain('2/7');
    const coatRow = within(zoe).getByRole('rowheader', { name: /Coats & jackets/ }).closest('tr');
    expect(within(coatRow as HTMLElement).getByRole('button', { name: /could be passed on from a sibling/ })).toBeDefined();
  });

  it('hands down a suggested item', async () => {
    const { zoe } = await seed();
    render(<App />);
    await go('#/gaps');

    const section = await screen.findByRole('region', { name: 'Could be passed on' });
    expect(within(section).getByText('Arlo old coat')).toBeDefined();
    fireEvent.click(within(section).getByRole('button', { name: 'Pass to Zoe' }));
    await waitFor(async () => {
      const coat = (await db.items.toArray()).find((i) => i.title === 'Arlo old coat');
      expect(coat).toMatchObject({ childId: zoe.id, status: 'storage' });
    });
  });

  it('offers to mark smaller items outgrown', async () => {
    await seed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await go('#/gaps');

    const arlo = await screen.findByRole('region', { name: 'Arlo' });
    fireEvent.click(within(arlo).getByRole('button', { name: 'Mark them outgrown' }));
    await waitFor(async () => {
      const top = (await db.items.toArray()).find((i) => i.title === 'Arlo small top');
      expect(top?.status).toBe('outgrown');
    });
    confirm.mockRestore();
  });

  it('opens matching items from a cell', async () => {
    await seed();
    render(<App />);
    await go('#/gaps');
    const zoe = await screen.findByRole('region', { name: 'Zoe' });
    const topsRow = within(zoe).getByRole('rowheader', { name: /Tops & T-shirts/ }).closest('tr') as HTMLElement;
    fireEvent.click(within(topsRow).getAllByRole('button')[0] as HTMLElement);

    expect(await screen.findByRole('heading', { name: 'Items' })).toBeDefined();
    expect(await screen.findByText('Zoe top 1')).toBeDefined();
    expect(screen.queryByText('Arlo small top')).toBeNull();
  });

  it('edits targets', async () => {
    await seed();
    render(<App />);
    await go('#/gaps');
    fireEvent.click(await screen.findByRole('button', { name: 'Change targets' }));
    fireEvent.change(screen.getByLabelText('Tops & T-shirts'), { target: { value: '2' } });

    const zoe = screen.getByRole('region', { name: 'Zoe' });
    await waitFor(() =>
      expect(within(zoe).getByRole('rowheader', { name: /Tops & T-shirts/ }).closest('tr')?.textContent).toContain('2/2'),
    );
  });
});

describe('Item page hand-down', () => {
  it('is not offered for a lost item', async () => {
    await seed();
    const lost = await add({ title: 'Lost glove', category: 'accessories', status: 'lost' });
    render(<App />);
    await go(`#/item/${lost.id}`);
    expect(await screen.findByRole('heading', { name: 'Lost glove' })).toBeDefined();
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('lost');
    expect(screen.queryByRole('button', { name: /Pass/ })).toBeNull();
  });

  it('hands an item to the other child', async () => {
    const { zoe } = await seed();
    const coat = (await db.items.toArray()).find((i) => i.title === 'Arlo old coat');
    render(<App />);
    await go(`#/item/${coat?.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Pass to Zoe' }));
    expect(await screen.findByText('Passed from Arlo to Zoe')).toBeDefined();
    expect((await db.items.get(coat?.id ?? ''))?.childId).toBe(zoe.id);
  });
});

describe('Pass to, with three children', () => {
  it('lets me choose who, in any direction', async () => {
    const { arlo } = await seed();
    const baby = await addChild({ name: 'Bea', clothingSize: '6-9m' });
    // An item of the youngest's, passed up to the eldest.
    const hat = await add({ title: 'Bobble hat', category: 'accessories', childId: baby.id });
    render(<App />);
    await go(`#/item/${hat.id}`);

    const button = await screen.findByRole('button', { name: 'Pass' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    const picker = screen.getByLabelText('Pass to') as HTMLSelectElement;
    expect([...picker.options].map((o) => o.text)).toEqual(['Pass to…', 'Arlo', 'Zoe']);

    fireEvent.change(picker, { target: { value: arlo.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Pass to Arlo' }));
    expect(await screen.findByText('Passed from Bea to Arlo')).toBeDefined();
    expect((await db.items.get(hat.id))?.childId).toBe(arlo.id);
  });

  it('passes an unassigned item', async () => {
    await seed();
    const kite = await add({ title: 'Kite', category: 'toys' });
    render(<App />);
    await go(`#/item/${kite.id}`);
    fireEvent.change(await screen.findByLabelText('Pass to'), {
      target: { value: (await db.children.toArray()).find((c) => c.name === 'Zoe')?.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pass to Zoe' }));
    expect(await screen.findByText('Passed to Zoe')).toBeDefined();
  });
});
