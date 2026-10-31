#!/usr/bin/env bash
# Consistent backup of the managed single-writer MySQL deployment.
set -Eeuo pipefail
umask 077
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project_dir"
if [[ ! -f .env.mysql ]]; then
  echo 'Managed MySQL is not configured. For Baota databases, use the Baota backup tools.' >&2
  exit 1
fi
container_id=$(bash scripts/compose.sh ps -a -q new-api)
if [[ -z "$container_id" ]]; then echo 'No application container found.' >&2; exit 1; fi
actual_dsn=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container_id" |
  sed -n 's/^SQL_DSN=//p')
if [[ "$actual_dsn" != aceapi:*'@tcp(mysql:3306)/aceapi?'* ]]; then
  echo 'Current application is not connected to the managed MySQL database. Back up its actual database first.' >&2
  exit 1
fi
unset actual_dsn
backup_root=${1:-"$project_dir/backups"}
mkdir -p -- "$backup_root"
backup_root=$(cd -- "$backup_root" && pwd)
backup_dir=$(mktemp -d "$backup_root/mysql-$(date +%Y%m%d-%H%M%S)-XXXXXX")
cp .env .env.mysql "$backup_dir/"
git rev-parse HEAD > "$backup_dir/commit.txt"
was_running=$(docker inspect --format '{{.State.Running}}' "$container_id")
resume_backend() {
  if [[ "$was_running" == true ]]; then docker start "$container_id" >/dev/null; fi
}
trap resume_backend EXIT
if [[ "$was_running" == true ]]; then docker stop -t 60 "$container_id" >/dev/null; fi
bash scripts/compose.sh exec -T mysql sh -ec '
  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  exec mysqldump -u root --single-transaction --routines --events --triggers --no-tablespaces "$MYSQL_DATABASE"
' | gzip > "$backup_dir/mysql.sql.gz.partial"
gzip -t "$backup_dir/mysql.sql.gz.partial"
mv "$backup_dir/mysql.sql.gz.partial" "$backup_dir/mysql.sql.gz"
mkdir "$backup_dir/app-data"
docker cp "$container_id:/data/." "$backup_dir/app-data/"
echo "Backup saved to: $backup_dir (contains database and secrets; store securely)"
