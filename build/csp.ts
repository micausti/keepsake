/**
 * Content Security Policy for the production build.
 *
 * GitHub Pages cannot set response headers, so the policy is delivered as a
 * <meta http-equiv="Content-Security-Policy"> tag injected at build time.
 * (Dev mode is left alone because Vite's HMR client needs inline scripts.)
 *
 * The only third-party origin the app may talk to is the Anthropic API.
 */
export const ALLOWED_API_ORIGIN = 'https://api.anthropic.com';

export const cspDirectives: Readonly<Record<string, readonly string[]>> = {
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  // blob: and data: are for locally generated photo previews (Phase 2+).
  'img-src': ["'self'", 'blob:', 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'", ALLOWED_API_ORIGIN],
  'manifest-src': ["'self'"],
  'worker-src': ["'self'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
  'object-src': ["'none'"],
};

export function buildCsp(directives = cspDirectives): string {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
