import type { Child } from '../domain/types.ts';
import { db, newId, now, type KeepsakeDB } from './db.ts';

export type ChildInput = Pick<Child, 'name' | 'birthDate' | 'clothingSize' | 'shoeSize'>;

function clean(input: ChildInput): ChildInput {
  const name = input.name.trim();
  if (!name) throw new Error('Name is required');
  return {
    name,
    birthDate: input.birthDate || undefined,
    clothingSize: input.clothingSize || undefined,
    shoeSize: input.shoeSize || undefined,
  };
}

export async function addChild(input: ChildInput, database: KeepsakeDB = db): Promise<Child> {
  const timestamp = now();
  const child: Child = { id: newId(), ...clean(input), createdAt: timestamp, updatedAt: timestamp };
  await database.children.add(child);
  return child;
}

export async function updateChild(
  id: string,
  input: ChildInput,
  database: KeepsakeDB = db,
): Promise<void> {
  const existing = await database.children.get(id);
  if (!existing) throw new Error('Child not found');
  await database.children.put({ ...existing, ...clean(input), updatedAt: now() });
}

/** Deletes a child. Their items are kept but become unassigned. */
export async function deleteChild(id: string, database: KeepsakeDB = db): Promise<void> {
  await database.transaction('rw', database.children, database.items, async () => {
    await database.items
      .where('childId')
      .equals(id)
      .modify((item) => {
        delete item.childId;
        item.updatedAt = now();
      });
    await database.children.delete(id);
  });
}

export function listChildren(database: KeepsakeDB = db): Promise<Child[]> {
  return database.children.orderBy('name').toArray();
}
