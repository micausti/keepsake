import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App.tsx';
import { addChild } from '../db/children.ts';
import { db } from '../db/db.ts';
import { saveSetting } from '../db/settings.ts';
import { describeItem } from '../ai/describe.ts';

// jsdom can't decode images, so photo processing and the API are stubbed.
vi.mock('../photos/process.ts', () => ({
  processPhoto: vi.fn(async () => ({
    full: new Blob(['full'], { type: 'image/jpeg' }),
    thumb: new Blob(['thumb'], { type: 'image/jpeg' }),
    ai: new Blob(['ai'], { type: 'image/jpeg' }),
    width: 2000,
    height: 1500,
    takenAt: new Date(2025, 5, 1),
  })),
}));
vi.mock('../ai/describe.ts', () => ({ describeItem: vi.fn() }));

beforeEach(() => {
  vi.mocked(describeItem).mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
});

async function openAddPage() {
  render(<App />);
  await act(async () => {
    window.location.hash = '#/add';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await screen.findByRole('heading', { name: 'Add an item' });
}

async function addPhoto() {
  const file = new File(['x'], 'coat.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByTestId('library-input'), { target: { files: [file] } });
  await screen.findByAltText('Photo 1');
}

describe('Add item', () => {
  it('fills the form from AI, lets me edit, and saves', async () => {
    await saveSetting('apiKey', 'sk-ant-test');
    const arlo = await addChild({ name: 'Arlo', clothingSize: '2-3y' });
    await addChild({ name: 'Zoe', clothingSize: '5-6y' });
    vi.mocked(describeItem).mockResolvedValue({
      ok: true,
      suggestion: {
        title: 'Navy padded coat',
        category: 'outerwear',
        sizeOnLabel: '2-3 Y',
        size: '2-3y',
        seasons: ['autumn', 'winter'],
        brand: null,
        colour: 'Navy',
        material: null,
        condition: 'very_good',
        conditionNotes: null,
        description: 'Warm padded coat with a hood.',
        uncertain: ['brand'],
      },
    });

    await openAddPage();
    await addPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'Fill in details with AI' }));

    const title = (await screen.findByLabelText('Name')) as HTMLInputElement;
    expect(title.value).toBe('Navy padded coat');
    expect(vi.mocked(describeItem)).toHaveBeenCalledWith('sk-ant-test', 'claude-sonnet-5-5', [expect.any(Blob)]);
    expect((screen.getByLabelText('Child') as HTMLSelectElement).value).toBe(arlo.id);
    expect((screen.getByLabelText('Size') as HTMLSelectElement).value).toBe('2-3y');
    expect(screen.getByLabelText(/Brand/).closest('.field')?.textContent).toContain('check');

    fireEvent.change(screen.getByLabelText(/Brand/), { target: { value: 'Boden' } });
    fireEvent.change(screen.getByLabelText('Storage location'), { target: { value: 'Loft box 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));

    expect(await screen.findByRole('heading', { name: 'Saved' })).toBeDefined();
    const [item] = await db.items.toArray();
    expect(item).toMatchObject({
      title: 'Navy padded coat',
      brand: 'Boden',
      childId: arlo.id,
      size: '2-3y',
      storageLocation: 'Loft box 1',
      seasons: ['autumn', 'winter'],
    });
    expect(await db.photos.count()).toBe(1);
  });

  it('shows the AI error and still lets me fill it in myself', async () => {
    await saveSetting('apiKey', 'sk-ant-test');
    vi.mocked(describeItem).mockResolvedValue({ ok: false, reason: 'offline', message: 'Could not reach Anthropic.' });

    await openAddPage();
    await addPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'Fill in details with AI' }));

    expect(await screen.findByText('Could not reach Anthropic.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Try AI again' })).toBeDefined();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Wooden train' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'toys' } });
    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '3y+' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));

    await screen.findByRole('heading', { name: 'Saved' });
    expect((await db.items.toArray())[0]).toMatchObject({ title: 'Wooden train', category: 'toys', size: '3y+' });
  });

  it('works without an API key and validates required fields', async () => {
    await openAddPage();
    expect(screen.queryByRole('button', { name: 'Fill in details with AI' })).toBeNull();
    expect(screen.getByText(/to have the details/).querySelector('a')?.getAttribute('href')).toBe('#/settings');

    fireEvent.click(screen.getByRole('button', { name: 'Fill in myself' }));
    const form = screen.getByRole('button', { name: 'Save item' }).closest('form');
    if (!form) throw new Error('form not found');
    fireEvent.submit(form);
    expect(await screen.findByRole('alert')).toBeDefined();
    await waitFor(async () => expect(await db.items.count()).toBe(0));
  });
});
