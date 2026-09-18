# Your Safe Space

Website for Your Safe Space — psychological counselling practice (Silvia).

A single self-contained page (`index.html`) built with a small React-based template runtime (`support.js`). No build step: everything renders client-side, with fonts and React/ReactDOM loaded from CDN.

- Trilingual: German / English / French, switchable in the nav (persisted via URL hash + localStorage, auto-detected from the browser on first visit).
- Responsive: one file, breakpoints at 900px and 480px.

## Preview locally

Serve the folder with any static file server, e.g.:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy

Hosted on Azure Static Web Apps, auto-deployed via the GitHub Actions workflow in `.github/workflows/` on every push to `main`.
