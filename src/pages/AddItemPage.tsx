import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type FormEvent } from 'react';
import type { DescribeResult } from '../ai/describe.ts';
import { db } from '../db/db.ts';
import { DraftError, createItem, knownStorageLocations } from '../db/items.ts';
import { getSettings } from '../db/settings.ts';
import { getStorageStatus, requestPersistentStorage } from '../db/storage.ts';
import { draftFromSuggestion, emptyDraft, type ItemDraft } from '../domain/draft.ts';
import type { Item } from '../domain/types.ts';
import { hrefFor } from '../ui/router.ts';
import { ItemForm, type SuggestedField } from './add/ItemForm.tsx';
import { PhotoPicker, type PickedPhoto } from './add/PhotoPicker.tsx';

type Stage =
  | { name: 'photos' }
  | { name: 'analysing' }
  | { name: 'review'; aiError?: string }
  | { name: 'saved'; item: Item };

interface Session {
  stage: Stage;
  photos: PickedPhoto[];
  draft: ItemDraft | null;
  uncertain: SuggestedField[];
}

const fresh = (): Session => ({ stage: { name: 'photos' }, photos: [], draft: null, uncertain: [] });

// Kept in memory so switching tabs mid-way doesn't lose the photos and draft.
let remembered: Session = fresh();

export function AddItemPage() {
  const settings = useLiveQuery(() => getSettings());
  const children = useLiveQuery(() => db.children.orderBy('name').toArray());
  const locations = useLiveQuery(() => knownStorageLocations()) ?? [];
  const [session, setSession] = useState<Session>(remembered);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    remembered = session.stage.name === 'saved' ? fresh() : session;
  }, [session]);

  if (!settings || !children) return null;

  const update = (patch: Partial<Session>) => setSession((s) => ({ ...s, ...patch }));
  const draft = session.draft ?? emptyDraft(children);
  const { stage, photos } = session;

  const runAi = async () => {
    if (!settings.apiKey) return;
    update({ stage: { name: 'analysing' } });
    // Loaded on demand: the SDK and schema code aren't needed until now.
    const { describeItem } = await import('../ai/describe.ts');
    const result: DescribeResult = await describeItem(
      settings.apiKey,
      settings.model,
      photos.map((p) => p.ai),
    );
    setSession((s) =>
      result.ok
        ? {
            ...s,
            stage: { name: 'review' },
            draft: draftFromSuggestion(result.suggestion, children, s.draft ?? emptyDraft(children)),
            uncertain: result.suggestion.uncertain,
          }
        : { ...s, stage: { name: 'review', aiError: result.message } },
    );
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const item = await createItem(draft, photos);
      setSession({ ...fresh(), stage: { name: 'saved', item } });
      // Once there's real data, ask the browser not to evict it.
      const storage = await getStorageStatus();
      if (storage.supported && !storage.persisted) void requestPersistentStorage();
    } catch (err) {
      setSaveError(err instanceof DraftError ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const startOver = () => {
    if (photos.length || session.draft) {
      if (!window.confirm('Discard this item?')) return;
    }
    setSession(fresh());
  };

  if (stage.name === 'saved') {
    return (
      <>
        <header className="page-header">
          <h1>Saved</h1>
        </header>
        <section className="card">
          <p>
            <strong>{stage.item.title}</strong> is in your inventory.
          </p>
          <div className="button-row">
            <button type="button" onClick={() => setSession(fresh())}>
              Add another item
            </button>
            <a className="button secondary-link" href={hrefFor('home')}>
              Done
            </a>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <header className="page-header">
        <h1>Add an item</h1>
      </header>

      <section className="card" aria-labelledby="photos-heading">
        <h2 id="photos-heading">Photos</h2>
        <p className="muted">
          Up to 4 photos of one item. Include the size label and any brand tag if you can.
        </p>
        <PhotoPicker photos={photos} onChange={(next) => update({ photos: next })} />
      </section>

      {stage.name === 'photos' && (
        <section className="card">
          {settings.apiKey ? (
            <button type="button" className="wide" disabled={!photos.length} onClick={() => void runAi()}>
              Fill in details with AI
            </button>
          ) : (
            <p className="muted">
              Add your Anthropic API key in <a href={hrefFor('settings')}>Settings</a> to have the details
              filled in for you.
            </p>
          )}
          <button
            type="button"
            className="secondary wide"
            onClick={() => update({ stage: { name: 'review' }, draft: draft })}
          >
            Fill in myself
          </button>
        </section>
      )}

      {stage.name === 'analysing' && (
        <section className="card" aria-live="polite">
          <p className="analysing">Claude is looking at the photos…</p>
          <p className="muted">This usually takes 5–15 seconds.</p>
        </section>
      )}

      {stage.name === 'review' && (
        <form className="card" onSubmit={(e) => void save(e)} aria-labelledby="details-heading">
          <h2 id="details-heading">Details</h2>
          {stage.aiError ? (
            <div className="notice">
              <p className="warning">{stage.aiError}</p>
              {settings.apiKey && photos.length > 0 && (
                <button type="button" className="secondary outline" onClick={() => void runAi()}>
                  Try AI again
                </button>
              )}
            </div>
          ) : (
            session.uncertain.length > 0 && (
              <p className="muted">
                Filled in by Claude. Fields marked <span className="check-badge">check</span> were guesses.
              </p>
            )
          )}
          <ItemForm
            draft={draft}
            onChange={(patch) => update({ draft: { ...draft, ...patch } })}
            children={children}
            storageLocations={locations}
            uncertain={new Set(session.uncertain)}
          />
          {saveError && (
            <p className="warning" role="alert">
              {saveError}
            </p>
          )}
          <button type="submit" className="wide" disabled={saving}>
            {saving ? 'Saving…' : 'Save item'}
          </button>
        </form>
      )}

      {(photos.length > 0 || session.draft) && stage.name !== 'analysing' && (
        <button type="button" className="secondary danger wide" onClick={startOver}>
          Discard and start again
        </button>
      )}
    </>
  );
}
