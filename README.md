# Your Safe Space

Website for Your Safe Space — psychological counselling practice (Silvia).

A single self-contained page (`index.html`) built with a small React-based template runtime (`support.js`). No build step: everything renders client-side, with fonts and React/ReactDOM loaded from CDN.

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

## Contact form (e-mail)

"Per E-Mail senden" posts the form to `/api/contact`, an Azure Function in `api/` that the Static Web App deploys alongside the site. It sends the enquiry through Azure Communication Services to `silvia@yoursafespace.ch` (fixed in `api/src/contact.js`, never taken from the request), with the visitor as reply-to.

Spam protection: a hidden honeypot field, a minimum fill time, Cloudflare Turnstile (loaded only on the contact page), and length/format checks. Submissions that look like bots get a fake "sent" response.

App settings (Azure portal → Static Web App → Environment variables):

| Name | Value |
|---|---|
| `ACS_CONNECTION_STRING` | Communication Services resource → Keys → connection string |
| `MAIL_FROM` | verified sender address, e.g. `kontakt@yoursafespace.ch` |
| `TURNSTILE_SECRET` | Cloudflare Turnstile widget secret key |

The Turnstile *site* key is public and set as `TURNSTILE_SITE_KEY` in `index.html`.

Tests: `cd api && npm install && npm test`.
