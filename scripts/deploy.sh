#!/usr/bin/env bash
# Production setup/update. --fresh-mysql selects a new, isolated application DB.
set -Eeuo pipefail
umask 077
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project_dir"
fresh_mysql=false
build=false
for arg in "$@"; do
  case "$arg" in
    --fresh-mysql) fresh_mysql=true ;;
    --build) build=true ;;
    *) echo 'Usage: bash scripts/deploy.sh [--fresh-mysql] [--build]' >&2; exit 2 ;;
  esac
done
command -v openssl >/dev/null
command -v python3 >/dev/null
docker compose version >/dev/null
docker info >/dev/null

if [[ ! -f .env ]]; then
  read -r -p 'Public HTTPS origin (for example https://api.example.com): ' site_url
  if [[ ! "$site_url" =~ ^https://[^/[:space:]]+$ ]]; then
    echo 'Enter an HTTPS origin without a path or trailing slash.' >&2
    exit 1
  fi
  printf 'SITE_URL=%s\nSESSION_SECRET=%s\nCRYPTO_SECRET=%s\n' \
    "$site_url" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > .env
fi
chmod 600 .env

if [[ ! -f .env.mysql ]]; then
  # Validate existing HTTPS settings before creating any database credentials.
  bash scripts/compose.sh config --quiet
  project_name=$(docker compose --env-file .env -f docker-compose.yml config --format json |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')
  old_volumes=$(docker volume ls --quiet \
    --filter "label=com.docker.compose.project=$project_name" \
    --filter 'label=com.docker.compose.volume=mysql_data')
  if [[ -n "$old_volumes" ]]; then
    echo 'Managed MySQL volume already exists but .env.mysql is missing. Restore its original credential file from backup; do not generate new passwords.' >&2
    exit 1
  fi
fi
if [[ "$fresh_mysql" == true && ! -f .env.mysql ]]; then
  mkdir -p backups
  snapshot_dir=$(mktemp -d "backups/before-managed-mysql-$(date +%Y%m%d-%H%M%S)-XXXXXX")
  cp .env "$snapshot_dir/.env"
  cp docker-compose.prod.yml "$snapshot_dir/docker-compose.prod.yml"
  git rev-parse HEAD > "$snapshot_dir/commit.txt"
  # noclobber prevents concurrent setup from replacing another run's credentials.
  (set -o noclobber
   printf 'ACE_MYSQL_PASSWORD=%s\nACE_MYSQL_ROOT_PASSWORD=%s\n' \
     "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > .env.mysql)
  echo "Selected a new managed MySQL database. Previous settings saved in $snapshot_dir."
  echo 'Existing Baota databases and SQLite files are retained; their data is not imported.'
fi
if [[ -f .env.mysql ]]; then chmod 600 .env.mysql; fi
bash scripts/compose.sh config --quiet
start_args=(up -d --wait --wait-timeout 600)
if [[ "$build" == true ]]; then start_args+=(--build); fi
if ! bash scripts/compose.sh "${start_args[@]}"; then
  echo 'Deployment did not become healthy. Inspect: bash scripts/compose.sh logs --tail=100 mysql new-api' >&2
  exit 1
fi
bash scripts/compose.sh ps
echo 'Deployment is healthy. Open your HTTPS site /setup to initialize a fresh database.'
