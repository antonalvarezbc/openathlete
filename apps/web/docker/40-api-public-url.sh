#!/bin/sh
# Injects the public API URL into index.html at container start, so a single
# image works for any deployment. The app reads it from a <meta> tag at
# runtime: index.html is never cached, while the hashed bundles are cached for
# a year and must not change. Builds made with a real VITE_API_BASE_URL contain
# no placeholder and are left untouched.
set -eu

PLACEHOLDER="__OPENATHLETE_API_BASE_URL__"
INDEX=/usr/share/nginx/html/index.html

if ! grep -qF "$PLACEHOLDER" "$INDEX"; then
  exit 0
fi

API_URL="${API_PUBLIC_URL:-http://localhost:3000}"
API_URL="${API_URL%/}"
# Only characters that are safe inside an HTML attribute and a sed replacement
if ! printf '%s' "$API_URL" | grep -Eq '^https?://[A-Za-z0-9._~:/?#@!$()*+,;=%-]+$'; then
  echo "API_PUBLIC_URL must be an http:// or https:// URL (got '$API_URL')" >&2
  exit 1
fi

sed -i "s|$PLACEHOLDER|$API_URL|g" "$INDEX"
echo "Web app configured to call the API at $API_URL"
