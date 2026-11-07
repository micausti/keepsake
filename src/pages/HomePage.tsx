import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.ts';
import { getSettings } from '../db/settings.ts';
import { CLOTHING_SIZES, SHOE_SIZES, formatAge } from '../domain/sizes.ts';
import { hrefFor } from '../ui/router.ts';

const label = (list: readonly { id: string; label: string }[], id?: string) =>
  list.find((s) => s.id === id)?.label;

export function HomePage() {
  const children = useLiveQuery(() => db.children.orderBy('name').toArray());
  const itemCount = useLiveQuery(() => db.items.count());
  const settings = useLiveQuery(() => getSettings());

  if (!children || itemCount === undefined || !settings) return null;

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
                    label(CLOTHING_SIZES, child.clothingSize),
                    child.shoeSize && `Shoes ${label(SHOE_SIZES, child.shoeSize)}`,
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
        <h2 id="items-heading">Items</h2>
        <p>
          {itemCount === 0
            ? 'No items yet. Adding items with a photo arrives in the next update.'
            : `${itemCount} item${itemCount === 1 ? '' : 's'}`}
        </p>
      </section>
    </>
  );
}
