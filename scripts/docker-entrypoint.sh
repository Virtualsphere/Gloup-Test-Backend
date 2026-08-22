#!/bin/sh
# Production container entrypoint: apply pending Umzug migrations, then start API.
set -eu

echo "[entrypoint] Starting application (sync + migrations run in setup())..."
exec node app.js
