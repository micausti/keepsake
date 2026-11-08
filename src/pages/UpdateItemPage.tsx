import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { db } from '../db/db.ts';
import { DraftError, addUpdate } from '../db/items.ts';
import { CONDITIONS, CONDITION_LABELS, type Condition } from '../domain/options.ts';
import { itemHref, navigate } from '../ui/router.ts';
import { PhotoPicker, type PickedPhoto } from './add/PhotoPicker.tsx';

/** Adds a dated condition check, note and/or photos to an item's timeline. */
export function UpdateItemPage({ id }: { id: string }) {
  const item = useLiveQuery(() => db.items.get(id).then((i) => i ?? null), [id]);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [condition, setCondition] = useState<Condition | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (item === null) return <p>This item no longer exists.</p>;
  if (!item) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await addUpdate(id, { condition: condition || undefined, note, photos });
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
        <h1>Add update</h1>
        <p className="tagline">{item.title}</p>
      </header>
      <form className="card stack" onSubmit={(e) => void save(e)}>
        <div className="field">
          <span className="field-label">New photos (optional)</span>
          <PhotoPicker photos={photos} onChange={setPhotos} />
        </div>
        <div className="field">
          <label htmlFor="update-condition">Condition now</label>
          <select
            id="update-condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value as Condition | '')}
          >
            <option value="">
              No change{item.condition ? ` (${CONDITION_LABELS[item.condition]})` : ''}
            </option>
            {CONDITIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="update-note">Note</label>
          <textarea
            id="update-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Small hole in left knee; still fits"
          />
        </div>
        {error && (
          <p className="warning" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="wide" disabled={saving}>
          {saving ? 'Saving…' : 'Save update'}
        </button>
      </form>
    </>
  );
}
