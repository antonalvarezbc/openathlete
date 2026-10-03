#!/bin/sh
# Injects the public API URL into the built web app at container start, so a
# single image works for any deployment. Builds made with a real
# VITE_API_BASE_URL contain no placeholder and are left untouched.
set -eu

PLACEHOLDER="__OPENATHLETE_API_BASE_URL__"
ROOT=/usr/share/nginx/html

if ! grep -rqF "$PLACEHOLDER" "$ROOT"; then
  exit 0
fi

API_URL="${API_PUBLIC_URL:-http://localhost:3000}"
case "$API_URL" in
  http://*|https://*) ;;
  *) echo "API_PUBLIC_URL must start with http:// or https:// (got '$API_URL')" >&2; exit 1 ;;
esac

# Escape characters that are special in the sed replacement
ESCAPED=$(printf '%s' "${API_URL%/}" | sed 's/[&|\\]/\\&/g')
grep -rlF "$PLACEHOLDER" "$ROOT" | xargs sed -i "s|$PLACEHOLDER|$ESCAPED|g"
echo "Web app configured to call the API at ${API_URL%/}"
