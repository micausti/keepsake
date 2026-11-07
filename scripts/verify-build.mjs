// Sanity checks on the production build, run in CI after `npm run build`.
import { readFile, access } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const html = await readFile(new URL('index.html', dist), 'utf8');
const failures = [];
const decode = (s) => s.replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');

const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
if (!csp) failures.push('index.html has no Content-Security-Policy meta tag');
else if (html.indexOf(csp[0]) > html.indexOf('<script')) failures.push('CSP meta tag must come before any script');
else if (!decode(csp[1]).includes("connect-src 'self' https://api.anthropic.com;"))
  failures.push(`unexpected connect-src in CSP: ${csp[1]}`);

for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (!/\bsrc=/.test(m[1] ?? '') || (m[2] ?? '').trim()) failures.push(`inline script found: ${m[0].slice(0, 80)}`);
}
if (/\son[a-z]+=/i.test(html)) failures.push('inline event handler attribute found');

for (const file of ['sw.js', 'manifest.webmanifest', 'apple-touch-icon.png', 'pwa-512x512.png']) {
  try {
    await access(new URL(file, dist));
  } catch {
    failures.push(`missing ${file}`);
  }
}

if (failures.length) {
  console.error('Build verification failed:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('Build verification passed.');
