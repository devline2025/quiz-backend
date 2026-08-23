# Quiz backend

Express API used by the Sunshine Nutrition static site.

## Security model

`POST /answers` is intentionally a public browser endpoint. It does not use a frontend API key because secrets cannot be hidden in GitHub Pages. The endpoint instead enforces an origin allowlist, a 16 KB request limit, per-IP rate limiting, and strict quiz payload validation.

`GET /answers` and `POST /getVoucher` require the `x-admin-key` header. Store its value as `ADMIN_API_KEY` in Render only; never add it to frontend JavaScript or GitHub Pages configuration.

## Environment

Copy `.env.example` to `.env` for local development and configure the equivalent values in Render:

```env
PORT=3000
ALLOWED_ORIGINS=http://localhost:5501,http://127.0.0.1:5501,https://devline2025.github.io
ADMIN_API_KEY=<long-random-secret>
DATABASE_URL=<postgresql-connection-string>
SHEET_ID=<google-sheet-id>
```

Generate the administration secret with a cryptographically secure generator, for example `openssl rand -hex 32`, and enter the result directly in Render. Do not commit the generated value.

## Commands

```bash
npm ci
npm run check
npm start
```
