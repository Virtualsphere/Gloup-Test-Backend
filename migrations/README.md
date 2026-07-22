# Database migrations

Versioned, idempotent schema changes applied automatically on app startup
(and via CLI / deploy). Uses [Umzug](https://github.com/sequelize/umzug) with
a `SequelizeMeta` table — the same approach Sequelize CLI uses.

## How it works

1. Add a new file under `migrations/` named `YYYYMMDDHHMMSS-short-description.js`
2. Export `up({ context })` and preferably `down({ context })`
3. Deploy — pending migrations run once before the API starts listening
4. Already-applied migrations are recorded in `SequelizeMeta` and skipped

`connection.sync({ force: false })` still creates **brand-new tables** from
models. It does **not** alter existing columns. Any change to an existing table
(add column, change ENUM, index, etc.) **must** be a migration.

## Commands

```bash
# Apply pending migrations
pnpm migrate

# Show applied vs pending
pnpm migrate:status

# Undo last migration (dev / emergency only)
pnpm migrate:down
```

Inside Docker:

```bash
docker compose exec app node scripts/migrate.mjs status
docker compose exec app node scripts/migrate.mjs up
```

## Writing a migration

Prefer helpers in `src/core/database/migrationHelpers.js` so re-runs are safe
when a change was already applied manually on the server:

```js
import { addColumnIfMissing } from "../src/core/database/migrationHelpers.js";

export async function up({ context: queryInterface }) {
  await addColumnIfMissing(
    queryInterface,
    "appointments",
    "foo",
    "`foo` VARCHAR(50) NULL DEFAULT NULL"
  );
}

export async function down({ context: queryInterface }) {
  // optional reverse
}
```

Never edit a migration after it has been applied in production — add a new file instead.

## Deploy

Migrations run in two places (both safe / idempotent via `SequelizeMeta`):

1. **App startup** (`src/core/setup.js`) — before the HTTP server listens
2. **GitHub deploy** (`.github/workflows/deploy.yml`) — `node scripts/migrate.mjs up` after health check

If a migration fails, startup exits non-zero and `/status` never becomes healthy, so deploy will not silently skip schema changes.
