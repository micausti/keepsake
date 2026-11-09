import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db.ts';
import { handDown, markOutgrown } from '../db/items.ts';
import { getSettings, saveSetting } from '../db/settings.ts';
import {
  DEFAULT_TARGETS,
  GAP_CATEGORIES,
  computeGaps,
  handDownSuggestions,
  likelyOutgrown,
  nowAndNext,
  targetFor,
  type GapCell,
  type GapTargets,
} from '../domain/gaps.ts';
import { SEASONS, categoryById, type CategoryId, type Season } from '../domain/options.ts';
import { sizeLabel } from '../domain/sizes.ts';
import type { Child, Item } from '../domain/types.ts';
import { hrefFor, navigate } from '../ui/router.ts';
import { presetBrowse } from './BrowsePage.tsx';

let rememberedSeason: Season | '' = '';

function openItems(category: CategoryId, size: string) {
  presetBrowse({ category, size });
  navigate(hrefFor('items'));
}

function Cell({ cell, category }: { cell: GapCell; category: CategoryId }) {
  const missing = Math.max(0, cell.target - cell.have);
  return (
    <button
      type="button"
      className={`gap-cell gap-${cell.state}`}
      onClick={() => openItems(category, cell.size.id)}
      aria-label={`${cell.have} of ${cell.target}${missing ? `, ${missing} short` : ''}${
        cell.handMeDowns ? `, ${cell.handMeDowns} could be passed on from a sibling` : ''
      }`}
    >
      <span className="gap-count">
        {cell.have}/{cell.target}
      </span>
      {cell.handMeDowns > 0 && <span className="gap-extra">+{cell.handMeDowns} from sibling</span>}
    </button>
  );
}

function ChildGaps({ child, items, targets, season }: { child: Child; items: Item[]; targets: GapTargets; season?: Season }) {
  const rows = computeGaps(child, items, targets, season);
  const outgrown = likelyOutgrown(child, items);
  const clothes = nowAndNext(child, 'clothing');
  const shoes = nowAndNext(child, 'shoes');

  const sweep = async () => {
    if (!window.confirm(`Mark ${outgrown.length} of ${child.name}’s smaller items as outgrown?`)) return;
    await markOutgrown(outgrown.map((i) => i.id));
  };

  return (
    <section className="card" aria-labelledby={`gaps-${child.id}`}>
      <h2 id={`gaps-${child.id}`}>{child.name}</h2>
      {!clothes.length && !shoes.length ? (
        <p className="muted">
          Set {child.name}’s clothing and shoe sizes in <a href={hrefFor('settings')}>Settings</a> to see gaps.
        </p>
      ) : (
        <>
          <p className="muted">
            {[clothes[0] && `Wears ${clothes[0].label}`, shoes[0] && `shoes ${shoes[0].label}`]
              .filter(Boolean)
              .join(', ')}
            {!child.clothingSize && clothes[0] ? ' (from their age)' : ''}
          </p>
          <table className="gap-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Category</span>
                </th>
                <th scope="col">
                  Now{clothes[0] && <span className="gap-sizes">{clothes[0].label}</span>}
                </th>
                <th scope="col">
                  Next{clothes[1] && <span className="gap-sizes">{clothes[1].label}</span>}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.category}>
                  <th scope="row">
                    {row.label}
                    {categoryById(row.category).sizeSystem === 'shoes' && (
                      <span className="gap-sizes muted">{row.cells.map((c) => c.size.label).join(' → ')}</span>
                    )}
                  </th>
                  {[0, 1].map((i) => (
                    <td key={i}>{row.cells[i] && <Cell cell={row.cells[i]} category={row.category} />}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {outgrown.length > 0 && (
        <div className="notice">
          <p>
            {outgrown.length} of {child.name}’s items are in smaller sizes but still marked “In use”.
          </p>
          <button type="button" className="secondary outline" onClick={() => void sweep()}>
            Mark them outgrown
          </button>
        </div>
      )}
    </section>
  );
}

function HandMeDowns({ children, items }: { children: Child[]; items: Item[] }) {
  const suggestions = handDownSuggestions(children, items);
  if (!suggestions.length) return null;
  const name = (id?: string) => children.find((c) => c.id === id)?.name;
  return (
    <section className="card" aria-labelledby="handdowns-heading">
      <h2 id="handdowns-heading">Could be passed on</h2>
      <ul className="plain-list">
        {suggestions.map(({ item, to, when }) => (
          <li key={`${item.id}-${to.id}`} className="child-row">
            <div>
              <a href={`#/item/${encodeURIComponent(item.id)}`}>
                <strong>{item.title}</strong>
              </a>
              <div className="muted">
                {sizeLabel(categoryById(item.category).sizeSystem, item.size)} · from {name(item.childId)} ·{' '}
                {when === 'now' ? `fits ${to.name} now` : `${to.name}’s next size`}
              </div>
            </div>
            <button type="button" className="secondary outline" onClick={() => void handDown(item.id, to.id, when === 'now')}>
              Pass to {to.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Targets({ targets }: { targets: GapTargets }) {
  const [open, setOpen] = useState(false);
  const set = (category: CategoryId, value: string) => {
    const n = Math.max(0, Math.min(99, Math.round(Number(value) || 0)));
    void saveSetting('gapTargets', { ...targets, [category]: n });
  };
  return (
    <section className="card" aria-labelledby="targets-heading">
      <h2 id="targets-heading">How many do you want?</h2>
      <p className="muted">Per child, per size. Set 0 to hide a category.</p>
      {open ? (
        <>
          <div className="targets">
            {GAP_CATEGORIES.map((c) => (
              <div key={c.id} className="target-row">
                <label htmlFor={`target-${c.id}`}>{c.label}</label>
                <input
                  id={`target-${c.id}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  value={targetFor(targets, c.id)}
                  onChange={(e) => set(c.id, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="button-row">
            <button type="button" onClick={() => setOpen(false)}>
              Done
            </button>
            <button type="button" className="secondary" onClick={() => void saveSetting('gapTargets', undefined)}>
              Reset to defaults
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="secondary outline" onClick={() => setOpen(true)}>
          Change targets
        </button>
      )}
    </section>
  );
}

export function GapsPage() {
  const children = useLiveQuery(() => db.children.orderBy('name').toArray());
  const items = useLiveQuery(() => db.items.toArray());
  const settings = useLiveQuery(() => getSettings());
  const [season, setSeason] = useState<Season | ''>(rememberedSeason);

  if (!children || !items || !settings) return null;
  const targets = settings.gapTargets ?? DEFAULT_TARGETS;

  return (
    <>
      <header className="page-header">
        <h1>Gaps</h1>
        <p className="tagline">What each child has in their size now and next.</p>
      </header>

      {children.length === 0 ? (
        <section className="card">
          <p>Add your children and their sizes first.</p>
          <a className="button" href={hrefFor('settings')}>
            Open Settings
          </a>
        </section>
      ) : (
        <>
          <div className="field season-filter">
            <label htmlFor="gap-season">Season</label>
            <select
              id="gap-season"
              value={season}
              onChange={(e) => {
                rememberedSeason = e.target.value as Season | '';
                setSeason(rememberedSeason);
              }}
            >
              <option value="">All seasons</option>
              {SEASONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <p className="muted gap-legend">
            Counts are items you have (in use, in storage or to hand down) against your target. Tap a number to
            see them.
          </p>
          {children.map((child) => (
            <ChildGaps key={child.id} child={child} items={items} targets={targets} season={season || undefined} />
          ))}
          <HandMeDowns children={children} items={items} />
          <Targets targets={targets} />
        </>
      )}
    </>
  );
}
