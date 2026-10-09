# Listing Studio AI — Step 3

Responsive frontend plus Node.js/Express backend. Includes Gemini-powered single listing generation, bulk CSV import (up to 20 products per request), PDF/CSV exports, browser-local saved drafts, basic security headers, and generation rate limiting.

## Security first
Revoke any Gemini key previously pasted into a chat, screenshot, or repository. Create a fresh key in Google AI Studio. Keep it only in a private `.env` file locally or your hosting provider's environment settings. Never add it to frontend JavaScript.

## Run locally (Node.js 20+)
1. Extract the ZIP and open a terminal in this folder.
2. Run `npm install`.
3. Copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`; macOS/Linux: `cp .env.example .env`).
4. Add your fresh key as `GEMINI_API_KEY` inside `.env`.
5. Run `npm start`.
6. Open `http://localhost:3000` (don't open `index.html` directly).
7. Optional syntax check: `npm run check`.

## Deploy with Render
1. Create a **private** GitHub repository and upload the project files. Do not upload `.env` or `node_modules`; `.gitignore` excludes them.
2. Sign in to Render and choose **New → Web Service**, then connect the repository.
3. Use build command `npm install` and start command `npm start`. The included `render.yaml` is a starting configuration.
4. In Render → service → Environment, add:
   - `GEMINI_API_KEY` = your fresh Gemini API key
   - `GEMINI_MODEL` = `gemini-2.5-flash`
   - `RATE_LIMIT_PER_MINUTE` = `10`
5. Deploy and open the provided HTTPS URL.
6. Visit `/api/health`; it should return JSON with `ok: true`.
7. Test one product generation, sample CSV bulk generation, and PDF/CSV exports.

Hosting free plans and behavior can change; a free instance may sleep when idle. Check current Render terms and Gemini pricing/limits before launch.

## Endpoints
- `GET /api/health`
- `POST /api/generate-listing`
- `POST /api/generate-bulk` (up to 20 products/request)

## Included security (starter-level)
Helmet security headers, rate limits on generation routes (default 10 requests/minute per server process), JSON request size limit, input bounds, and server-only API key usage.

## Before selling publicly
This is a deployable starter, not a finished enterprise SaaS or security-audited product. Add user accounts, per-user quotas, billing, persistent database storage, monitoring, privacy/terms pages, support details, accessibility tests, automated tests, and a clear buyer license. Saved drafts currently use browser localStorage. PDF export loads jsPDF from a CDN and needs internet access. AI output must be reviewed for accuracy and marketplace policies.
