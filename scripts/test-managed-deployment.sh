#!/usr/bin/env bash
# Exercise setup/update/backup failure paths with an isolated Docker stub.
set -Eeuo pipefail
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
mkdir "$scratch/bin"
export TEST_EVENTS="$scratch/events"
cat > "$scratch/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$TEST_EVENTS"
case "$*" in
  'compose version'|'info') exit 0 ;;
  *'config --format json'*) echo '{"name":"fixture"}' ;;
  *'config --quiet'*) exit 0 ;;
  'volume ls '*) if [[ "${TEST_VOLUME_EXISTS:-false}" == true ]]; then echo fixture_mysql_data; fi ;;
  *'ps -a -q new-api'*) echo fixture-app ;;
  *' up -d '*) exit "${TEST_UP_EXIT:-0}" ;;
  *' exec -T mysql '*) printf -- '-- SQL backup fixture\n'; exit "${TEST_DUMP_EXIT:-0}" ;;
  *' ps') exit 0 ;;
  inspect*)
    if [[ "$*" == *'.Config.Env'* ]]; then
      printf 'SQL_DSN=aceapi:test@tcp(mysql:3306)/aceapi?charset=utf8mb4\n'
    else echo "${TEST_RUNNING:-true}"; fi ;;
  start*|stop*|cp*) exit 0 ;;
  *) echo "Unhandled mock command: $*" >&2; exit 90 ;;
esac
EOF
cat > "$scratch/bin/git" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == 'rev-parse HEAD' ]]; then echo fixture-commit; else exit 80; fi
EOF
chmod +x "$scratch/bin/"*
export PATH="$scratch/bin:$PATH"

fixture() {
  mkdir -p "$1/scripts"
  cp "$source_dir"/scripts/{deploy,compose,backup,backup-mysql}.sh "$1/scripts/"
  cp "$source_dir"/docker-compose{,.prod,.mysql}.yml "$1/"
  printf 'SITE_URL=https://example.com\nSESSION_SECRET=keep-session\nCRYPTO_SECRET=keep-crypto\nSQL_DSN=old-connection\n' > "$1/.env"
}

fixture "$scratch/first"
cd "$scratch/first"
base_hash=$(sha256sum .env)
bash scripts/deploy.sh --fresh-mysql >/dev/null
[[ "$(sha256sum .env)" == "$base_hash" ]]
[[ $(grep -Ec '^ACE_MYSQL(_ROOT)?_PASSWORD=[0-9a-f]{64}$' .env.mysql) -eq 2 ]]
secret_hash=$(sha256sum .env.mysql)
[[ -n "$(find backups -name .env -print -quit)" ]]
echo 'First setup creates secrets and backs up old settings without changing .env: PASS'

bash scripts/deploy.sh --fresh-mysql >/dev/null
[[ "$(sha256sum .env.mysql)" == "$secret_hash" ]]
echo 'Repeated setup preserves database passwords: PASS'

: > "$TEST_EVENTS"
bash scripts/compose.sh ps
grep -q -- '--env-file .env.mysql -f docker-compose.mysql.yml ps' "$TEST_EVENTS"
echo 'Daily commands automatically load MySQL override: PASS'

export TEST_UP_EXIT=12
if bash scripts/deploy.sh >"$scratch/start-failure" 2>&1; then exit 1; fi
[[ "$(sha256sum .env.mysql)" == "$secret_hash" ]]
export TEST_UP_EXIT=0
echo 'Readiness failure propagates without rotating credentials: PASS'

fixture "$scratch/lost-secrets"
cd "$scratch/lost-secrets"
export TEST_VOLUME_EXISTS=true
if bash scripts/deploy.sh --fresh-mysql >"$scratch/missing-secret" 2>&1; then exit 1; fi
if bash scripts/deploy.sh >"$scratch/missing-secret-update" 2>&1; then exit 1; fi
[[ ! -f .env.mysql ]]
grep -q 'Restore its original credential file' "$scratch/missing-secret"
export TEST_VOLUME_EXISTS=false
echo 'Existing MySQL volume with missing secrets refuses regeneration: PASS'

cd "$scratch/first"
export TEST_DUMP_EXIT=17
: > "$TEST_EVENTS"
if bash scripts/backup.sh "$scratch/failed-backup" >/dev/null 2>&1; then exit 1; fi
grep -q '^start fixture-app$' "$TEST_EVENTS"
[[ -z "$(find "$scratch/failed-backup" -name mysql.sql.gz -print -quit)" ]]
echo 'Failed MySQL dump restores application and creates no final SQL archive: PASS'

export TEST_DUMP_EXIT=0 TEST_RUNNING=true
: > "$TEST_EVENTS"
bash scripts/backup.sh "$scratch/success-backup" >/dev/null
archive=$(find "$scratch/success-backup" -name mysql.sql.gz -print -quit)
gzip -t "$archive"
[[ -f "$(dirname "$archive")/.env.mysql" ]]
grep -q '^start fixture-app$' "$TEST_EVENTS"
echo 'Backup auto-selects managed MySQL and includes SQL plus credentials: PASS'

export TEST_RUNNING=false
: > "$TEST_EVENTS"
bash scripts/backup.sh "$scratch/stopped-backup" >/dev/null
if grep -Eq '^(stop|start) ' "$TEST_EVENTS"; then exit 1; fi
echo 'Backup preserves stopped application state: PASS'
