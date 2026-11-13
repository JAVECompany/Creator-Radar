#!/bin/sh
set -eu
umask 077
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
export PGPASSWORD="$POSTGRES_PASSWORD"
export PGHOST=db PGUSER="$POSTGRES_USER" PGDATABASE="$POSTGRES_DB"

while true; do
  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="/backups/radar-$timestamp.dump"
  if pg_dump --format=custom --file="$target.partial" && pg_restore --list "$target.partial" >/dev/null; then
    mv "$target.partial" "$target"
    find /backups -type f -name 'radar-*.dump' -mtime +13 -delete
    printf 'Backup completed at %s UTC\n' "$timestamp"
    sleep 86400
  else
    rm -f "$target.partial"
    printf 'Backup failed at %s UTC\n' "$timestamp" >&2
    sleep 900
  fi
done
