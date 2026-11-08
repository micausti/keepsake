import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { db } from '../db/db.ts';
import {
  DEFAULT_QUERY,
  activeFilterCount,
  filterItems,
  type ItemQuery,
  type SortOrder,
  type StatusFilter,
} from '../domain/filter.ts';
import {
  CATEGORIES,
  CONDITIONS,
  ITEM_STATUSES,
  SEASONS,
  categoryById,
  type CategoryId,
} from '../domain/options.ts';
import { sizesFor } from '../domain/sizes.ts';
import { ItemRow } from '../ui/ItemRow.tsx';
import { hrefFor } from '../ui/router.ts';

const GROUPS = [...new Set(CATEGORIES.map((c) => c.group))];

// Remembered while the app is open, so coming back from an item keeps the filters.
let rememberedQuery: ItemQuery = DEFAULT_QUERY;
let rememberedOpen = false;

function Select(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <select id={props.id} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.children}
      </select>
    </div>
  );
}

export function BrowsePage() {
  const items = useLiveQuery(() => db.items.toArray());
  const children = useLiveQuery(() => db.children.orderBy('name').toArray());
  const [query, setQuery] = useState<ItemQuery>(rememberedQuery);
  const [filtersOpen, setFiltersOpen] = useState(rememberedOpen);

  useEffect(() => {
    rememberedQuery = query;
    rememberedOpen = filtersOpen;
  }, [query, filtersOpen]);

  const results = useMemo(
    () => (items && children ? filterItems(items, query, children) : []),
    [items, children, query],
  );

  if (!items || !children) return null;

  const set = (patch: Partial<ItemQuery>) => setQuery((q) => ({ ...q, ...patch }));
  const sizeOptions = query.category ? sizesFor(categoryById(query.category).sizeSystem) : [];
  const filterCount = activeFilterCount(query);

  return (
    <>
      <header className="page-header">
        <h1>Items</h1>
      </header>

      <div className="search-bar">
        <input
          type="search"
          aria-label="Search items"
          placeholder="Search: brand, colour, “wellies”…"
          value={query.text}
          onChange={(e) => set({ text: e.target.value })}
          autoCorrect="off"
        />
        <button
          type="button"
          className="secondary outline"
          aria-expanded={filtersOpen}
          aria-controls="filters"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          Filters{filterCount ? ` (${filterCount})` : ''}
        </button>
      </div>

      {filtersOpen && (
        <section id="filters" className="card filters" aria-label="Filters">
          <Select id="f-child" label="Child" value={query.childId} onChange={(childId) => set({ childId })}>
            <option value="">Anyone</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="none">Not assigned</option>
          </Select>
          <Select
            id="f-category"
            label="Category"
            value={query.category}
            onChange={(category) => set({ category: category as CategoryId | '', size: '' })}
          >
            <option value="">All categories</option>
            {GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {CATEGORIES.filter((c) => c.group === group).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          {sizeOptions.length > 0 && (
            <Select id="f-size" label="Size" value={query.size} onChange={(size) => set({ size })}>
              <option value="">Any size</option>
              {sizeOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
          <Select
            id="f-status"
            label="Status"
            value={query.status}
            onChange={(status) => set({ status: status as StatusFilter })}
          >
            <option value="active">Still have (not sold or donated)</option>
            <option value="">All, including sold and donated</option>
            {ITEM_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select
            id="f-season"
            label="Season"
            value={query.season}
            onChange={(season) => set({ season: season as ItemQuery['season'] })}
          >
            <option value="">Any season</option>
            {SEASONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select
            id="f-condition"
            label="Condition"
            value={query.condition}
            onChange={(condition) => set({ condition: condition as ItemQuery['condition'] })}
          >
            <option value="">Any condition</option>
            {CONDITIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
          <Select id="f-sort" label="Sort by" value={query.sort} onChange={(sort) => set({ sort: sort as SortOrder })}>
            <option value="recent">Recently changed</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </Select>
          {(filterCount > 0 || query.text) && (
            <button type="button" className="secondary" onClick={() => setQuery({ ...DEFAULT_QUERY, sort: query.sort })}>
              Clear search and filters
            </button>
          )}
        </section>
      )}

      <p className="muted result-count" role="status">
        {results.length} {results.length === 1 ? 'item' : 'items'}
        {items.length !== results.length ? ` of ${items.length}` : ''}
      </p>

      {items.length === 0 ? (
        <section className="card">
          <p>No items yet.</p>
          <a className="button" href={hrefFor('add')}>
            ＋ Add an item
          </a>
        </section>
      ) : results.length === 0 ? (
        <section className="card">
          <p className="muted">Nothing matches. Try fewer words or clear the filters.</p>
        </section>
      ) : (
        <section className="card">
          <ul className="plain-list">
            {results.map((item) => (
              <ItemRow key={item.id} item={item} children={children} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
