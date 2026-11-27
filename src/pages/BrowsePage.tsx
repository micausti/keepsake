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
import { ItemTile } from '../ui/ItemTile.tsx';
import { bulkUpdate, knownStorageLocations, undoBulkUpdate, type BulkChanges, type BulkUndo } from '../db/items.ts';
import { BulkUpdateSheet } from './items/BulkUpdateSheet.tsx';
import { hrefFor } from '../ui/router.ts';

const GROUPS = [...new Set(CATEGORIES.map((c) => c.group))];

// Remembered while the app is open, so coming back from an item keeps the filters.
let rememberedQuery: ItemQuery = DEFAULT_QUERY;
let rememberedOpen = false;

/** Opens the Items tab with these filters set (used by the Gaps screen). */
export function presetBrowse(patch: Partial<ItemQuery>): void {
  rememberedQuery = { ...DEFAULT_QUERY, ...patch };
  rememberedOpen = true;
}

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
  const locations = useLiveQuery(() => knownStorageLocations()) ?? [];
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [updating, setUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<{ undo: BulkUndo; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The Undo offer disappears after 10 seconds.
  useEffect(() => {
    if (!lastUpdate) return;
    const timer = setTimeout(() => setLastUpdate(null), 10_000);
    return () => clearTimeout(timer);
  }, [lastUpdate]);

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
  // Only ticked items that the current search and filters still show are updated.
  const chosen = results.filter((i) => selected.has(i.id)).map((i) => i.id);
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
    setUpdating(false);
  };
  const apply = async (changes: BulkChanges) => {
    setError(null);
    try {
      const undo = await bulkUpdate(chosen, changes);
      setLastUpdate({ undo, count: chosen.length });
      stopSelecting();
    } catch {
      setError('Couldn’t update those items. Nothing was changed.');
      setUpdating(false);
    }
  };
  const undoLast = async () => {
    if (!lastUpdate) return;
    await undoBulkUpdate(lastUpdate.undo);
    setLastUpdate(null);
  };
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
        {items.length > 0 && (
          <button
            type="button"
            className={selecting ? '' : 'secondary outline'}
            aria-pressed={selecting}
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
          >
            {selecting ? 'Done' : 'Select'}
          </button>
        )}
      </div>

      {filtersOpen && (
        <section id="filters" className="card filters" aria-label="Filters">
          <Select id="f-child" label="Who" value={query.childId} onChange={(childId) => set({ childId })}>
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
            <option value="active">Still have (not sold, donated or lost)</option>
            <option value="">All, including sold, donated and lost</option>
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
        <>
          {selecting && (
            <div className="select-row">
              <span className="muted">Tap items to select them.</span>
              {chosen.length < results.length ? (
                <button type="button" className="secondary link" onClick={() => setSelected(new Set(results.map((i) => i.id)))}>
                  Select all ({results.length})
                </button>
              ) : (
                <button type="button" className="secondary link" onClick={() => setSelected(new Set())}>
                  Clear selection
                </button>
              )}
            </div>
          )}
          <ul className="item-grid" aria-label="Items">
            {results.map((item) => (
              <ItemTile
                key={item.id}
                item={item}
                selection={selecting ? { selected: selected.has(item.id), onToggle: () => toggle(item.id) } : undefined}
              />
            ))}
          </ul>
        </>
      )}

      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}

      {selecting && (
        <div className="action-bar" role="region" aria-label="Selection">
          <span>
            <strong>{chosen.length}</strong> selected
          </span>
          <button type="button" disabled={chosen.length === 0} onClick={() => setUpdating(true)}>
            Update…
          </button>
        </div>
      )}

      {!selecting && lastUpdate && (
        <div className="action-bar" role="status" aria-label="Updated">
          <span>
            Updated {lastUpdate.count} {lastUpdate.count === 1 ? 'item' : 'items'}
          </span>
          <button type="button" className="secondary" onClick={() => void undoLast()}>
            Undo
          </button>
        </div>
      )}

      {updating && (
        <BulkUpdateSheet
          count={chosen.length}
          people={children}
          storageLocations={locations}
          onApply={(changes) => void apply(changes)}
          onCancel={() => setUpdating(false)}
        />
      )}
    </>
  );
}
