import { expect, test } from '@playwright/test';
import { GPS_MARKER, makePhoto, storedPhotos, watchForProblems } from './helpers.ts';

const suggestion = {
  title: 'Navy padded coat',
  category: 'outerwear',
  sizeOnLabel: '2-3 Y',
  size: '2-3y',
  seasons: ['autumn', 'winter'],
  brand: null,
  colour: 'Navy',
  material: null,
  condition: 'very_good',
  conditionNotes: null,
  description: 'Warm padded coat with a hood.',
  uncertain: ['brand'],
};

test('set up, add an item with AI, browse, update, sell, hand down, back up and restore, work offline', async ({
  page,
  context,
}) => {
  const checkProblems = watchForProblems(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  page.on('dialog', (dialog) => void dialog.accept());

  // The Anthropic API is simulated; everything else is the real build.
  let apiRequest: Record<string, unknown> | undefined;
  await page.route('https://api.anthropic.com/**', async (route) => {
    apiRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5-5',
        content: [{ type: 'text', text: JSON.stringify(suggestion) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    });
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Keepsake', level: 1 })).toBeVisible();
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);

  // Settings: two children and an API key.
  await page.getByRole('link', { name: 'Open Settings' }).click();
  for (const [name, size, shoes] of [
    ['Arlo', '4-5y', 'k10'],
    ['Zoe', '2-3y', 'k6'],
  ] as const) {
    await page.getByRole('button', { name: 'Add a child' }).click();
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Clothing size now').selectOption(size);
    await page.getByLabel('Shoe size now').selectOption(shoes);
    await page.getByRole('button', { name: 'Add child' }).click();
    await expect(page.locator('.child-row strong', { hasText: name })).toBeVisible();
  }
  await page.getByLabel('API key').fill(`sk-ant-api03-${'x'.repeat(60)}TEST`);
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText('sk-ant-api03…TEST')).toBeVisible();

  // Add an item from a large photo with EXIF date and GPS.
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  await page.getByTestId('library-input').setInputFiles({
    name: 'coat.jpg',
    mimeType: 'image/jpeg',
    buffer: await makePhoto(page),
  });
  await expect(page.getByAltText('Photo 1')).toBeVisible();
  await page.getByRole('button', { name: 'Fill in details with AI' }).click();
  await expect(page.getByLabel('Name')).toHaveValue('Navy padded coat');
  await expect(page.getByLabel('Size')).toHaveValue('2-3y');
  await expect(page.getByLabel('Child').locator('option:checked')).toHaveText('Zoe');

  // What went to the API: one small JPEG with no metadata.
  const content = (apiRequest?.messages as { content: { type: string; source?: { data: string } }[] }[])[0]?.content;
  const image = Buffer.from(content?.find((b) => b.type === 'image')?.source?.data ?? '', 'base64');
  expect(image.length).toBeGreaterThan(1000);
  expect(image.includes('Exif')).toBe(false);
  expect(image.includes(GPS_MARKER)).toBe(false);

  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible();

  // What was stored: resized, no EXIF or GPS, date taken kept.
  const [photo] = await storedPhotos(page);
  expect(photo?.size).toEqual([2000, 1500]);
  expect(photo?.thumbSize).toEqual([400, 300]);
  expect(photo?.hasExif).toBe(false);
  expect(photo?.text.includes(GPS_MARKER)).toBe(false);
  expect(photo?.takenAt.startsWith('2025-06-14')).toBe(true);

  // Add a second item by hand, for Arlo, already outgrown.
  await page.getByRole('button', { name: 'Add another item' }).click();
  await page.getByRole('button', { name: 'Fill in myself' }).click();
  await page.getByLabel('Name').fill('Dino top');
  await page.getByLabel('Category').selectOption('tops');
  await page.getByLabel('Size').selectOption('3-4y');
  await page.getByLabel('Child').selectOption({ label: 'Arlo' });
  await page.getByLabel('Status').selectOption('outgrown');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible();

  // Browse and search.
  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await expect(page.locator('.result-count')).toHaveText('2 items');
  await page.getByLabel('Search items').fill('navy');
  await expect(page.locator('.item-row strong')).toHaveText(['Navy padded coat']);

  // Item page: add an update and change status.
  await page.getByText('Navy padded coat').click();
  await expect(page.getByRole('heading', { name: 'Navy padded coat' })).toBeVisible();
  await page.getByRole('link', { name: 'Add update' }).click();
  await page.getByLabel('Condition now').selectOption('good');
  await page.getByLabel('Note').fill('Small mark on the sleeve');
  await page.getByRole('button', { name: 'Save update' }).click();
  await expect(page.getByText('Condition: Good')).toBeVisible();
  await page.getByLabel('Status').selectOption('to_sell');
  await expect(page.getByText('Status: To sell')).toBeVisible();

  // Sell: copy a listing field, mark listed, then sold.
  await page.getByRole('link', { name: 'Sell', exact: true }).click();
  await page.getByRole('tab', { name: 'Vinted' }).click();
  const vinted = page.getByRole('region', { name: 'Vinted listing' });
  await expect(vinted.getByText('Navy padded coat, 2-3 years')).toBeVisible();
  await vinted.getByRole('button', { name: 'Copy title' }).click();
  await expect(vinted.getByRole('button', { name: 'Copy title' })).toHaveText('Copied ✓');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Navy padded coat, 2-3 years');
  await page.getByLabel('Asking price (£)').fill('12');
  await page.getByRole('button', { name: 'Mark as listed' }).click();
  await expect(page.getByText(/On Vinted at £12\.00 since/)).toBeVisible();
  await page.getByLabel('For (£)').fill('11');
  await page.getByRole('button', { name: 'Mark as sold' }).click();
  await expect(page.getByText(/Sold on Vinted for £11\.00/)).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Selling' })).toContainText('£11.00 earned so far.');

  // Gaps: Arlo's outgrown top is Zoe's next size; hand it down.
  await page.getByRole('link', { name: 'Gaps', exact: true }).click();
  const handDowns = page.getByRole('region', { name: 'Ready to hand down' });
  await expect(handDowns.getByText('Dino top')).toBeVisible();
  await handDowns.getByRole('button', { name: 'Give to Zoe' }).click();
  await expect(handDowns).toHaveCount(0);

  // Backup: the Home reminder, export with photos, then restore after a deletion.
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  const reminder = page.getByRole('region', { name: 'Time for a backup' });
  await expect(reminder).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const backup = page.getByRole('region', { name: 'Backup' });
  await backup.getByRole('button', { name: 'Prepare backup' }).click();
  await expect(backup.getByText(/Ready: 2 items and 1 photos/)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    backup.getByRole('button', { name: 'Save backup file' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^keepsake-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  const backupPath = test.info().outputPath('backup.zip');
  await download.saveAs(backupPath);
  await expect(backup.getByText(/Last backup: today/)).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(reminder).toHaveCount(0);

  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await page.getByLabel('Search items').fill('dino');
  await page.locator('.item-row', { hasText: 'Dino top' }).click();
  await page.getByRole('button', { name: 'Delete item' }).click();
  await expect(page.getByRole('heading', { name: 'Items' })).toBeVisible();
  await expect(page.locator('.item-row', { hasText: 'Dino top' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByTestId('restore-input').setInputFiles(backupPath);
  await expect(backup.getByText(/✓ Restored 2 items/)).toBeVisible();
  await expect(page.getByText('sk-ant-api03…TEST')).toBeVisible(); // key kept
  const restored = await storedPhotos(page);
  expect(restored.map((p) => p.size)).toEqual([[2000, 1500]]);

  // Works offline once loaded (service worker).
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByLabel('Status').selectOption('');
  await expect(page.locator('.item-row')).toHaveCount(2);
  await context.setOffline(false);

  checkProblems();
});
