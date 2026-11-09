#!/bin/sh
set -eu
umask 077

# Run from the repository root. flock and timeout come from Ubuntu base tools.
project_directory=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_directory"
backup_directory=${BACKUP_DIRECTORY:-/var/backups/accessibility-passport}
case "$backup_directory" in
  /*) ;;
  *) echo 'BACKUP_ERROR: BACKUP_DIRECTORY must be absolute.' >&2; exit 1 ;;
esac
mkdir -p "$backup_directory"
chmod 700 "$backup_directory"
exec 9>"$backup_directory/.backup.lock"
flock -n 9 || { echo 'BACKUP_ERROR: A backup is already running.' >&2; exit 1; }

container_id=$(docker compose ps -q app)
[ -n "$container_id" ] || { echo 'BACKUP_ERROR: App is not running.' >&2; exit 1; }
snapshot_name=$(date -u +%Y%m%dT%H%M%SZ)-$$
container_directory=/tmp/passport-backup-$snapshot_name
incoming=$backup_directory/.incoming-$snapshot_name
destination=$backup_directory/$snapshot_name
mkdir "$incoming"

cleanup() {
  # Only our unique temporary directory, never the live database.
  timeout 15 docker exec "$container_id" node -e \
    'require("node:fs").rmSync(process.argv[1], {recursive:true, force:true})' \
    "$container_directory" >/dev/null 2>&1 || true
  if [ -d "$incoming" ]; then rm -r -- "$incoming"; fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

timeout 330 docker exec "$container_id" node scripts/database.mjs backup \
  --destination "$container_directory"
timeout 120 docker cp "$container_id:$container_directory/." "$incoming/"
chmod 600 "$incoming/site.sqlite" "$incoming/manifest.json"
# Verify the actual host copy in a separate container. The volume is read-only;
# node runs as the host owner so it can read the private backup files.
timeout 330 docker compose run --rm --no-deps --user "$(id -u):$(id -g)" \
  --volume "$incoming:/restore:ro" --entrypoint node app \
  scripts/database.mjs verify --snapshot /restore
mv -T -- "$incoming" "$destination"
echo "BACKUP_SAVED=$destination"
