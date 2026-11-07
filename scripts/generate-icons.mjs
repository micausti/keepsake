// Regenerates the PNG app icons from public/favicon.svg.
// Usage: NODE_PATH=$(npm root -g) node scripts/generate-icons.mjs (needs Playwright)
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

// CommonJS require so a globally installed Playwright (NODE_PATH) also works.
const { chromium } = createRequire(import.meta.url)('playwright');

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const bg = '#2f5d50';

// [file, size, inner scale]. Maskable/apple icons are full-bleed squares with
// the artwork inside the safe zone; iOS applies its own rounded mask.
const targets = [
  ['pwa-192x192.png', 192, 1],
  ['pwa-512x512.png', 512, 1],
  ['maskable-512x512.png', 512, 0.75, true],
  ['apple-touch-icon.png', 180, 0.85, true],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, scale, fullBleed] of targets) {
  const inner = Math.round(size * scale);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;
    display:grid;place-items:center;background:${fullBleed ? bg : 'transparent'}">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
    </body></html>`);
  await page.screenshot({
    path: new URL(`../public/${file}`, import.meta.url).pathname,
    omitBackground: !fullBleed,
  });
  console.log('wrote', file);
}
await browser.close();
