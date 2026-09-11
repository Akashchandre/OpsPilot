#!/usr/bin/env sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(CDPATH= cd -- "$script_directory/.." && pwd)
environment_file=${1:-demo.env}

case "$environment_file" in
  /*) ;;
  *) environment_file="$repository_root/$environment_file" ;;
esac

if [ ! -f "$environment_file" ]; then
  echo "Missing $environment_file. Copy demo.env.example to demo.env and fill every value." >&2
  exit 1
fi

if grep -q "CHANGE_ME" "$environment_file"; then
  echo "Replace every CHANGE_ME value in $environment_file before deployment." >&2
  exit 1
fi

if ! grep -Eq '^OPSPILOT_DEMO_PUBLIC_ORIGIN=https://[A-Za-z0-9.-]+\.cloudfront\.net$' "$environment_file"; then
  echo "OPSPILOT_DEMO_PUBLIC_ORIGIN must be the generated CloudFront HTTPS origin without a trailing slash." >&2
  exit 1
fi

chmod 600 "$environment_file"
cd "$repository_root"

docker compose \
  --env-file "$environment_file" \
  -f compose.yaml \
  -f compose.demo.yaml \
  --profile app \
  config --quiet

docker compose \
  --env-file "$environment_file" \
  -f compose.yaml \
  -f compose.demo.yaml \
  --profile app \
  up --detach --build --remove-orphans

docker compose \
  --env-file "$environment_file" \
  -f compose.yaml \
  -f compose.demo.yaml \
  --profile app \
  ps

echo "Deployment started. Wait for every long-running service to become healthy, then run:"
echo "sh docker/demo-smoke.sh <your-cloudfront-origin>"
