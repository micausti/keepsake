import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.ts';
import { recentItems } from '../db/items.ts';
import { getSettings } from '../db/settings.ts';
import { formatAge, sizeLabel } from '../domain/sizes.ts';
import { BackupControls } from '../backup/BackupControls.tsx';
import { backupDue, daysSinceBackup } from '../backup/backup.ts';
import { formatPence } from '../domain/money.ts';
import { ItemRow } from '../ui/ItemRow.tsx';
import { hrefFor } from '../ui/router.ts';
import { presetBrowse } from './BrowsePage.tsx';

export function HomePage() {
  const children = useLiveQuery(() => db.children.orderBy('name').toArray());
  const items = useLiveQuery(() => recentItems(5));
  const itemCount = useLiveQuery(() => db.items.count());
  const settings = useLiveQuery(() => getSettings());
  const selling = useLiveQuery(() =>
    db.items.where('status').anyOf('to_sell', 'listed', 'sold').toArray(),
  );

  if (!children || !items || itemCount === undefined || !settings || !selling) return null;
  const count = (status: string) => selling.filter((i) => i.status === status).length;
  const earned = selling.reduce((sum, i) => sum + (i.status === 'sold' ? (i.salePricePence ?? 0) : 0), 0);

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

      {backupDue(settings.lastBackupAt, itemCount) && (
        <section className="card backup-reminder" aria-labelledby="backup-reminder-heading">
          <h2 id="backup-reminder-heading">Time for a backup</h2>
          <p>
            {settings.lastBackupAt
              ? `Your last backup was ${daysSinceBackup(settings.lastBackupAt)} days ago.`
              : 'You haven’t backed up yet.'}{' '}
            Everything is only on this phone, so save a copy somewhere safe.
          </p>
          <BackupControls />
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

      {selling.length > 0 && (
        <section className="card" aria-labelledby="selling-heading">
          <h2 id="selling-heading">Selling</h2>
          <div className="stats">
            <a className="stat" href={hrefFor('items')} onClick={() => presetBrowse({ status: 'to_sell' })}>
              <strong>{count('to_sell')}</strong> to sell
            </a>
            <a className="stat" href={hrefFor('items')} onClick={() => presetBrowse({ status: 'listed' })}>
              <strong>{count('listed')}</strong> listed
            </a>
            <a className="stat" href={hrefFor('items')} onClick={() => presetBrowse({ status: 'sold' })}>
              <strong>{count('sold')}</strong> sold
            </a>
          </div>
          {earned > 0 && <p className="muted">{formatPence(earned)} earned so far.</p>}
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
