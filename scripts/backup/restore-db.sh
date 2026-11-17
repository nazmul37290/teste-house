#!/bin/sh
# Restore a backup into a NEW database (docs/operations.md, monthly restore drill).
#
#   ADMIN_URL=postgresql://user:pass@host:5432/postgres ./restore-db.sh shop-20261117-020000.dump shop_restore_check
#
# ADMIN_URL points at any database on the server (usually "postgres"); the target is created from
# scratch. Restoring over the live database is refused unless you add --replace-live, which you should
# only ever do in a real disaster, after stopping the api and worker.
set -eu

DUMP=${1:?usage: restore-db.sh <file.dump> <target_db> [--replace-live]}
TARGET=${2:?usage: restore-db.sh <file.dump> <target_db> [--replace-live]}
FORCE=${3:-}
: "${ADMIN_URL:?ADMIN_URL is required (a connection to the postgres database)}"
LIVE_DB=${LIVE_DB:-shop}

case "$TARGET" in
  *[!a-z0-9_]*) echo "Target name may only contain a-z, 0-9 and _" >&2; exit 1 ;;
esac
if [ "$TARGET" = "$LIVE_DB" ] && [ "$FORCE" != "--replace-live" ]; then
  echo "Refusing to restore over the live database '$LIVE_DB'. Restore into another name first." >&2
  exit 1
fi

BASE_URL=${ADMIN_URL%/*}
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$TARGET\";" -c "CREATE DATABASE \"$TARGET\";"
pg_restore --no-owner --no-acl --exit-on-error --dbname="$BASE_URL/$TARGET" "$DUMP"
echo "Restored $DUMP into $TARGET"
