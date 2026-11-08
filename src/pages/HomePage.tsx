import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.ts';
import { recentItems } from '../db/items.ts';
import { getSettings } from '../db/settings.ts';
import { CATEGORY_LABELS, STATUS_LABELS, categoryById } from '../domain/options.ts';
import { formatAge, sizeLabel } from '../domain/sizes.ts';
import type { Child, Item } from '../domain/types.ts';
import { BlobImage } from '../ui/BlobImage.tsx';
import { hrefFor } from '../ui/router.ts';

function ItemRow({ item, children }: { item: Item; children: Child[] }) {
  const thumb = useLiveQuery(
    () => (item.coverPhotoId ? db.photos.get(item.coverPhotoId).then((p) => p?.thumb) : undefined),
    [item.coverPhotoId],
  );
  const child = children.find((c) => c.id === item.childId);
  const size = sizeLabel(categoryById(item.category).sizeSystem, item.size);
  return (
    <li className="item-row">
      <BlobImage blob={thumb} alt="" className="item-thumb" />
      <div>
        <strong>{item.title}</strong>
        <div className="muted">
          {[CATEGORY_LABELS[item.category], size, child?.name, STATUS_LABELS[item.status]]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
    </li>
  );
}

export function HomePage() {
  const children = useLiveQuery(() => db.children.orderBy('name').toArray());
  const items = useLiveQuery(() => recentItems(20));
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
          <ul className="plain-list">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} children={children} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
