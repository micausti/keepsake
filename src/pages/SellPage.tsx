import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { db } from '../db/db.ts';
import { DraftError, markListed, markSold, unlist } from '../db/items.ts';
import { formatDate } from '../domain/dates.ts';
import { LISTING_PLATFORMS, buildListing, type Listing, type ListingPlatform } from '../domain/listing.ts';
import { formatPence, parsePounds } from '../domain/money.ts';
import { PLATFORM_LABELS, PLATFORMS, type Platform } from '../domain/options.ts';
import type { Item, Photo } from '../domain/types.ts';
import { BlobImage } from '../ui/BlobImage.tsx';
import { itemHref } from '../ui/router.ts';
import { copyText, fileName, sharePhotos } from '../ui/share.ts';

let rememberedPlatform: ListingPlatform = 'vinted';
const rememberPlatform = (p: ListingPlatform) => {
  rememberedPlatform = p;
};

const poundsText = (pence?: number) => (pence === undefined ? '' : (pence / 100).toFixed(2));

function CopyRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <div className="copy-row">
      <div className="copy-text">
        <span className="copy-label">{label}</span>
        {multiline ? <pre className="copy-value">{value}</pre> : <span className="copy-value">{value}</span>}
      </div>
      <button
        type="button"
        className="secondary outline copy-button"
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={() => void copyText(value).then((ok) => setState(ok ? 'copied' : 'failed'))}
      >
        {state === 'copied' ? 'Copied ✓' : state === 'failed' ? 'Failed' : 'Copy'}
      </button>
    </div>
  );
}

/** "8" → "8.00"; anything unparseable is shown as typed. */
function priceText(text: string): string {
  const pence = parsePounds(text);
  return pence === undefined ? text : (pence / 100).toFixed(2);
}

function ListingCard({ listing, price, platform }: { listing: Listing; price: string; platform: ListingPlatform }) {
  const rows: [string, string | undefined, boolean?][] = [
    ['Title', listing.title],
    ['Description', listing.description, true],
    ['Condition', listing.condition],
    ['Size', listing.size],
    ['Brand', listing.brand],
    ['Colour', listing.colour],
    ['Price', price ? priceText(price) : undefined],
  ];
  return (
    <section className="card" aria-label={`${PLATFORM_LABELS[platform]} listing`}>
      {rows
        .filter(([, value]) => value)
        .map(([label, value, multiline]) => (
          <CopyRow key={label} label={label} value={value ?? ''} multiline={multiline} />
        ))}
      {platform === 'depop' && <p className="muted">Depop has no title: the first line of the description is used.</p>}
    </section>
  );
}

function SavePhotos({ item, photos }: { item: Item; photos: Photo[] }) {
  const [message, setMessage] = useState<string | null>(null);
  const files = useMemo(
    () => photos.map((p, i) => new File([p.blob], fileName(item.title, i), { type: 'image/jpeg' })),
    [photos, item.title],
  );
  const save = async () => {
    setMessage(null);
    try {
      const result = await sharePhotos(files);
      if (result === 'unsupported') setMessage('This browser can’t share photos. Tap and hold each photo to save it.');
    } catch {
      setMessage('Couldn’t open the share sheet. Tap and hold each photo to save it.');
    }
  };
  if (!photos.length) return null;
  return (
    <section className="card" aria-labelledby="sell-photos">
      <h2 id="sell-photos">Photos</h2>
      <div className="sell-photos">
        {photos.map((p, i) => (
          <BlobImage key={p.id} blob={p.blob} alt={`Photo ${i + 1}`} className="sell-photo" />
        ))}
      </div>
      <button type="button" className="wide" onClick={() => void save()}>
        Save or share {photos.length === 1 ? 'photo' : `${photos.length} photos`}
      </button>
      <p className="muted">Opens the share sheet: choose “Save Images”, or send them straight to the app.</p>
      {message && <p className="warning">{message}</p>}
    </section>
  );
}

function StatusCard({ item, platform, price }: { item: Item; platform: ListingPlatform; price: string }) {
  const [platforms, setPlatforms] = useState<Platform[]>(item.listedOn ?? [platform]);
  const [soldOn, setSoldOn] = useState<Platform>(item.listedOn?.[0] ?? platform);
  const [soldFor, setSoldFor] = useState(poundsText(item.listPricePence));
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof DraftError ? err.message : 'Could not save. Please try again.');
    }
  };
  const pence = (text: string) => {
    if (!text.trim()) return undefined;
    const value = parsePounds(text);
    if (value === undefined) throw new DraftError('Prices should look like 8.50');
    return value;
  };

  if (item.status === 'sold') {
    return (
      <section className="card" aria-labelledby="sell-status">
        <h2 id="sell-status">Sold</h2>
        <p>
          Sold{item.salePlatform ? ` on ${PLATFORM_LABELS[item.salePlatform]}` : ''}
          {item.salePricePence !== undefined ? ` for ${formatPence(item.salePricePence)}` : ''}
          {item.soldAt ? ` on ${formatDate(item.soldAt)}` : ''}.
        </p>
      </section>
    );
  }

  const markSoldForm = (e: FormEvent) => {
    e.preventDefault();
    void run(() => markSold(item.id, { platform: soldOn, pricePence: pence(soldFor) }));
  };

  return (
    <section className="card stack" aria-labelledby="sell-status">
      <h2 id="sell-status">{item.status === 'listed' ? 'Listed' : 'Track it'}</h2>
      {item.status === 'listed' && (
        <p>
          On {(item.listedOn ?? []).map((p) => PLATFORM_LABELS[p]).join(', ')}
          {item.listPricePence !== undefined ? ` at ${formatPence(item.listPricePence)}` : ''}
          {item.listedAt ? ` since ${formatDate(item.listedAt)}` : ''}.
        </p>
      )}
      <fieldset className="field">
        <legend>{item.status === 'listed' ? 'Listed on' : 'Where did you list it?'}</legend>
        <div className="chips">
          {PLATFORMS.map((p) => (
            <label key={p.id} className="chip">
              <input
                type="checkbox"
                checked={platforms.includes(p.id)}
                onChange={() =>
                  setPlatforms((list) => (list.includes(p.id) ? list.filter((x) => x !== p.id) : [...list, p.id]))
                }
              />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>
      <button
        type="button"
        className={item.status === 'listed' ? 'secondary outline' : ''}
        onClick={() => void run(() => markListed(item.id, { platforms, pricePence: pence(price) }))}
      >
        {item.status === 'listed' ? 'Update listing' : 'Mark as listed'}
      </button>

      <form className="stack sold-form" onSubmit={markSoldForm}>
        <h3>Sold it?</h3>
        <div className="input-row">
          <div className="field">
            <label htmlFor="sold-on">Sold on</label>
            <select id="sold-on" value={soldOn} onChange={(e) => setSoldOn(e.target.value as Platform)}>
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sold-for">For (£)</label>
            <input id="sold-for" inputMode="decimal" value={soldFor} onChange={(e) => setSoldFor(e.target.value)} />
          </div>
        </div>
        <button type="submit">Mark as sold</button>
      </form>
      {item.status === 'listed' && (
        <button type="button" className="secondary" onClick={() => void run(() => unlist(item.id))}>
          Take off sale
        </button>
      )}
      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function SellPage({ id }: { id: string }) {
  const item = useLiveQuery(() => db.items.get(id).then((i) => i ?? null), [id]);
  const photos = useLiveQuery(() => db.photos.where('itemId').equals(id).sortBy('takenAt'), [id]);
  const [platform, setPlatform] = useState<ListingPlatform>(rememberedPlatform);
  const [price, setPrice] = useState<string | null>(null);

  if (item === null) return <p>This item no longer exists.</p>;
  if (!item || !photos) return null;

  // Cover photo first: it's the one platforms show in search results.
  const ordered = [...photos].sort((a, b) => Number(b.id === item.coverPhotoId) - Number(a.id === item.coverPhotoId));
  const askingPrice = price ?? poundsText(item.listPricePence);
  const choose = (p: ListingPlatform) => {
    rememberPlatform(p);
    setPlatform(p);
  };

  return (
    <>
      <a className="back-link" href={itemHref(id)}>
        ‹ Back
      </a>
      <header className="page-header">
        <h1>Sell</h1>
        <p className="tagline">{item.title}</p>
      </header>

      <div className="segmented" role="tablist" aria-label="Platform">
        {LISTING_PLATFORMS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={p === platform}
            className={p === platform ? 'selected' : ''}
            onClick={() => choose(p)}
          >
            {p === 'facebook' ? 'Facebook' : PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="field asking-price">
        <label htmlFor="asking-price">Asking price (£)</label>
        <input
          id="asking-price"
          inputMode="decimal"
          placeholder={item.pricePaidPence !== undefined ? `Paid ${formatPence(item.pricePaidPence)}` : 'e.g. 8.00'}
          value={askingPrice}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>

      <ListingCard listing={buildListing(item, platform)} price={askingPrice} platform={platform} />
      <SavePhotos item={item} photos={ordered} />
      <StatusCard key={item.status} item={item} platform={platform} price={askingPrice} />
    </>
  );
}
