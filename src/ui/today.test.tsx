import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatAge } from '../domain/sizes.ts';
import { dateFromString, localDateString, useToday } from './today.ts';

function Age({ birthDate }: { birthDate: string }) {
  return <p>{formatAge(birthDate, useToday())}</p>;
}

afterEach(() => vi.useRealTimers());

describe('useToday', () => {
  it('updates ages when the app comes back after the date has moved on', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 30, 9));
    render(<Age birthDate="2025-07-15" />);
    expect(screen.getByText('15 months')).toBeTruthy();

    // A month later, the app is brought back from the background.
    vi.setSystemTime(new Date(2026, 10, 28, 9));
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByText('16 months')).toBeTruthy();
  });

  it('updates while the app stays open past midnight', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 10, 14, 23, 59, 30));
    render(<Age birthDate="2025-07-15" />);
    expect(screen.getByText('15 months')).toBeTruthy();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText('16 months')).toBeTruthy();
  });
});

describe('local dates', () => {
  it('uses the local calendar day', () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 50))).toBe('2026-01-05');
    expect(dateFromString('2026-01-05').getDate()).toBe(5);
  });
});
