import { expect, test } from '@playwright/test';
import { storedPhotos, watchForProblems } from './helpers.ts';

test('photos saved at the old 2000px size can be made smaller', async ({ page }) => {
  const checkProblems = watchForProblems(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  // A photo as it was saved before: 2000×1500, red left half, blue right.
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2000;
    canvas.height = 1500;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    // Noise makes the JPEG big enough that re-saving clearly shrinks it.
    const pixels = ctx.createImageData(2000, 1500);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const red = (i / 4) % 2000 < 1000;
      const n = Math.random() * 60;
      pixels.data[i] = red ? 195 + n : n;
      pixels.data[i + 1] = n;
      pixels.data[i + 2] = red ? n : 195 + n;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.95));
    const request = indexedDB.open('keepsake');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').put({
        id: 'old-photo',
        itemId: 'old-item',
        takenAt: '2025-06-14T09:30:05.000Z',
        blob,
        thumb: blob,
        width: 2000,
        height: 1500,
        createdAt: '2025-06-14T09:30:05.000Z',
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  const before = (await storedPhotos(page))[0];
  await page.reload();

  await expect(page.getByText(/1 photos are saved at the old, larger size/)).toBeVisible();
  await page.getByRole('button', { name: 'Make photos smaller' }).click();
  await expect(page.getByText(/✓ 1 photos made smaller/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make photos smaller' })).toHaveCount(0);

  const [after] = await storedPhotos(page);
  expect(after?.size).toEqual([1600, 1200]);
  expect(after?.colours).toEqual({ top: expect.any(String), bottom: expect.any(String), left: 'r', right: 'b' });
  expect(after?.text.length ?? Infinity).toBeLessThan(before?.text.length ?? 0);
  checkProblems();
});
