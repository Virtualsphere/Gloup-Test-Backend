#!/usr/bin/env bash
# Run on UAT server as root after code is cloned/rsynced to:
#   /var/www/gloup/uat/backend/Gloup-Test-Backend
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/var/www/gloup/uat/backend/Gloup-Test-Backend}"
ADMIN_DIR="${ADMIN_DIR:-/var/www/gloup/uat/admin/Gloup-Test-AdminPanel}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not installed. Install Docker first."
  exit 1
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "Missing $BACKEND_DIR/.env — copy from .env.example and fill values."
  exit 1
fi

if [ ! -f "$BACKEND_DIR/config/firebase.json" ]; then
  echo "Missing $BACKEND_DIR/config/firebase.json — copy prod/UAT Firebase service account JSON."
  exit 1
fi

cd "$BACKEND_DIR"
docker compose up -d --build db redis

echo "Waiting for MySQL..."
for _ in $(seq 1 40); do
  if docker compose exec -T db mysqladmin ping -h 127.0.0.1 -uroot -pGloup#123 --silent 2>/dev/null; then
    break
  fi
  sleep 3
done

docker compose up -d --build app

if [ -d "$ADMIN_DIR" ]; then
  cd "$ADMIN_DIR"
  if [ ! -f .env ]; then
    cat > .env <<EOF
VITE_API_BASE_URL=http://169.58.105.116:5678
VITE_IMAGE_BASE_URL=https://storage.googleapis.com/gloup-images
VITE_GOOGLE_MAPS_KEY=CHANGE_ME
PORT=3002
EOF
    echo "Created admin .env — update VITE_GOOGLE_MAPS_KEY if needed."
  fi
  docker compose --env-file .env up -d --build
fi

echo "UAT bootstrap complete."
docker compose -f "$BACKEND_DIR/docker-compose.yml" ps
