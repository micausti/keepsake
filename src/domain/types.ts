import type { CategoryId, Condition, ItemStatus, Platform, Season } from './options.ts';

/** ISO 8601 timestamp, e.g. "2026-11-07T21:30:00.000Z". */
export type Timestamp = string;
/** Calendar date, e.g. "2026-11-07". */
export type IsoDate = string;

export interface Child {
  id: string;
  name: string;
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
  salePricePence?: number;
  salePlatform?: Platform;
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
  /** JPEG, about 2000px on the long edge, with EXIF/GPS removed. */
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
  kind: 'created' | 'condition' | 'status' | 'note' | 'photos';
  condition?: Condition;
  status?: ItemStatus;
  note?: string;
  photoIds?: string[];
}
