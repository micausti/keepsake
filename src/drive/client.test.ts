import { describe, expect, it, vi } from 'vitest';
import { DriveAuthError, DriveClient, DriveError } from './client.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('DriveClient', () => {
  it('sends the token and retries Google hiccups', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(json({ user: { emailAddress: 'me@example.com' } }));
    const client = new DriveClient('tok', fetchFn, 0);
    expect(await client.email()).toBe('me@example.com');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect((fetchFn.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('reports an expired sign-in so the app can sign in again', async () => {
    const client = new DriveClient('tok', vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 })), 0);
    await expect(client.email()).rejects.toBeInstanceOf(DriveAuthError);
  });

  it('says when Drive is full', async () => {
    const full = new Response(JSON.stringify({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } }), { status: 403 });
    const client = new DriveClient('tok', vi.fn<typeof fetch>().mockResolvedValue(full), 0);
    await expect(client.folder()).rejects.toThrow(new DriveError('Your Google Drive is full.'));
  });

  it('finds the app’s folder or creates it', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ files: [] }))
      .mockResolvedValueOnce(json({ id: 'new-folder' }));
    expect(await new DriveClient('tok', fetchFn, 0).folder()).toBe('new-folder');
    expect(fetchFn.mock.calls[1]?.[1]?.method).toBe('POST');
  });

  it('uploads metadata and the photo together, and lists every page', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ id: 'f1' }))
      .mockResolvedValueOnce(json({ files: [{ id: 'a', name: 'a' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(json({ files: [{ id: 'b', name: 'b' }] }));
    const client = new DriveClient('tok', fetchFn, 0);
    expect(await client.upload('photo-1.jpg', new Blob(['jpeg'], { type: 'image/jpeg' }), 'folder', { sig: 's' })).toBe('f1');
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toContain('uploadType=multipart');
    const body = await (init?.body as Blob).text();
    expect(body).toContain('"name":"photo-1.jpg"');
    expect(body).toContain('"parents":["folder"]');
    expect(body).toContain('jpeg');
    expect((await client.list('folder')).map((f) => f.id)).toEqual(['a', 'b']);
  });
});
