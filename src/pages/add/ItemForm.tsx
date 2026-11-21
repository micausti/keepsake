import type { ReactNode } from 'react';
import type { SUGGESTION_FIELDS } from '../../ai/schema.ts';
import { sizeKeptFor, type ItemDraft } from '../../domain/draft.ts';
import {
  CATEGORIES,
  CONDITIONS,
  ITEM_STATUSES,
  SEASONS,
  categoryById,
  type CategoryId,
  type Season,
} from '../../domain/options.ts';
import { adultSizeSuggestions, sizesFor } from '../../domain/sizes.ts';
import { isAdult, type Child } from '../../domain/types.ts';

export type SuggestedField = (typeof SUGGESTION_FIELDS)[number];

interface Props {
  draft: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
  children: Child[];
  storageLocations: string[];
  /** Fields Claude wasn't sure about; shown with a "check" badge. */
  uncertain: ReadonlySet<SuggestedField>;
}

const GROUPS = [...new Set(CATEGORIES.map((c) => c.group))];

function Row(props: { id: string; label: string; check?: boolean; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={props.id}>
        {props.label}
        {props.check && <span className="check-badge">check</span>}
      </label>
      {props.children}
    </div>
  );
}

export function ItemForm({ draft, onChange, children, storageLocations, uncertain }: Props) {
  const system = draft.category ? categoryById(draft.category).sizeSystem : 'none';
  const owner = children.find((c) => c.id === draft.childId);
  const adult = isAdult(owner);
  const sizeOptions = adult ? [] : sizesFor(system);
  const adultSuggestions = adult ? adultSizeSuggestions(system) : [];
  const text = (field: keyof ItemDraft) => ({
    value: draft[field] as string,
    onChange: (e: { target: { value: string } }) => onChange({ [field]: e.target.value }),
  });
  const toggleSeason = (s: Season) =>
    onChange({
      seasons: draft.seasons.includes(s) ? draft.seasons.filter((x) => x !== s) : [...draft.seasons, s],
    });

  return (
    <div className="stack">
      <Row id="item-title" label="Name" check={uncertain.has('title')}>
        <input id="item-title" {...text('title')} placeholder="e.g. Navy padded coat" required />
      </Row>

      <Row id="item-category" label="Category" check={uncertain.has('category')}>
        <select
          id="item-category"
          value={draft.category}
          onChange={(e) => {
            const category = e.target.value as CategoryId | '';
            onChange({ category, size: sizeKeptFor(owner, category, draft.size) ? draft.size : '' });
          }}
          required
        >
          <option value="">Choose…</option>
          {GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {CATEGORIES.filter((c) => c.group === group).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Row>

      <Row id="item-child" label="Who">
        <select
          id="item-child"
          value={draft.childId}
          onChange={(e) => {
            const childId = e.target.value;
            const next = children.find((c) => c.id === childId);
            onChange({ childId, size: sizeKeptFor(next, draft.category, draft.size) ? draft.size : '' });
          }}
        >
          <option value="">Not assigned</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Row>

      {adultSuggestions.length > 0 && (
        <Row id="item-size" label="Size" check={uncertain.has('size')}>
          <input
            id="item-size"
            list="adult-sizes"
            {...text('size')}
            placeholder={system === 'shoes' ? 'e.g. UK 6' : 'e.g. M, UK 10, W30 L32'}
            autoCapitalize="characters"
            autoComplete="off"
          />
          <datalist id="adult-sizes">
            {adultSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Row>
      )}

      {sizeOptions.length > 0 && (
        <Row id="item-size" label={system === 'toy_age' ? 'Age' : 'Size'} check={uncertain.has('size')}>
          <select id="item-size" {...text('size')}>
            <option value="">Not set</option>
            {sizeOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Row>
      )}

      <fieldset className="field">
        <legend>
          Seasons
          {uncertain.has('seasons') && <span className="check-badge">check</span>}
        </legend>
        <div className="chips">
          {SEASONS.map((s) => (
            <label key={s.id} className="chip">
              <input
                type="checkbox"
                checked={draft.seasons.includes(s.id)}
                onChange={() => toggleSeason(s.id)}
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Row id="item-condition" label="Condition" check={uncertain.has('condition')}>
        <select id="item-condition" {...text('condition')}>
          <option value="">Not set</option>
          {CONDITIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Row>

      <Row id="item-condition-notes" label="Condition notes">
        <textarea
          id="item-condition-notes"
          rows={2}
          {...text('conditionNotes')}
          placeholder="Stains, wear, missing parts…"
        />
      </Row>

      <Row id="item-status" label="Status">
        <select id="item-status" {...text('status')}>
          {ITEM_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Row>

      <Row id="item-brand" label="Brand" check={uncertain.has('brand')}>
        <input id="item-brand" {...text('brand')} />
      </Row>
      <Row id="item-colour" label="Colour" check={uncertain.has('colour')}>
        <input id="item-colour" {...text('colour')} />
      </Row>
      <Row id="item-material" label="Material" check={uncertain.has('material')}>
        <input id="item-material" {...text('material')} />
      </Row>

      <Row id="item-description" label="Description" check={uncertain.has('description')}>
        <textarea id="item-description" rows={4} {...text('description')} />
      </Row>

      <Row id="item-location" label="Storage location">
        <input id="item-location" list="known-locations" {...text('storageLocation')} placeholder="e.g. Loft box 3" />
        <datalist id="known-locations">
          {storageLocations.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </Row>

      <Row id="item-price-paid" label="Price paid (£)">
        <input id="item-price-paid" inputMode="decimal" {...text('pricePaid')} placeholder="Optional" />
      </Row>
    </div>
  );
}
