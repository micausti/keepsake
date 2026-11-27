import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { db } from '../db/db.ts';
import type { Item } from '../domain/types.ts';
import { BlobImage } from './BlobImage.tsx';
import { itemHref } from './router.ts';

/** True once the element has come near the screen (always true without IntersectionObserver). */
function useNearScreen<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (near || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px 0px' }, // start loading a little before it scrolls into view
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [near]);
  return [ref, near];
}

interface Props {
  item: Item;
  /** In select mode a tap ticks the tile instead of opening the item. */
  selection?: { selected: boolean; onToggle: () => void };
}

/** A square photo tile for the Items grid; the item's name shows if it has no photo. */
export function ItemTile({ item, selection }: Props) {
  const [ref, near] = useNearScreen<HTMLElement>();
  const thumb = useLiveQuery(
    () => (near && item.coverPhotoId ? db.photos.get(item.coverPhotoId).then((p) => p?.thumb) : undefined),
    [near, item.coverPhotoId],
  );
  const content = item.coverPhotoId ? (
    <BlobImage blob={thumb} alt="" className="item-tile-photo" />
  ) : (
    <span className="item-tile-name">{item.title}</span>
  );
  return (
    <li>
      {selection ? (
        <button
          ref={ref as RefObject<HTMLButtonElement>}
          type="button"
          className="item-tile selectable"
          aria-label={item.title}
          aria-pressed={selection.selected}
          onClick={selection.onToggle}
        >
          {content}
          <span className="item-tile-check" aria-hidden="true">
            {selection.selected ? '✓' : ''}
          </span>
        </button>
      ) : (
        <a ref={ref as RefObject<HTMLAnchorElement>} className="item-tile" href={itemHref(item.id)} aria-label={item.title}>
          {content}
        </a>
      )}
    </li>
  );
}
