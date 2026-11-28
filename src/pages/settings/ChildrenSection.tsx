import { useState, type FormEvent } from 'react';
import { addChild, deleteChild, updateChild, type ChildInput } from '../../db/children.ts';
import { isAdult, type Child } from '../../domain/types.ts';
import {
  CLOTHING_SIZES,
  SHOE_SIZES,
  clothingSizeForAge,
  formatAge,
  sizeLabel,
} from '../../domain/sizes.ts';
import { SizeSelect } from '../../ui/SizeSelect.tsx';
import { localDateString, useToday } from '../../ui/today.ts';

const EMPTY: ChildInput = { name: '', birthDate: '', clothingSize: '', shoeSize: '' };

function ChildForm({
  initial,
  kind = 'child',
  onDone,
  idPrefix,
}: {
  initial?: Child;
  kind?: 'child' | 'adult';
  onDone: () => void;
  idPrefix: string;
}) {
  const [form, setForm] = useState<ChildInput>(initial ? { ...EMPTY, ...initial } : { ...EMPTY, kind });
  const adult = form.kind === 'adult';
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ChildInput>) => setForm((f) => ({ ...f, ...patch }));
  const now = useToday();
  const today = localDateString(now);
  const suggested = form.birthDate ? clothingSizeForAge(form.birthDate, now) : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (initial) await updateChild(initial.id, form);
      else await addChild(form);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  };

  return (
    <form className="stack child-form" onSubmit={(e) => void submit(e)}>
      <div className="field">
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <input
          id={`${idPrefix}-name`}
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          autoComplete="off"
          required
        />
      </div>
      {adult ? (
        <p className="muted">Adults just need a name. Sizes are added on each item.</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor={`${idPrefix}-dob`}>Date of birth (optional)</label>
            <input
              id={`${idPrefix}-dob`}
              type="date"
              max={today}
              value={form.birthDate ?? ''}
              onChange={(e) => set({ birthDate: e.target.value })}
            />
          </div>
          <SizeSelect
            id={`${idPrefix}-clothing`}
            label="Clothing size now"
            options={CLOTHING_SIZES}
            value={form.clothingSize ?? ''}
            onChange={(clothingSize) => set({ clothingSize })}
          />
          {suggested && suggested !== form.clothingSize && (
            <button type="button" className="secondary link" onClick={() => set({ clothingSize: suggested })}>
              Use {sizeLabel('clothing', suggested)} (matches their age)
            </button>
          )}
          <SizeSelect
            id={`${idPrefix}-shoes`}
            label="Shoe size now"
            options={SHOE_SIZES}
            value={form.shoeSize ?? ''}
            onChange={(shoeSize) => set({ shoeSize })}
          />
        </>
      )}
      {error && <p className="warning">{error}</p>}
      <div className="button-row">
        <button type="submit">{initial ? 'Save' : adult ? 'Add adult' : 'Add child'}</button>
        <button type="button" className="secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ChildrenSection({ items }: { items: Child[] }) {
  const [editing, setEditing] = useState<string | 'new-child' | 'new-adult' | null>(null);
  const today = useToday();

  const remove = async (child: Child) => {
    const ok = window.confirm(
      `Remove ${child.name}? Their items will be kept but no longer assigned to anyone.`,
    );
    if (ok) await deleteChild(child.id);
  };

  return (
    <section className="card" aria-labelledby="children-settings-heading">
      <h2 id="children-settings-heading">People</h2>
      {items.length === 0 && !editing && <p className="muted">Add your children, and yourself to track your own things.</p>}
      <ul className="plain-list">
        {items.map((child) =>
          editing === child.id ? (
            <li key={child.id}>
              <ChildForm initial={child} idPrefix={`child-${child.id}`} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={child.id} className="child-row">
              <div>
                <strong>{child.name}</strong>
                <div className="muted">
                  {isAdult(child)
                    ? 'Adult'
                    : [
                        child.birthDate && formatAge(child.birthDate, today),
                        sizeLabel('clothing', child.clothingSize),
                        child.shoeSize && `Shoes ${sizeLabel('shoes', child.shoeSize)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'No sizes set'}
                </div>
              </div>
              <div className="button-row">
                <button type="button" className="secondary" onClick={() => setEditing(child.id)}>
                  Edit
                </button>
                <button type="button" className="secondary danger" onClick={() => void remove(child)}>
                  Remove
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
      {editing === 'new-child' || editing === 'new-adult' ? (
        <ChildForm
          idPrefix={editing}
          kind={editing === 'new-adult' ? 'adult' : 'child'}
          onDone={() => setEditing(null)}
        />
      ) : (
        <div className="button-row">
          <button type="button" onClick={() => setEditing('new-child')}>
            Add a child
          </button>
          <button type="button" className="secondary outline" onClick={() => setEditing('new-adult')}>
            Add an adult (e.g. you)
          </button>
        </div>
      )}
    </section>
  );
}
