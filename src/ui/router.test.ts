import { describe, expect, it } from 'vitest';
import { itemHref, parseRoute, tabFor } from './router.ts';

describe('router', () => {
  it.each([
    ['', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/items', { name: 'items' }],
    ['#/add', { name: 'add' }],
    ['#/settings', { name: 'settings' }],
    ['#/item/abc-123', { name: 'item', id: 'abc-123' }],
    ['#/item/abc-123/edit', { name: 'edit', id: 'abc-123' }],
    ['#/item/abc-123/update', { name: 'update', id: 'abc-123' }],
    ['#/item', { name: 'home' }],
    ['#/nonsense', { name: 'home' }],
  ])('parses %j', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it('builds item links that round-trip', () => {
    expect(parseRoute(itemHref('a b/c', 'edit'))).toEqual({ name: 'edit', id: 'a b/c' });
  });

  it('highlights the Items tab on item screens', () => {
    expect(tabFor({ name: 'item', id: 'x' })).toBe('items');
    expect(tabFor({ name: 'settings' })).toBe('settings');
  });
});
