#!/usr/bin/env bash
# Back up the SQLite deployment with writes stopped; restart it even on failure.
set -Eeuo pipefail
umask 077
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project_dir"
if [[ -f .env.mysql ]]; then
  exec bash scripts/backup-mysql.sh "$@"
fi
backup_root=${1:-"$project_dir/backups"}
mkdir -p -- "$backup_root"
backup_root=$(cd -- "$backup_root" && pwd)
container_id=$(docker compose -f docker-compose.yml ps -a -q new-api)
if [[ -z "$container_id" ]]; then
  echo 'No new-api container found. Run this script in the existing deployment.' >&2
  exit 1
fi
# Inspect the running configuration, not .env: it may have changed since startup.
# Never print these environment values because DSNs can contain passwords.
container_env=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container_id")
while IFS= read -r entry; do
  case "$entry" in
    SQL_DSN=*|LOG_SQL_DSN=*)
      dsn=${entry#*=}
      if [[ -n "$dsn" && "$dsn" != local* ]]; then
        echo 'External database detected. This script only backs up SQLite /data; back up MySQL/PostgreSQL (including a separate log database) with database tools or Baota first.' >&2
        exit 1
      fi
      ;;
  esac
done <<< "$container_env"
unset container_env dsn
backup_dir=$(mktemp -d "$backup_root/$(date +%Y%m%d-%H%M%S)-XXXXXX")
# Pull the helper before entering the maintenance window.
docker image inspect alpine:3.22 >/dev/null 2>&1 || docker pull alpine:3.22
if [[ -f .env ]]; then cp -- .env "$backup_dir/.env"; fi
git rev-parse HEAD > "$backup_dir/commit.txt"
was_running=$(docker inspect --format '{{.State.Running}}' "$container_id")
resume_backend() {
  if [[ "$was_running" == true ]]; then docker start "$container_id" >/dev/null; fi
}
trap resume_backend EXIT
if [[ "$was_running" == true ]]; then docker stop -t 60 "$container_id" >/dev/null; fi
# Reuse the real container's mount instead of guessing or creating a volume name.
docker run --rm --volumes-from "$container_id:ro" \
  --mount "type=bind,source=$backup_dir,target=/backup" \
  alpine:3.22 sh -ec 'tar czf /backup/data.tgz -C /data .; tar tzf /backup/data.tgz >/dev/null'
echo "Backup saved to: $backup_dir (contains private data; store securely)"
