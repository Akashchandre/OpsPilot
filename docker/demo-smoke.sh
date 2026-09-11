#!/usr/bin/env sh
set -eu

public_origin=${1:-}
case "$public_origin" in
  https://*.cloudfront.net) ;;
  *)
    echo "Usage: sh docker/demo-smoke.sh https://YOUR-DISTRIBUTION.cloudfront.net" >&2
    exit 1
    ;;
esac

temporary_directory=$(mktemp -d)
trap 'rm -rf "$temporary_directory"' EXIT INT TERM

curl -fsS --retry 12 --retry-delay 5 "$public_origin/" >"$temporary_directory/index.html"
grep -q 'id="root"' "$temporary_directory/index.html"

curl -fsS --retry 12 --retry-delay 5 "$public_origin/login" >"$temporary_directory/login.html"
grep -q 'id="root"' "$temporary_directory/login.html"

curl -fsS --retry 12 --retry-delay 5 "$public_origin/api/v1/health" >"$temporary_directory/health.json"
grep -q '"success":true' "$temporary_directory/health.json"

curl -fsS \
  --retry 5 \
  --retry-delay 2 \
  --header "Origin: $public_origin" \
  "$public_origin/api/v1/socket.io/?EIO=4&transport=polling&t=demo-smoke" \
  >"$temporary_directory/socket.txt"
grep -q '^0{' "$temporary_directory/socket.txt"

echo "Public demo smoke passed: SPA, API health, and Socket.IO transport are reachable through CloudFront."
