# Swagger / OpenAPI documentation

Interactive API docs are generated automatically from Express route files.

## URLs

| URL | Description |
|-----|-------------|
| `/api-docs` | Swagger UI (browser) |
| `/api-docs/openapi.json` | Raw OpenAPI 3.0 JSON |

**Local examples:**

| How you run | Swagger URL |
|-------------|-------------|
| `node app.js` / `npm start` | `http://localhost:5678/api-docs` (uses `APP_PORT` in `.env`) |
| `docker compose up` | `http://localhost:5678/api-docs` if `HOST_PORT=5678` (default in `docker-compose.yml`) |

If Docker maps a different host port (e.g. `HOST_PORT=3010`), use `http://localhost:3010/api-docs` instead.

## Auth in Swagger UI

Click **Authorize** and set the header for the API you are testing:

| Header | Used for |
|--------|----------|
| `userauth` | Customer app (`/user/...`) |
| `partnertoken` | Partner app (`/partner/...`) |
| `adminauth` | Admin panel (`/admin/...`) |

## How it stays up to date

On server start, `src/core/swagger/parseRoutes.js` reads:

- `src/User/routes/userauthroutes.js`
- `src/User/routes/userapproutes.js`
- `src/Partner/routes/partnerauthroutes.js`
- `src/Partner/routes/partnerapproutes.js`
- `src/Admin/routes/authroutes.js`
- `src/Admin/routes/approutes.js`

Plus static routes: `/status`, `/`, `/api/upload`.

Auth requirements are inferred from middleware on each route line (`UserAuthenticate`, `verifyadmin`, `partnerauthenticate`, etc.).

Request bodies use **named schemas** with real fields (e.g. `phone`, `otp`, `store_id`, `lat`/`lng`) — not generic `additionalProp1` placeholders. Definitions live in `src/core/swagger/schemas.js`; route mapping in `src/core/swagger/resolveRequestBody.js`.

## Environment

Optional: set `SWAGGER_SERVER_URL` (e.g. `https://api.gloup.in`) so the default server in the spec matches production.

## Dependencies

No extra npm packages — Swagger UI is loaded from CDN. OpenAPI spec is built in-process from route files.
