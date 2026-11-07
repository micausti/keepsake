import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App.tsx';
import { db } from './db/db.ts';

async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('App', () => {
  it('shows the setup checklist on a fresh install', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Keepsake' })).toBeDefined();
    expect(screen.getByText('Add your children and their sizes')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Open Settings' }).getAttribute('href')).toBe('#/settings');
  });

  it('adds a child in Settings and shows them on Home', async () => {
    render(<App />);
    await goTo('#/settings');
    fireEvent.click(await screen.findByRole('button', { name: 'Add a child' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Arlo' } });
    fireEvent.change(screen.getByLabelText('Clothing size now'), { target: { value: '2-3y' } });
    fireEvent.change(screen.getByLabelText('Shoe size now'), { target: { value: 'k6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add child' }));

    const section = screen.getByRole('region', { name: 'Children' });
    expect(await within(section).findByText('Arlo')).toBeDefined();
    expect(within(section).getByText('2–3 years · Shoes UK 6')).toBeDefined();
    expect(await db.children.count()).toBe(1);

    await goTo('#/');
    expect(await screen.findByText('Arlo')).toBeDefined();
  });

  it('saves the API key without displaying it in full', async () => {
    const key = 'sk-ant-api03-' + 'k'.repeat(40) + 'WXYZ';
    render(<App />);
    await goTo('#/settings');
    fireEvent.change(await screen.findByLabelText('API key'), { target: { value: key } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));

    expect(await screen.findByText('sk-ant-api03…WXYZ')).toBeDefined();
    expect(screen.queryByText(key)).toBeNull();
    expect((screen.getByLabelText('Replace key') as HTMLInputElement).value).toBe('');
    expect((await db.settings.get('apiKey'))?.value).toBe(key);
  });
});
