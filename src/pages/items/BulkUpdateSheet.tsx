import { useState, type FormEvent } from 'react';
import { hasBulkChanges, type BulkChanges } from '../../db/items.ts';
import { ITEM_STATUSES, SEASONS, type ItemStatus, type Season } from '../../domain/options.ts';
import type { Child } from '../../domain/types.ts';

const KEEP = '__keep__';

interface Props {
  count: number;
  people: Child[];
  storageLocations: string[];
  onApply: (changes: BulkChanges) => void;
  onCancel: () => void;
}

/** Pick what to change on the selected items; every field starts as "Leave as is". */
export function BulkUpdateSheet({ count, people, storageLocations, onApply, onCancel }: Props) {
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState(KEEP);
  const [who, setWho] = useState(KEEP);
  const [addSeason, setAddSeason] = useState('');
  const [removeSeason, setRemoveSeason] = useState('');

  const changes: BulkChanges = {
    storageLocation: location.trim() || undefined,
    status: status === KEEP ? undefined : (status as ItemStatus),
    childId: who === KEEP ? undefined : who,
    addSeason: (addSeason || undefined) as Season | undefined,
    removeSeason: (removeSeason || undefined) as Season | undefined,
  };
  const ready = hasBulkChanges(changes);
  const plural = count === 1 ? 'item' : 'items';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) onApply(changes);
  };

  return (
    <div className="sheet-backdrop">
      <form className="sheet stack" role="dialog" aria-modal="true" aria-label={`Update ${count} ${plural}`} onSubmit={submit}>
        <h2>
          Update {count} {plural}
        </h2>
        <p className="muted">Only what you change here is updated; everything else is left as it is.</p>

        <div className="field">
          <label htmlFor="bulk-location">Storage location</label>
          <input
            id="bulk-location"
            list="bulk-locations"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Leave as is"
            autoComplete="off"
          />
          <datalist id="bulk-locations">
            {storageLocations.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label htmlFor="bulk-status">Status</label>
          <select id="bulk-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value={KEEP}>Leave as is</option>
            {ITEM_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="bulk-who">Who</label>
          <select id="bulk-who" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value={KEEP}>Leave as is</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="">Not assigned</option>
          </select>
        </div>

        <div className="input-row">
          <div className="field">
            <label htmlFor="bulk-add-season">Add season</label>
            <select id="bulk-add-season" value={addSeason} onChange={(e) => setAddSeason(e.target.value)}>
              <option value="">None</option>
              {SEASONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bulk-remove-season">Remove season</label>
            <select id="bulk-remove-season" value={removeSeason} onChange={(e) => setRemoveSeason(e.target.value)}>
              <option value="">None</option>
              {SEASONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button type="submit" className="wide" disabled={!ready}>
          Update {count} {plural}
        </button>
        <button type="button" className="secondary wide" onClick={onCancel}>
          Cancel
        </button>
      </form>
    </div>
  );
}
