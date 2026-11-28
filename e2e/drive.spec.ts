import { expect, test, type Page, type Route } from '@playwright/test';
import { makePhoto, storedPhotos, watchForProblems } from './helpers.ts';

/** A pretend Google: its sign-in page and an in-memory Drive. */
class FakeGoogle {
  files = new Map<string, { id: string; name: string; parents: string[]; appProperties: Record<string, string>; data: Buffer; folder?: boolean }>();
  signIns = 0;
  expireNext = false;
  private next = 1;

  async install(page: Page) {
    await page.route('https://accounts.google.com/**', (route) => this.signIn(route));
    await page.route('https://www.googleapis.com/**', (route) => this.drive(route));
  }

  /** Sign-in: straight back to the app with a token, as if the person tapped Allow. */
  private async signIn(route: Route) {
    this.signIns += 1;
    const url = new URL(route.request().url());
    const back = new URLSearchParams({
      access_token: `token-${this.signIns}`,
      token_type: 'Bearer',
      expires_in: '3599',
      scope: url.searchParams.get('scope') ?? '',
      state: url.searchParams.get('state') ?? '',
    });
    await route.fulfill({ status: 302, headers: { location: `${url.searchParams.get('redirect_uri')}#${back}` } });
  }

  private async drive(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (status: number, body: unknown = {}, raw?: Buffer) =>
      route.fulfill({
        status,
        headers: { 'access-control-allow-origin': '*', 'content-type': raw ? 'application/octet-stream' : 'application/json' },
        body: raw ?? JSON.stringify(body),
      });
    if (!request.headers().authorization?.startsWith('Bearer token-')) return reply(401);
    if (this.expireNext) {
      this.expireNext = false;
      return reply(401);
    }
    const path = url.pathname;
    const method = request.method();
    if (path === '/drive/v3/about') return reply(200, { user: { emailAddress: 'me@example.com' } });
    if (path === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const parent = /'([^']+)' in parents/.exec(q)?.[1];
      const list = [...this.files.values()].filter((f) =>
        q.includes("name = 'Keepsake'") ? f.folder : f.parents.includes(parent ?? ''),
      );
      return reply(200, { files: list.map(({ id, name, appProperties }) => ({ id, name, appProperties })) });
    }
    if (path === '/drive/v3/files' && method === 'POST') {
      const meta = request.postDataJSON();
      const id = `folder-${this.next++}`;
      this.files.set(id, { id, name: meta.name, parents: [], appProperties: {}, data: Buffer.alloc(0), folder: true });
      return reply(200, { id });
    }
    const fileId = /\/files\/([^/]+)$/.exec(path)?.[1];
    if (path.startsWith('/upload/drive/v3/files')) {
      const { meta, data } = parseMultipart(request.headers()['content-type'] ?? '', request.postDataBuffer() ?? Buffer.alloc(0));
      const existing = fileId ? this.files.get(fileId) : undefined;
      const id = existing?.id ?? `file-${this.next++}`;
      this.files.set(id, {
        id,
        name: existing?.name ?? meta.name,
        parents: existing?.parents ?? meta.parents,
        appProperties: meta.appProperties,
        data,
      });
      return reply(200, { id });
    }
    if (fileId && method === 'GET') return reply(200, undefined, this.files.get(fileId)?.data);
    if (fileId && method === 'DELETE') {
      this.files.delete(fileId);
      return reply(204);
    }
    return reply(404);
  }

  named(prefix: string) {
    return [...this.files.values()].filter((f) => f.name.startsWith(prefix));
  }
}

function parseMultipart(contentType: string, body: Buffer) {
  const boundary = `--${/boundary=(.+)$/.exec(contentType)?.[1]}`;
  const parts: Buffer[] = [];
  let start = body.indexOf(boundary);
  while (start !== -1) {
    const end = body.indexOf(boundary, start + boundary.length);
    if (end === -1) break;
    parts.push(body.subarray(start + boundary.length + 2, end - 2));
    start = end;
  }
  const content = (part: Buffer) => part.subarray(part.indexOf('\r\n\r\n') + 4);
  return { meta: JSON.parse(content(parts[0] ?? Buffer.alloc(0)).toString()), data: content(parts[1] ?? Buffer.alloc(0)) };
}

test('back up to Google Drive, sign in again when it expires, and restore', async ({ page }) => {
  // The browser logs the 401 this test causes on purpose (an expired sign-in).
  const checkProblems = watchForProblems(page, /status of 401/);
  page.on('dialog', (dialog) => void dialog.accept());
  const google = new FakeGoogle();
  await google.install(page);

  await page.goto('./#/settings');
  await page.getByLabel('API key').fill(`sk-ant-api03-${'x'.repeat(60)}TEST`);
  await page.getByRole('button', { name: 'Save key' }).click();

  // One item with a photo.
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  await page.getByTestId('library-input').setInputFiles({ name: 'coat.jpg', mimeType: 'image/jpeg', buffer: await makePhoto(page) });
  await page.getByRole('button', { name: 'Fill in myself' }).click();
  await page.getByLabel('Name').fill('Navy coat');
  await page.getByLabel('Category').selectOption('outerwear');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible();
  const [original] = await storedPhotos(page);

  // Connect: off to "Google" and straight back.
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const drive = page.getByRole('region', { name: 'Google Drive backup' });
  await drive.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(drive.getByText('Connected to me@example.com')).toBeVisible();
  expect(page.url()).not.toContain('access_token');
  expect(page.url()).toMatch(/#\/settings$/);

  await drive.getByRole('button', { name: 'Back up now' }).click();
  await expect(drive.getByText('✓ Backed up 1 item and 1 photo to Google Drive.')).toBeVisible();
  expect(google.named('photo-')).toHaveLength(1);
  expect(google.named('thumb-')).toHaveLength(1);
  const data = google.named('keepsake-data.json')[0]?.data.toString() ?? '';
  expect(data).toContain('Navy coat');
  expect(data).not.toContain('sk-ant-api03');

  // The sign-in has expired: it signs in again and finishes the backup by itself.
  google.expireNext = true;
  const signInsBefore = google.signIns;
  await drive.getByRole('button', { name: 'Back up now' }).click();
  await expect(drive.getByText('✓ Backed up 1 item and 1 photo to Google Drive.')).toBeVisible();
  expect(google.signIns).toBe(signInsBefore + 1);
  expect(google.named('photo-')).toHaveLength(1); // nothing uploaded twice

  // Lose the item, then restore it from Drive.
  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await page.getByRole('link', { name: 'Navy coat' }).click();
  await page.getByRole('button', { name: 'Delete item' }).click();
  await expect(page.getByRole('link', { name: 'Navy coat' })).toHaveCount(0);
  expect(await storedPhotos(page)).toHaveLength(0);

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await drive.getByRole('button', { name: 'Restore from Google Drive' }).click();
  await expect(drive.getByText('✓ Restored 1 item from Google Drive.')).toBeVisible();
  const [restored] = await storedPhotos(page);
  expect(restored?.size).toEqual(original?.size);
  expect(restored?.text).toBe(original?.text);
  await expect(page.getByText('sk-ant-api03…TEST')).toBeVisible(); // key kept
  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Navy coat' })).toBeVisible();
  checkProblems();
});
