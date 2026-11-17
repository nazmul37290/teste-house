#!/bin/sh
# Database backup (docs/operations.md). Fallback to Dokploy's scheduled backups, or for a manual copy
# before a risky change. Needs pg_dump 17 (the postgres:17 image has it).
#
#   DATABASE_URL=postgresql://user:pass@host:5432/shop BACKUP_DIR=/backups ./backup-db.sh
#   Optional: RCLONE_REMOTE=r2:shop-backups  (copies the new file off the server with rclone)
#
# Keeps 7 daily and 4 weekly (Sunday) backups. Files: shop-YYYYmmdd-HHMMSS.dump (pg_dump custom
# format: compressed, restorable table by table with pg_restore).
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

STAMP=$(date -u +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
FILE="$BACKUP_DIR/daily/shop-$STAMP.dump"

# --no-owner/--no-acl: restorable into any database user. Write to a temp name first so a failed
# dump never looks like a good backup.
pg_dump --format=custom --no-owner --no-acl --file="$FILE.part" "$DATABASE_URL"
mv "$FILE.part" "$FILE"
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# Sunday: also keep a weekly copy.
if [ "$(date -u +%u)" = "7" ]; then
  cp "$FILE" "$BACKUP_DIR/weekly/"
fi

# Retention: newest 7 daily, newest 4 weekly.
ls -1t "$BACKUP_DIR"/daily/shop-*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f
ls -1t "$BACKUP_DIR"/weekly/shop-*.dump 2>/dev/null | tail -n +5 | xargs -r rm -f

# Off-server copy (requirements: backups must not live only on the VPS).
if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$FILE" "$RCLONE_REMOTE/daily/"
  echo "Copied to $RCLONE_REMOTE/daily/"
fi
