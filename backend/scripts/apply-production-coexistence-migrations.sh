#!/usr/bin/env bash
set -euo pipefail

phase="${1:-}"
case "$phase" in
  pre-counter|post-counter) ;;
  *) printf 'Usage: %s pre-counter|post-counter\n' "$0" >&2; exit 2 ;;
esac

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
migrations="$script_dir/../supabase/migrations"

export PGHOST=aws-0-ap-northeast-1.pooler.supabase.com
export PGPORT=5432
export PGUSER=postgres.daenwuszqdfkbjiatsjs
export PGDATABASE=postgres
export PGSSLMODE=require

printf 'Production database password (input hidden): ' >&2
IFS= read -r -s PGPASSWORD
printf '\n' >&2
export PGPASSWORD

if [[ "$PGHOST" != aws-0-ap-northeast-1.pooler.supabase.com ||
      "$PGUSER" != postgres.daenwuszqdfkbjiatsjs ||
      "$PGPORT" != 5432 ]]; then
  printf 'Refusing unexpected production connection settings\n' >&2
  exit 1
fi

connected_session="$(psql -v ON_ERROR_STOP=1 -Atc 'select current_database(), current_user')"
if [[ "$connected_session" != 'postgres|postgres' ]]; then
  printf 'Refusing unexpected database session: %s\n' "$connected_session" >&2
  exit 1
fi

if [[ "$phase" == pre-counter ]]; then
  files=("$migrations"/001[3-9]_*.sql "$migrations"/0020_*.sql)
else
  files=("$migrations"/002[1-5]_*.sql)
fi

for file in "${files[@]}"; do
  [[ -f "$file" ]] || { printf 'Missing migration: %s\n' "$file" >&2; exit 1; }
  printf 'Applying %s\n' "$(basename -- "$file")"
  psql -v ON_ERROR_STOP=1 --single-transaction -q -f "$file"
done
