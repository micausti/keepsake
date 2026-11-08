import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { db } from '../db/db.ts';
import { DraftError, draftFromItem, knownStorageLocations, updateItem } from '../db/items.ts';
import type { ItemDraft } from '../domain/draft.ts';
import { itemHref, navigate } from '../ui/router.ts';
import { ItemForm } from './add/ItemForm.tsx';

const NO_UNCERTAIN = new Set<never>();

export function EditItemPage({ id }: { id: string }) {
  const item = useLiveQuery(() => db.items.get(id).then((i) => i ?? null), [id]);
  const children = useLiveQuery(() => db.children.orderBy('name').toArray());
  const locations = useLiveQuery(() => knownStorageLocations()) ?? [];
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (item === null) return <p>This item no longer exists.</p>;
  if (!item || !children) return null;
  const current = draft ?? draftFromItem(item);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateItem(id, current);
      navigate(itemHref(id), { replace: true });
    } catch (err) {
      setError(err instanceof DraftError ? err.message : 'Could not save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <>
      <a className="back-link" href={itemHref(id)}>
        ‹ Back
      </a>
      <header className="page-header">
        <h1>Edit item</h1>
      </header>
      <form className="card" onSubmit={(e) => void save(e)}>
        <ItemForm
          draft={current}
          onChange={(patch) => setDraft({ ...current, ...patch })}
          children={children}
          storageLocations={locations}
          uncertain={NO_UNCERTAIN}
        />
        {error && (
          <p className="warning" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="wide" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <a className="button secondary-link wide" href={itemHref(id)}>
          Cancel
        </a>
      </form>
    </>
  );
}
