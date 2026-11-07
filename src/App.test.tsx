import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App.tsx';

describe('App', () => {
  it('renders the app name', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Keepsake' })).toBeDefined();
  });

  it('shows the build version', () => {
    render(<App />);
    expect(screen.getByText(new RegExp(`Version ${__APP_VERSION__}`))).toBeDefined();
  });
});
