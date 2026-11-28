import { beforeEach, describe, expect, it } from 'vitest';
import { DRIVE_SCOPE, GOOGLE_AUTH_URL, completeSignIn, currentToken, startSignIn, takeSignInResult } from './auth.ts';

let assigned = '';

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/keepsake/#/settings');
  assigned = '';
});

const start = () => startSignIn('backup', undefined, (url) => (assigned = url));

/** Pretends Google sent us back with these parameters. */
function returnFromGoogle(params: Record<string, string>) {
  window.history.replaceState(null, '', `/keepsake/#${new URLSearchParams(params)}`);
  completeSignIn(1_000_000);
}

const stateSent = () => new URL(assigned).searchParams.get('state') ?? '';

describe('Google sign-in', () => {
  it('asks only for access to files the app creates', () => {
    start();
    const url = new URL(assigned);
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTH_URL);
    expect(url.searchParams.get('scope')).toBe(DRIVE_SCOPE);
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.get('redirect_uri')).toBe(new URL(import.meta.env.BASE_URL, window.location.origin).href);
    expect(stateSent()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('keeps the token, removes it from the address and goes back to the page', () => {
    start();
    returnFromGoogle({ access_token: 'tok', expires_in: '3599', scope: DRIVE_SCOPE, state: stateSent() });
    expect(window.location.hash).toBe('#/settings');
    expect(window.location.href).not.toContain('tok');
    expect(currentToken(1_000_000)).toBe('tok');
    expect(currentToken(1_000_000 + 3599_000)).toBeNull(); // expired
    expect(takeSignInResult()).toEqual({ ok: true, action: 'backup' });
    expect(takeSignInResult()).toBeNull(); // only once
  });

  it('rejects a reply that doesn’t match the sign-in we started', () => {
    start();
    returnFromGoogle({ access_token: 'evil', expires_in: '3599', scope: DRIVE_SCOPE, state: 'not-ours' });
    expect(currentToken(1_000_000)).toBeNull();
    expect(takeSignInResult()).toMatchObject({ ok: false });
  });

  it('explains when the Drive permission was unticked or sign-in was cancelled', () => {
    start();
    returnFromGoogle({ access_token: 'tok', expires_in: '3599', scope: 'email', state: stateSent() });
    expect(currentToken(1_000_000)).toBeNull();
    expect(takeSignInResult()).toMatchObject({ ok: false, message: expect.stringMatching(/leave its box ticked/) });

    start();
    returnFromGoogle({ error: 'access_denied', state: stateSent() });
    expect(takeSignInResult()).toMatchObject({ ok: false, message: 'Google Drive wasn’t connected.' });
  });

  it('leaves normal addresses alone', () => {
    window.history.replaceState(null, '', '/keepsake/#/items');
    completeSignIn();
    expect(window.location.hash).toBe('#/items');
    expect(takeSignInResult()).toBeNull();
  });
});
