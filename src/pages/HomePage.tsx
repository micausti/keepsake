import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.ts';
import { recentItems } from '../db/items.ts';
import { getSettings } from '../db/settings.ts';
import { formatAge, sizeLabel } from '../domain/sizes.ts';
import { ItemRow } from '../ui/ItemRow.tsx';
import { hrefFor } from '../ui/router.ts';

export function HomePage() {
  const children = useLiveQuery(() => db.children.orderBy('name').toArray());
  const items = useLiveQuery(() => recentItems(5));
  const itemCount = useLiveQuery(() => db.items.count());
  const settings = useLiveQuery(() => getSettings());

  if (!children || !items || itemCount === undefined || !settings) return null;

  const setupDone = Boolean(settings.apiKey) && children.length > 0;

  return (
    <>
      <header className="page-header">
        <h1>Keepsake</h1>
        <p className="tagline">Kids&rsquo; clothes and toys, all in one place.</p>
      </header>

      {!setupDone && (
        <section className="card" aria-labelledby="setup-heading">
          <h2 id="setup-heading">Get set up</h2>
          <ul className="checklist">
            <li data-done={children.length > 0}>Add your children and their sizes</li>
            <li data-done={Boolean(settings.apiKey)}>Add your Anthropic API key</li>
          </ul>
          <a className="button" href={hrefFor('settings')}>
            Open Settings
          </a>
        </section>
      )}

      <a className="button wide add-cta" href={hrefFor('add')}>
        ＋ Add an item
      </a>

      {children.length > 0 && (
        <section className="card" aria-labelledby="children-heading">
          <h2 id="children-heading">Children</h2>
          <ul className="plain-list">
            {children.map((child) => (
              <li key={child.id} className="child-row">
                <strong>{child.name}</strong>
                <span className="muted">
                  {[
                    child.birthDate && formatAge(child.birthDate),
                    sizeLabel('clothing', child.clothingSize),
                    child.shoeSize && `Shoes ${sizeLabel('shoes', child.shoeSize)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="items-heading">
        <h2 id="items-heading">
          {itemCount === 0 ? 'Items' : `Recently added (${itemCount} item${itemCount === 1 ? '' : 's'})`}
        </h2>
        {itemCount === 0 ? (
          <p className="muted">No items yet. Tap “Add an item” to snap your first one.</p>
        ) : (
          <>
            <ul className="plain-list">
              {items.slice(0, 5).map((item) => (
                <ItemRow key={item.id} item={item} children={children} />
              ))}
            </ul>
            <a className="button secondary-link" href={hrefFor('items')}>
              See all items ›
            </a>
          </>
        )}
      </section>
    </>
  );
}
