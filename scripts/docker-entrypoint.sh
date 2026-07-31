#!/bin/sh
# Production container entrypoint: apply pending Umzug migrations, then start API.
set -eu

echo "[entrypoint] Applying pending DB migrations..."
node scripts/migrate.mjs up

echo "[entrypoint] Starting application..."
exec node app.js
