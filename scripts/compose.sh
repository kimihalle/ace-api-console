#!/usr/bin/env bash
# Preserve the selected database mode for every production command.
set -Eeuo pipefail
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project_dir"
compose=(docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml)
if [[ -f .env.mysql ]]; then
  compose+=(--env-file .env.mysql -f docker-compose.mysql.yml)
fi
exec "${compose[@]}" "$@"
