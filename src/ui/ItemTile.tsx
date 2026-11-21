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

/** A square photo tile for the Items grid; the item's name shows if it has no photo. */
export function ItemTile({ item }: { item: Item }) {
  const [ref, near] = useNearScreen<HTMLAnchorElement>();
  const thumb = useLiveQuery(
    () => (near && item.coverPhotoId ? db.photos.get(item.coverPhotoId).then((p) => p?.thumb) : undefined),
    [near, item.coverPhotoId],
  );
  return (
    <li>
      <a ref={ref} className="item-tile" href={itemHref(item.id)} aria-label={item.title}>
        {item.coverPhotoId ? (
          <BlobImage blob={thumb} alt="" className="item-tile-photo" />
        ) : (
          <span className="item-tile-name">{item.title}</span>
        )}
      </a>
    </li>
  );
}
