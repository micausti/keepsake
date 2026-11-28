/**
 * The few Google Drive API calls Keepsake needs. Everything goes to
 * www.googleapis.com, the one Google host the app's security policy allows.
 */

export const DRIVE_API = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_TYPE = 'application/vnd.google-apps.folder';
export const FOLDER_NAME = 'Keepsake';

/** The sign-in has expired or been revoked: sign in again. */
export class DriveAuthError extends Error {}
export class DriveError extends Error {}

export interface DriveFile {
  id: string;
  name: string;
  appProperties?: Record<string, string>;
}

type Fetch = typeof fetch;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class DriveClient {
  constructor(
    private readonly token: string,
    private readonly fetchFn: Fetch = (...args) => fetch(...args),
    private readonly retryDelayMs = 1000,
  ) {}

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          ...init,
          headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${this.token}` },
        });
      } catch {
        if (attempt < 3) {
          await wait(this.retryDelayMs * 2 ** attempt);
          continue;
        }
        throw new DriveError('Couldn’t reach Google Drive. Check your connection and try again.');
      }
      if (response.ok) return response;
      if (response.status === 401) throw new DriveAuthError('Google sign-in has expired.');
      const text = await response.text().catch(() => '');
      // Rate limits and Google's own hiccups: wait and try again.
      const retry = response.status === 429 || response.status >= 500 || /rateLimitExceeded/.test(text);
      if (retry && attempt < 3) {
        await wait(this.retryDelayMs * 2 ** attempt);
        continue;
      }
      if (/storageQuotaExceeded/.test(text)) throw new DriveError('Your Google Drive is full.');
      throw new DriveError(`Google Drive said no (${response.status}). Please try again.`);
    }
  }

  async email(): Promise<string> {
    const response = await this.request(`${DRIVE_API}/about?fields=user(emailAddress)`);
    const json = (await response.json()) as { user?: { emailAddress?: string } };
    return json.user?.emailAddress ?? '';
  }

  /** The app's folder, created if there isn't one. Drive only shows the app folders it made itself. */
  async folder(): Promise<string> {
    const q = `name = '${FOLDER_NAME}' and mimeType = '${FOLDER_TYPE}' and 'root' in parents and trashed = false`;
    const found = await this.request(`${DRIVE_API}/files?${new URLSearchParams({ q, fields: 'files(id)', spaces: 'drive' })}`);
    const { files } = (await found.json()) as { files: { id: string }[] };
    if (files[0]) return files[0].id;
    const created = await this.request(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_TYPE }),
    });
    return ((await created.json()) as { id: string }).id;
  }

  /** Every file in a folder (not trashed). */
  async list(folderId: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, appProperties)',
        pageSize: '1000',
        spaces: 'drive',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await this.request(`${DRIVE_API}/files?${params}`);
      const page = (await response.json()) as { files: DriveFile[]; nextPageToken?: string };
      files.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }

  /** Creates a file, or replaces the content of `existingId`. */
  async upload(
    name: string,
    data: Blob,
    folderId: string,
    appProperties: Record<string, string>,
    existingId?: string,
  ): Promise<string> {
    const boundary = `keepsake-${crypto.randomUUID()}`;
    const metadata = existingId ? { appProperties } : { name, parents: [folderId], appProperties };
    // The photo stays a Blob reference, so it isn't copied into memory here.
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: ${data.type || 'application/octet-stream'}\r\n\r\n`,
      data,
      `\r\n--${boundary}--`,
    ]);
    const url = existingId
      ? `${DRIVE_UPLOAD}/files/${existingId}?uploadType=multipart&fields=id`
      : `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`;
    const response = await this.request(url, {
      method: existingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return ((await response.json()) as { id: string }).id;
  }

  async download(fileId: string, type = 'application/octet-stream'): Promise<Blob> {
    const response = await this.request(`${DRIVE_API}/files/${fileId}?alt=media`);
    const blob = await response.blob();
    return blob.type === type ? blob : new Blob([blob], { type });
  }

  async remove(fileId: string): Promise<void> {
    await this.request(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE' });
  }
}
