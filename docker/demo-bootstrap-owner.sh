#!/usr/bin/env sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(CDPATH= cd -- "$script_directory/.." && pwd)
environment_file=${1:-demo.env}
shift || true

case "$environment_file" in
  /*) ;;
  *) environment_file="$repository_root/$environment_file" ;;
esac

if [ ! -f "$environment_file" ]; then
  echo "Missing $environment_file." >&2
  exit 1
fi

cd "$repository_root"
exec docker compose \
  --env-file "$environment_file" \
  -f compose.yaml \
  -f compose.demo.yaml \
  --profile app \
  run --rm --no-deps api \
  node apps/api/src/scripts/bootstrapOwner.js "$@"
