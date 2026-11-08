/** Copies text; returns false if the browser refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const canShareFiles = (files: File[]): boolean =>
  typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files });

/**
 * Opens the iPhone share sheet with the photos, where "Save Images" puts them
 * in the camera roll (or they can go straight into a selling app).
 * Returns 'cancelled' if the person closed the sheet.
 */
export async function sharePhotos(files: File[]): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!canShareFiles(files)) return 'unsupported';
  try {
    await navigator.share({ files });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}

export const fileName = (title: string, index: number) =>
  `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'}-${index + 1}.jpg`;
