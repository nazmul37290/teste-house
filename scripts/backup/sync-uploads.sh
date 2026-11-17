#!/bin/sh
# Daily copy of uploaded images to off-server storage (docs/operations.md). Uses rclone with an
# S3-compatible remote (Cloudflare R2, Backblaze B2, AWS S3) configured once with `rclone config`.
#
#   UPLOAD_DIR=/data/uploads RCLONE_REMOTE=r2:shop-backups ./sync-uploads.sh
#
# `copy`, not `sync`: a file deleted by mistake on the server is still in the bucket.
set -eu

: "${UPLOAD_DIR:?UPLOAD_DIR is required}"
: "${RCLONE_REMOTE:?RCLONE_REMOTE is required}"

rclone copy "$UPLOAD_DIR" "$RCLONE_REMOTE/uploads" --fast-list --transfers 8
echo "Uploads copied to $RCLONE_REMOTE/uploads"
