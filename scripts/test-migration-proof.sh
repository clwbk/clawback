#!/usr/bin/env bash
# test-migration-proof.sh
#
# Spins up a throwaway Postgres container, runs all Drizzle migrations
# from scratch, then optionally runs them a second time to detect
# non-idempotent migrations. Tears down the container on exit.
#
# Usage:
#   ./scripts/test-migration-proof.sh          # fresh-migrate only
#   ./scripts/test-migration-proof.sh --twice  # also re-run to detect non-idempotent issues

set -euo pipefail

CONTAINER_NAME="clawback-migration-proof-$$"
DB_NAME="clawback_test"
DB_USER="clawback"
DB_PASS="clawback"
HOST_PORT="5499"
RUN_TWICE=false

for arg in "$@"; do
  case "$arg" in
    --twice) RUN_TWICE=true ;;
  esac
done

cleanup() {
  echo ""
  echo "--- Cleanup ---"
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "=== Migration Proof ==="
echo ""
echo "1) Starting temporary Postgres container ($CONTAINER_NAME)..."
docker run -d --rm \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASS" \
  -p "$HOST_PORT:5432" \
  pgvector/pgvector:pg16 >/dev/null

echo "   Waiting for Postgres to accept connections..."
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "   FAIL: Postgres did not become ready in 30s"
    exit 1
  fi
  sleep 1
done
echo "   Postgres ready."
echo ""

export DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@localhost:${HOST_PORT}/${DB_NAME}"

echo "2) Running migrations (fresh database)..."
if pnpm --filter @clawback/db db:migrate; then
  echo "   PASS: Fresh migration completed successfully."
else
  echo "   FAIL: Fresh migration failed!"
  exit 1
fi
echo ""

if [ "$RUN_TWICE" = true ]; then
  echo "3) Running migrations a second time (idempotency check)..."
  if pnpm --filter @clawback/db db:migrate; then
    echo "   PASS: Second migration run completed successfully (idempotent)."
  else
    echo "   FAIL: Second migration run failed (non-idempotent migration detected)!"
    exit 1
  fi
  echo ""
fi

echo "4) Verifying tables exist..."
TABLE_COUNT=$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" | tr -d ' ')

if [ "$TABLE_COUNT" -gt 0 ]; then
  echo "   PASS: $TABLE_COUNT tables found in public schema."
else
  echo "   FAIL: No tables found after migration!"
  exit 1
fi

echo ""
echo "=== All migration proof checks passed ==="
