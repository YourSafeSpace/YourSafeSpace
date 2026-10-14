# Your Safe Space

Website for Your Safe Space — psychological counselling practice (Silvia).

A single self-contained page (`index.html`) built with a small React-based template runtime (`support.js`). It renders client-side, with fonts and React/ReactDOM loaded from CDN. At deploy time, `tools/prerender` also saves every page and language as static HTML so search engines and AI assistants get the content without running JavaScript.

- Trilingual: German / English / French, switchable in the nav (each page has its own URL, e.g. `/de/angebote`, `/fr/kontakt`; old `#/de/...` links are redirected. Language is auto-detected from the browser when visiting `/`).
- Responsive: one file, breakpoints at 900px and 480px.

## Preview locally

Serve the folder with any static file server, e.g.:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy

Hosted on Azure Static Web Apps, auto-deployed via the GitHub Actions workflow in `.github/workflows/` on every push to `main`.

The workflow first runs `tools/prerender`, which copies the site into `dist/` and adds `dist/<lang>/<page>.html` for every page (head tags, JSON-LD and rendered body as the app produces them), plus the matching routes in `dist/staticwebapp.config.json`. `dist/` is what gets deployed. To build it locally:

```
cd tools/prerender
npm install
npx playwright install chromium
npm run build
```

New top-level files that should be public must be added to `PUBLIC` in `tools/prerender/prerender.mjs` and to the `navigationFallback` exclude list.
