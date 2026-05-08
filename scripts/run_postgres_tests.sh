#!/usr/bin/env sh
set -eu

CONTAINER_NAME="mqtpj-postgres-test"
PG_PORT="${POSTGRES_PORT:-55432}"
PG_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
PG_DB="${POSTGRES_DB:-test}"
PG_USER="${POSTGRES_USER:-postgres}"

cleanup() {
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

cleanup
docker run -d --rm \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  -e POSTGRES_DB="$PG_DB" \
  -p "$PG_PORT:5432" \
  postgres:16-alpine >/dev/null

i=0
until docker exec "$CONTAINER_NAME" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "Postgres did not become ready in time"
    exit 1
  fi
  sleep 1
done

POSTGRES_HOST=127.0.0.1 \
POSTGRES_PORT="$PG_PORT" \
POSTGRES_USER="$PG_USER" \
POSTGRES_PASSWORD="$PG_PASSWORD" \
POSTGRES_DB="$PG_DB" \
npm run test:postgres
