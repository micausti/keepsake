/**
 * Google sign-in for Drive, by redirect (OAuth 2.0 for client-side web
 * apps). The app goes to Google's sign-in page and Google sends it back with
 * a short-lived access token in the address. Pop-ups aren't used because
 * they don't work reliably in Home Screen apps on iPhone.
 *
 * Only the `drive.file` scope is asked for: the app can see and change files
 * it created itself, and nothing else in the person's Drive.
 *
 * The token lasts about an hour and is kept in sessionStorage (this window
 * only), never in the database or in backups.
 */

export const GOOGLE_CLIENT_ID = '334483051094-u1qauk6tnaj6spm29fkm2o5ivk821a35.apps.googleusercontent.com';
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const PENDING_KEY = 'keepsake.googleSignIn';
const TOKEN_KEY = 'keepsake.googleToken';
const RESULT_KEY = 'keepsake.googleSignInResult';

export type DriveAction = 'backup' | 'restore' | 'connect';

interface Pending {
  state: string;
  returnTo: string;
  action: DriveAction;
}

interface StoredToken {
  token: string;
  expiresAt: number;
}

export type SignInResult = { ok: true; action: DriveAction } | { ok: false; message: string };

/** Where Google sends people back to: the app's own start page. */
export const redirectUri = () => new URL(import.meta.env.BASE_URL, window.location.origin).href;

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Leaves the app for Google's sign-in page; comes back with `action` to carry on with. */
export function startSignIn(
  action: DriveAction,
  loginHint?: string,
  go: (url: string) => void = (url) => window.location.assign(url),
): void {
  const pending: Pending = { state: randomState(), returnTo: window.location.hash || '#/settings', action };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: DRIVE_SCOPE,
    state: pending.state,
    include_granted_scopes: 'true',
  });
  if (loginHint) params.set('login_hint', loginHint);
  go(`${GOOGLE_AUTH_URL}?${params}`);
}

/**
 * Call once at start-up, before the app reads the address. If Google has just
 * sent us back, takes the token out of the address (so it isn't left in
 * history) and puts back the page the person was on.
 */
export function completeSignIn(now = Date.now()): void {
  const hash = window.location.hash;
  if (!/^#(access_token|error|state)=/.test(hash)) return;
  const params = new URLSearchParams(hash.slice(1));
  const pending = readJson<Pending>(sessionStorage.getItem(PENDING_KEY));
  sessionStorage.removeItem(PENDING_KEY);
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${pending?.returnTo ?? '#/settings'}`);

  let result: SignInResult;
  if (!pending || params.get('state') !== pending.state) {
    result = { ok: false, message: 'Google sign-in didn’t match this app. Please try again.' };
  } else if (params.get('error')) {
    result = {
      ok: false,
      message: params.get('error') === 'access_denied' ? 'Google Drive wasn’t connected.' : 'Google sign-in didn’t work. Please try again.',
    };
  } else if (!(params.get('scope') ?? '').split(' ').includes(DRIVE_SCOPE)) {
    result = {
      ok: false,
      message: 'Keepsake needs the Google Drive permission to back up. Try again and leave its box ticked.',
    };
  } else {
    const token = params.get('access_token') ?? '';
    const seconds = Number(params.get('expires_in') ?? '3600');
    const stored: StoredToken = { token, expiresAt: now + seconds * 1000 };
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
    result = { ok: true, action: pending.action };
  }
  sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
}

/** The result of a sign-in that has just finished, without using it up. */
export function peekSignInResult(): SignInResult | null {
  return readJson<SignInResult>(sessionStorage.getItem(RESULT_KEY));
}

/** The result of a sign-in that has just finished, once only. */
export function takeSignInResult(): SignInResult | null {
  const result = readJson<SignInResult>(sessionStorage.getItem(RESULT_KEY));
  sessionStorage.removeItem(RESULT_KEY);
  return result;
}

/** A token that's still good for at least another minute, or null. */
export function currentToken(now = Date.now()): string | null {
  const stored = readJson<StoredToken>(sessionStorage.getItem(TOKEN_KEY));
  return stored && stored.token && stored.expiresAt - 60_000 > now ? stored.token : null;
}

export function forgetToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

function readJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
