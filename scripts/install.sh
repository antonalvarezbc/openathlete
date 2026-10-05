#!/bin/sh
# Installs or updates a self-hosted OpenAthlete with Docker Compose.
#
#   curl -fsSL https://raw.githubusercontent.com/openathleteorg/openathlete/main/scripts/install.sh | sh
#   curl -fsSL .../install.sh | sh -s -- --domain openathlete.example.org
#
# Options:
#   --domain NAME  serve https://NAME with automatic certificates (Caddy);
#                  the domain's DNS must point to this server
#   --url URL      address users open, without HTTPS handled here (default
#                  http://localhost; use your own reverse proxy for TLS)
#   --dir PATH     where to install (default ./openathlete, or this
#                  repository when run from a clone)
#   --no-start     only write the configuration
#   --no-pull      start with images already on this machine
#
# Running it again keeps the existing .env, secrets included, and updates the
# containers.
set -eu

REF="${OPENATHLETE_REF:-main}"
RAW="https://raw.githubusercontent.com/openathleteorg/openathlete/$REF"
DOMAIN=""
URL=""
DIR=""
START=1
PULL=1

say() { printf '%s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:?--domain needs a name}"; shift 2 ;;
    --url) URL="${2:?--url needs an address}"; shift 2 ;;
    --dir) DIR="${2:?--dir needs a path}"; shift 2 ;;
    --no-start) START=0; shift ;;
    --no-pull) PULL=0; shift ;;
    -h|--help) sed -n '2,20p' "$0" 2>/dev/null || true; exit 0 ;;
    *) die "unknown option $1 (see --help)" ;;
  esac
done

command -v docker >/dev/null 2>&1 \
  || die "Docker is required: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 \
  || die "the Docker Compose plugin is required: https://docs.docker.com/compose/install/"

# In a clone, use its files; otherwise download them
if [ -z "$DIR" ]; then
  if [ -f docker-compose.yml ] && [ -f .env.example ] && [ -f scripts/install.sh ]; then
    DIR="."
  else
    DIR="openathlete"
  fi
fi
mkdir -p "$DIR"
cd "$DIR"

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$RAW/$1" -o "$1"
  else
    wget -qO "$1" "$RAW/$1"
  fi
}

if [ ! -f scripts/install.sh ]; then
  say "Downloading the configuration ($REF)..."
  fetch docker-compose.yml || die "could not download docker-compose.yml"
  fetch .env.example || die "could not download .env.example"
fi

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
  fi
}

# Sets KEY=VALUE in .env, replacing the line or a commented "# KEY=" one
set_env() {
  awk -v key="$1" -v value="$2" '
    BEGIN { done = 0 }
    !done && ($0 ~ "^" key "=" || $0 ~ "^# " key "=") { print key "=" value; done = 1; next }
    { print }
    END { if (!done) print key "=" value }
  ' .env > .env.tmp
  # Rewritten in place to keep the file's permissions (600)
  cat .env.tmp > .env && rm -f .env.tmp
}

get_env() {
  sed -n "s/^$1=//p" .env | tail -n 1
}

if [ -f .env ]; then
  say "Keeping the existing .env"
else
  cp .env.example .env
  chmod 600 .env
  set_env JWT_SECRET_KEY "$(random_secret)"
  set_env HASH_PEPPER "$(random_secret)"
  set_env POSTGRES_PASSWORD "$(random_secret)"
  say "Created .env with new secrets. Keep a copy: without HASH_PEPPER, no password can be checked."
fi

# Secrets left empty in an older .env
[ -n "$(get_env JWT_SECRET_KEY)" ] || set_env JWT_SECRET_KEY "$(random_secret)"
[ -n "$(get_env HASH_PEPPER)" ] || set_env HASH_PEPPER "$(random_secret)"

if [ -n "$DOMAIN" ]; then
  set_env APP_URL "https://$DOMAIN"
  set_env DOMAIN "$DOMAIN"
  set_env COMPOSE_PROFILES https
  set_env WEB_PORT 127.0.0.1:8080
elif [ -n "$URL" ]; then
  set_env APP_URL "${URL%/}"
fi
APP_URL="$(get_env APP_URL)"

if [ "$START" = 0 ]; then
  say "Configuration written to $(pwd)/.env. Start with: docker compose up -d"
  exit 0
fi

if [ "$PULL" = 1 ]; then
  say "Downloading the images..."
  docker compose pull --quiet
fi
docker compose up -d --remove-orphans

say "Waiting for OpenAthlete to start..."
i=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q web)" 2>/dev/null)" = healthy ]; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    die "OpenAthlete did not start in time. See: docker compose logs api"
  fi
  sleep 3
done

say ""
say "OpenAthlete is running: ${APP_URL:-http://localhost}"
say "Create your account there. Configuration: $(pwd)/.env"
say "Update later by running this script again, or: docker compose pull && docker compose up -d"
