import { describe, expect, it } from 'vitest';
import { ALLOWED_API_ORIGIN, buildCsp, cspDirectives } from './csp.ts';

describe('Content Security Policy', () => {
  const csp = buildCsp();

  it('denies everything by default', () => {
    expect(csp).toMatch(/^default-src 'none'/);
  });

  it('only allows network calls to self and the Anthropic API', () => {
    expect(cspDirectives['connect-src']).toEqual(["'self'", ALLOWED_API_ORIGIN]);
    expect(ALLOWED_API_ORIGIN).toBe('https://api.anthropic.com');
  });

  it('never allows inline or eval scripts', () => {
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(cspDirectives['script-src']).toEqual(["'self'"]);
  });

  it('does not allow any other remote origins', () => {
    const remote = csp.match(/https?:\/\/[^\s;]+/g) ?? [];
    expect(remote).toEqual([ALLOWED_API_ORIGIN]);
  });
});
