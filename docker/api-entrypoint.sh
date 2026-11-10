#!/bin/sh
set -e
# Apply pending migrations before starting, when asked to (set RUN_MIGRATIONS=true on ONE api instance).
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running database migrations"
  node node_modules/prisma/build/index.js migrate deploy
fi
exec "$@"
