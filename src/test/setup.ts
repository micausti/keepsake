import 'fake-indexeddb/auto';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { db } from '../db/db.ts';

// Each test starts with an empty database.
beforeEach(async () => {
  await db.delete();
  await db.open();
});

// Vitest globals are off, so Testing Library can't auto-register cleanup.
afterEach(() => {
  cleanup();
  if (typeof window !== 'undefined') window.location.hash = '';
});
