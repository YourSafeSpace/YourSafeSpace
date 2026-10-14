// Builds dist/: the site as deployed, plus one static HTML file per language
// and page (dist/fr/angebote.html etc.).
//
// The site renders in the browser, so a crawler that doesn't run JavaScript
// (most AI assistants, and Google's first pass) would otherwise get the raw
// template with {{ placeholders }} and German head tags on every URL. Here
// every route is opened in headless Chromium and the finished page is saved:
//
//   - <html lang>, title, description, canonical, hreflang, og:* and JSON-LD
//     as applySeo() set them for that page;
//   - the rendered body inside <div id="ssr">, which the app removes once it
//     has mounted (componentDidMount in index.html);
//   - the runtime's template moved into a <script> block, so text extractors
//     skip it, and put back as <x-dc> by a small inline script before
//     support.js boots;
//   - the styles the runtime injects at load, so the static copy is styled
//     on first paint.
//
// Usage: npm install && npx playwright install chromium && npm run build

import { createServer } from 'node:http';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const SITE = 'https://www.yoursafespace.ch';
const LANGS = ['de', 'fr', 'en'];
// Files and folders that make up the public site. Keep in sync with
// staticwebapp.config.json's navigationFallback exclude list.
const PUBLIC = ['index.html', 'support.js', 'robots.txt', 'sitemap.xml', 'llms.txt', 'staticwebapp.config.json', 'assets'];

const source = await readFile(join(ROOT, 'index.html'), 'utf8');
const PAGES = JSON.parse(source.match(/const PAGES = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
const pagePath = (lang, page) => '/' + lang + '/' + (page === 'home' ? '' : page);

// --- local server: serves the repo like Azure does (SPA fallback to index.html)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  let file = join(ROOT, path);
  if (!file.startsWith(ROOT) || !(await stat(file).then(s => s.isFile(), () => false))) file = join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;

// --- render every route
const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'de-CH', viewport: { width: 1280, height: 900 } });
const sourceHead = source.slice(0, source.indexOf('</head>'));

async function render(lang, page) {
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', e => errors.push(e.message));
  await tab.goto(origin + pagePath(lang, page), { waitUntil: 'networkidle' });
  const canonical = SITE + pagePath(lang, page);
  await tab.waitForFunction(([l, c]) =>
    document.documentElement.lang === l &&
    document.querySelector('link[rel="canonical"]')?.href === c &&
    document.querySelector('#dc-root')?.children.length > 0, [lang, canonical]);
  await tab.waitForTimeout(500); // alignPortrait() runs on a 300 ms timer
  if (errors.length) throw new Error(`${lang}/${page}: ${errors.join('; ')}`);

  const out = await tab.evaluate(() => {
    const head = document.head;
    const seo = [...head.querySelectorAll('title, meta[name="description"], link[rel="canonical"], link[rel="alternate"], meta[property^="og:"], script#ld-json')];
    const styles = [...head.children].filter(e => e.tagName === 'STYLE' || (e.tagName === 'LINK' && !/canonical|alternate/.test(e.rel)));
    return {
      seo: seo.map(e => e.outerHTML).join('\n'),
      styles: styles.map(e => e.outerHTML),
      body: document.querySelector('#dc-root').innerHTML,
    };
  });
  await tab.close();
  return out;
}

function assemble(lang, { seo, styles, body }) {
  const open = source.indexOf('<x-dc>'), close = source.lastIndexOf('</x-dc>') + '</x-dc>'.length;
  const template = source.slice(open, close).replace(/<!--[\s\S]*?-->/g, '');
  if (/<\/?script/i.test(template)) throw new Error('template contains <script>, cannot be embedded in one');
  const snapshot = body.replace(/ data-dc-tpl="[^"]*"/g, '');
  if (snapshot.includes('{{')) throw new Error(`${lang}: unrendered {{ }} left in the page`);
  const extraStyles = styles.filter(s => !sourceHead.includes(s)).join('\n');

  let html = source
    .replace('<html>', `<html lang="${lang}">`)
    .replace(/<!-- seo:start[\s\S]*?<!-- seo:end -->/, () => seo)
    .replace('</head>', () => extraStyles + '\n</head>');
  html = html.slice(0, html.indexOf('<x-dc>')) +
    `<div id="ssr">${snapshot}</div>\n` +
    `<script type="text/x-dc-template" id="dc-template">${template}</script>\n` +
    `<script>(function(){var t=document.getElementById('dc-template'),d=document.createElement('div');d.innerHTML=t.textContent;t.replaceWith(d.firstElementChild);})();</script>` +
    html.slice(html.lastIndexOf('</x-dc>') + '</x-dc>'.length);
  return html;
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST);
for (const f of PUBLIC) {
  if (await stat(join(ROOT, f)).then(() => true, () => false)) await cp(join(ROOT, f), join(DIST, f), { recursive: true });
}

const routes = [];
try {
  for (const lang of LANGS) {
    await mkdir(join(DIST, lang), { recursive: true });
    for (const page of PAGES) {
      const html = assemble(lang, await render(lang, page));
      const file = page === 'home' ? `${lang}/index.html` : `${lang}/${page}.html`;
      await writeFile(join(DIST, file), html);
      if (page === 'home') {
        routes.push({ route: `/${lang}`, rewrite: `/${lang}/index.html` });
        // `/` gets the German home page (canonical /de/); the app then
        // switches to the visitor's language as before.
        if (lang === 'de') await writeFile(join(DIST, 'index.html'), html);
      } else {
        routes.push({ route: `/${lang}/${page}`, rewrite: `/${file}` });
      }
      console.log(`${pagePath(lang, page).padEnd(18)} -> dist/${file} (${Math.round(html.length / 1024)} KB)`);
    }
  }
} finally {
  await browser.close();
  server.close();
}

// Map the clean URLs to the generated files explicitly rather than relying
// on Azure's directory/extension handling.
const config = JSON.parse(await readFile(join(ROOT, 'staticwebapp.config.json'), 'utf8'));
config.routes = [...routes, ...(config.routes || [])];
await writeFile(join(DIST, 'staticwebapp.config.json'), JSON.stringify(config, null, 2) + '\n');
console.log(`dist/ ready: ${routes.length} routes`);
