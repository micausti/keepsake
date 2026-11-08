import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.ts';
import { CATEGORY_LABELS, STATUS_LABELS, categoryById } from '../domain/options.ts';
import { sizeLabel } from '../domain/sizes.ts';
import type { Child, Item } from '../domain/types.ts';
import { BlobImage } from './BlobImage.tsx';
import { itemHref } from './router.ts';

export function ItemRow({ item, children }: { item: Item; children: Child[] }) {
  const thumb = useLiveQuery(
    () => (item.coverPhotoId ? db.photos.get(item.coverPhotoId).then((p) => p?.thumb) : undefined),
    [item.coverPhotoId],
  );
  const child = children.find((c) => c.id === item.childId);
  const size = sizeLabel(categoryById(item.category).sizeSystem, item.size);
  return (
    <li>
      <a className="item-row" href={itemHref(item.id)}>
        <BlobImage blob={thumb} alt="" className="item-thumb" />
        <div className="item-row-text">
          <strong>{item.title}</strong>
          <div className="muted">
            {[CATEGORY_LABELS[item.category], size, child?.name, STATUS_LABELS[item.status]]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <span className="chevron" aria-hidden="true">
          ›
        </span>
      </a>
    </li>
  );
}
