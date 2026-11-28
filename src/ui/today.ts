import { useSyncExternalStore } from 'react';

/** Today's local date as YYYY-MM-DD. */
export function localDateString(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Midday on a YYYY-MM-DD local date, so age maths isn't thrown by time zones. */
export function dateFromString(day: string): Date {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

const CHECK_EVERY_MS = 60_000;

function subscribe(onChange: () => void): () => void {
  // iOS keeps the app in memory for days, so re-check whenever it comes back
  // to the front, and once a minute while it's open (covers midnight).
  const check = () => onChange();
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  const timer = window.setInterval(check, CHECK_EVERY_MS);
  return () => {
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('focus', check);
    window.removeEventListener('pageshow', check);
    window.clearInterval(timer);
  };
}

const snapshot = () => localDateString();

/** Today's date, re-rendering when the day changes (including after the app was in the background). */
export function useToday(): Date {
  const day = useSyncExternalStore(subscribe, snapshot);
  return dateFromString(day);
}
