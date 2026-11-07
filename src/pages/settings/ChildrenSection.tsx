import { useState, type FormEvent } from 'react';
import { addChild, deleteChild, updateChild, type ChildInput } from '../../db/children.ts';
import type { Child } from '../../domain/types.ts';
import {
  CLOTHING_SIZES,
  SHOE_SIZES,
  clothingSizeForAge,
  formatAge,
  sizeLabel,
} from '../../domain/sizes.ts';
import { SizeSelect } from '../../ui/SizeSelect.tsx';

const EMPTY: ChildInput = { name: '', birthDate: '', clothingSize: '', shoeSize: '' };

function ChildForm({
  initial,
  onDone,
  idPrefix,
}: {
  initial?: Child;
  onDone: () => void;
  idPrefix: string;
}) {
  const [form, setForm] = useState<ChildInput>(initial ? { ...EMPTY, ...initial } : EMPTY);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ChildInput>) => setForm((f) => ({ ...f, ...patch }));
  const today = new Date().toISOString().slice(0, 10);
  const suggested = form.birthDate ? clothingSizeForAge(form.birthDate) : undefined;

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
      {error && <p className="warning">{error}</p>}
      <div className="button-row">
        <button type="submit">{initial ? 'Save' : 'Add child'}</button>
        <button type="button" className="secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ChildrenSection({ items }: { items: Child[] }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const remove = async (child: Child) => {
    const ok = window.confirm(
      `Remove ${child.name}? Their items will be kept but no longer assigned to anyone.`,
    );
    if (ok) await deleteChild(child.id);
  };

  return (
    <section className="card" aria-labelledby="children-settings-heading">
      <h2 id="children-settings-heading">Children</h2>
      {items.length === 0 && editing !== 'new' && <p className="muted">No children added yet.</p>}
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
                  {[
                    child.birthDate && formatAge(child.birthDate),
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
      {editing === 'new' ? (
        <ChildForm idPrefix="new-child" onDone={() => setEditing(null)} />
      ) : (
        <button type="button" onClick={() => setEditing('new')}>
          Add a child
        </button>
      )}
    </section>
  );
}
