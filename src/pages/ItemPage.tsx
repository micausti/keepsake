import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db.ts';
import { deleteItem, handDown, rotatePhoto, setCoverPhoto, setStatus } from '../db/items.ts';
import { GONE_STATUSES } from '../domain/filter.ts';
import { nowAndNext } from '../domain/gaps.ts';
import { formatDate } from '../domain/dates.ts';
import { formatPence } from '../domain/money.ts';
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  ITEM_STATUSES,
  PLATFORM_LABELS,
  SEASON_LABELS,
  STATUS_LABELS,
  categoryById,
  type ItemStatus,
} from '../domain/options.ts';
import { sizeLabel } from '../domain/sizes.ts';
import type { Child, Item, ItemEvent, Photo } from '../domain/types.ts';
import { BlobImage } from '../ui/BlobImage.tsx';
import { hrefFor, itemHref, navigate } from '../ui/router.ts';

function eventTitle(event: ItemEvent, children: Child[]): string {
  const name = (id?: string) => children.find((c) => c.id === id)?.name ?? 'someone';
  switch (event.kind) {
    case 'created':
      return 'Added to Keepsake';
    case 'condition':
      return `Condition: ${event.condition ? CONDITION_LABELS[event.condition] : 'checked'}`;
    case 'status':
      return `Status: ${event.status ? STATUS_LABELS[event.status] : 'changed'}`;
    case 'photos':
      return 'New photos';
    case 'note':
      return 'Note';
    case 'handdown':
      return event.fromChildId
        ? `Passed from ${name(event.fromChildId)} to ${name(event.toChildId)}`
        : `Passed to ${name(event.toChildId)}`;
  }
}

function Timeline(props: { events: ItemEvent[]; photos: Photo[]; children: Child[]; onOpen: (p: Photo) => void }) {
  const { events, photos, onOpen } = props;
  const byId = new Map(photos.map((p) => [p.id, p]));
  return (
    <ol className="timeline">
      {events.map((event) => {
        const eventPhotos = (event.photoIds ?? []).map((id) => byId.get(id)).filter((p): p is Photo => !!p);
        return (
          <li key={event.id} className="timeline-entry">
            <div className="timeline-date">{formatDate(event.at)}</div>
            <div>
              <strong>{eventTitle(event, props.children)}</strong>
              {event.kind === 'created' && event.condition && (
                <div className="muted">Condition: {CONDITION_LABELS[event.condition]}</div>
              )}
              {event.note && <p className="timeline-note">{event.note}</p>}
              {eventPhotos.length > 0 && (
                <div className="timeline-photos">
                  {eventPhotos.map((p) => (
                    <button key={p.id} type="button" className="photo-button" onClick={() => onOpen(p)}>
                      <BlobImage blob={p.thumb} alt={`Photo taken ${formatDate(p.takenAt)}`} className="timeline-thumb" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * "Pass to …": moves an item to another child, in either direction. With one
 * other child it's a single button; with more, pick who from a list first.
 */
function PassTo({ item, children }: { item: Item; children: Child[] }) {
  const others = children.filter((c) => c.id !== item.childId);
  const [to, setTo] = useState('');
  if (!others.length || GONE_STATUSES.includes(item.status)) return null;

  const system = categoryById(item.category).sizeSystem;
  const fitsNow = (child: Child) =>
    (system === 'clothing' || system === 'shoes') && nowAndNext(child, system)[0]?.id === item.size;
  const pass = async (child: Child) => {
    await handDown(item.id, child.id, fitsNow(child));
    setTo('');
  };

  if (others.length === 1) {
    const [only] = others as [Child];
    return (
      <button type="button" className="secondary outline wide" onClick={() => void pass(only)}>
        Pass to {only.name}
      </button>
    );
  }
  const chosen = others.find((c) => c.id === to);
  return (
    <div className="input-row hand-down">
      <select aria-label="Pass to" value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="">Pass to…</option>
        {others.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="secondary outline"
        disabled={!chosen}
        onClick={() => chosen && void pass(chosen)}
      >
        {chosen ? `Pass to ${chosen.name}` : 'Pass'}
      </button>
    </div>
  );
}

function Lightbox({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo" onClick={onClose}>
      <BlobImage blob={photo.blob} alt={`Photo taken ${formatDate(photo.takenAt)}`} className="lightbox-image" />
      <p className="lightbox-caption">Taken {formatDate(photo.takenAt)}</p>
      <button type="button" className="lightbox-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

export function ItemPage({ id }: { id: string }) {
  const item = useLiveQuery(() => db.items.get(id).then((i) => i ?? null), [id]);
  const photos = useLiveQuery(() => db.photos.where('itemId').equals(id).sortBy('takenAt'), [id]);
  const events = useLiveQuery(
    () => db.events.where('itemId').equals(id).sortBy('at').then((list) => list.reverse()),
    [id],
  );
  const children = useLiveQuery(() => db.children.orderBy('name').toArray());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [rotating, setRotating] = useState(false);

  if (item === null) {
    return (
      <section className="card">
        <p>This item no longer exists.</p>
        <a className="button" href={hrefFor('items')}>
          Back to items
        </a>
      </section>
    );
  }
  if (!item || !photos || !events || !children) return null;

  const shown = photos.find((p) => p.id === (selectedId ?? item.coverPhotoId)) ?? photos[0];
  const system = categoryById(item.category).sizeSystem;
  const child = children.find((c) => c.id === item.childId);

  const remove = async () => {
    if (!window.confirm(`Delete “${item.title}” and all its photos? This can’t be undone.`)) return;
    await deleteItem(item.id);
    navigate(hrefFor('items'), { replace: true });
  };

  const details: [string, string | undefined][] = [
    ['Category', CATEGORY_LABELS[item.category]],
    ['Child', child?.name ?? 'Not assigned'],
    [system === 'toy_age' ? 'Age' : 'Size', sizeLabel(system, item.size)],
    ['Seasons', item.seasons.map((s) => SEASON_LABELS[s]).join(', ')],
    ['Condition', item.condition && CONDITION_LABELS[item.condition]],
    ['Condition notes', item.conditionNotes],
    ['Brand', item.brand],
    ['Colour', item.colour],
    ['Material', item.material],
    ['Storage location', item.storageLocation],
    ['Price paid', item.pricePaidPence !== undefined ? formatPence(item.pricePaidPence) : undefined],
    ['Listed on', item.status === 'listed' ? item.listedOn?.map((p) => PLATFORM_LABELS[p]).join(', ') : undefined],
    ['Asking price', item.status === 'listed' && item.listPricePence !== undefined ? formatPence(item.listPricePence) : undefined],
    ['Sold for', item.salePricePence !== undefined ? formatPence(item.salePricePence) : undefined],
    ['Sold on', item.salePlatform && PLATFORM_LABELS[item.salePlatform]],
    ['Added', formatDate(item.createdAt)],
  ];

  return (
    <>
      <a className="back-link" href={hrefFor('items')}>
        ‹ Items
      </a>
      <header className="page-header">
        <h1 className="item-title">{item.title}</h1>
      </header>

      {shown ? (
        <section className="gallery" aria-label="Photos">
          <button type="button" className="photo-button" onClick={() => setLightbox(shown)}>
            <BlobImage blob={shown.blob} alt={`Photo taken ${formatDate(shown.takenAt)}`} className="gallery-main" />
          </button>
          <div className="gallery-meta">
            <span className="muted">Taken {formatDate(shown.takenAt)}</span>
            <div className="button-row">
              <button
                type="button"
                className="secondary link"
                disabled={rotating}
                onClick={() => {
                  setRotating(true);
                  void rotatePhoto(shown.id).finally(() => setRotating(false));
                }}
              >
                {rotating ? 'Rotating…' : 'Rotate ↻'}
              </button>
              {shown.id !== item.coverPhotoId && (
                <button type="button" className="secondary link" onClick={() => void setCoverPhoto(item.id, shown.id)}>
                  Use as main photo
                </button>
              )}
            </div>
          </div>
          {photos.length > 1 && (
            <ul className="photo-strip">
              {photos.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="photo-button"
                    aria-pressed={p.id === shown.id}
                    aria-label={`Show photo ${i + 1}`}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <BlobImage blob={p.thumb} alt="" className="photo-thumb" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p className="muted">No photos yet.</p>
      )}

      <section className="card">
        <div className="field">
          <label htmlFor="item-status-quick">Status</label>
          <select
            id="item-status-quick"
            value={item.status}
            onChange={(e) => void setStatus(item.id, e.target.value as ItemStatus)}
          >
            {ITEM_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <PassTo item={item} children={children} />
        <div className="button-row action-row">
          <a className="button" href={itemHref(item.id, 'update')}>
            Add update
          </a>
          <a className="button secondary-link outline-link" href={itemHref(item.id, 'sell')}>
            {item.status === 'sold' ? 'Sale details' : 'Sell'}
          </a>
          <a className="button secondary-link outline-link" href={itemHref(item.id, 'edit')}>
            Edit details
          </a>
        </div>
      </section>

      <section className="card" aria-labelledby="details-heading">
        <h2 id="details-heading">Details</h2>
        {item.description && <p>{item.description}</p>}
        <dl className="details">
          {details
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
      </section>

      <section className="card" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading">Timeline</h2>
        <Timeline events={events} photos={photos} children={children} onOpen={setLightbox} />
      </section>

      <button type="button" className="secondary danger wide" onClick={() => void remove()}>
        Delete item
      </button>

      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}
