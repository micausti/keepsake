import type { CategoryId, Condition, ItemStatus, Platform, Season } from './options.ts';

/** ISO 8601 timestamp, e.g. "2026-11-07T21:30:00.000Z". */
export type Timestamp = string;
/** Calendar date, e.g. "2026-11-07". */
export type IsoDate = string;

/**
 * A person whose things are tracked. Named Child for history; adults (e.g. the
 * owner) are people too, marked kind: 'adult'. Missing kind means a child.
 */
export interface Child {
  id: string;
  name: string;
  kind?: 'child' | 'adult';
  birthDate?: IsoDate;
  /** Current UK clothing size id (see CLOTHING_SIZES). */
  clothingSize?: string;
  /** Current UK shoe size id (see SHOE_SIZES). */
  shoeSize?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Item {
  id: string;
  /** Short name, e.g. "Navy puffer coat". */
  title: string;
  category: CategoryId;
  /** Unassigned items (e.g. shared toys) have no child. */
  childId?: string;
  /** Size id from the category's size scale. */
  size?: string;
  seasons: Season[];
  brand?: string;
  colour?: string;
  material?: string;
  description?: string;
  condition?: Condition;
  conditionNotes?: string;
  status: ItemStatus;
  storageLocation?: string;
  pricePaidPence?: number;
  /** Asking price while listed. */
  listPricePence?: number;
  /** Where it's currently listed. */
  listedOn?: Platform[];
  listedAt?: Timestamp;
  salePricePence?: number;
  salePlatform?: Platform;
  soldAt?: Timestamp;
  coverPhotoId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** A photo of an item. Several per item form a dated timeline. */
export interface Photo {
  id: string;
  itemId: string;
  /** When the photo was taken (from the camera, before EXIF is stripped). */
  takenAt: Timestamp;
  /** JPEG, about 1600px on the long edge (older photos may be 2000px), with EXIF/GPS removed. */
  blob: Blob;
  /** Small JPEG (~400px) for lists. */
  thumb: Blob;
  width: number;
  height: number;
  createdAt: Timestamp;
}

/** One entry in an item's history: a condition check, status change or note. */
export interface ItemEvent {
  id: string;
  itemId: string;
  at: Timestamp;
  kind: 'created' | 'condition' | 'status' | 'note' | 'photos' | 'handdown';
  condition?: Condition;
  status?: ItemStatus;
  note?: string;
  photoIds?: string[];
  /** For hand-downs: who it passed from and to. */
  fromChildId?: string;
  toChildId?: string;
}

export type Person = Child;

export const isAdult = (person: Pick<Child, 'kind'> | undefined): boolean => person?.kind === 'adult';

/** Children only (adults don't grow, so Gaps and passing on ignore them). */
export const childrenOnly = <T extends Pick<Child, 'kind'>>(people: T[]): T[] => people.filter((p) => !isAdult(p));
