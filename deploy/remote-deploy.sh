#!/usr/bin/env bash
set -Eeuo pipefail

umask 027

: "${DEPLOY_PATH:=/var/www/taxigr}"
: "${RELEASE_ID:?RELEASE_ID is required}"
: "${ARCHIVE:?ARCHIVE is required}"
: "${ENV_UPLOAD:?ENV_UPLOAD is required}"
: "${ARCHIVE_SHA256:?ARCHIVE_SHA256 is required}"

if [[ "$(id -u)" != "0" ]]; then
  echo "remote-deploy.sh must run as root" >&2
  exit 1
fi

if [[ "$DEPLOY_PATH" != "/var/www/taxigr" ]]; then
  echo "Refusing unexpected DEPLOY_PATH: $DEPLOY_PATH" >&2
  exit 1
fi

if [[ ! "$RELEASE_ID" =~ ^[0-9a-f]{40}$ ]] || [[ ! "$ARCHIVE_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Invalid release identifier or checksum" >&2
  exit 1
fi

if [[ ! -f "$ARCHIVE" || ! -f "$ENV_UPLOAD" ]]; then
  echo "Deployment archive or environment upload is missing" >&2
  exit 1
fi

actual_sha256="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
if [[ "$actual_sha256" != "$ARCHIVE_SHA256" ]]; then
  echo "Deployment archive checksum mismatch" >&2
  exit 1
fi

if ! id -u taxigr >/dev/null 2>&1; then
  useradd --system --home-dir "$DEPLOY_PATH" --shell /usr/sbin/nologin taxigr
fi

install -d -m 0755 "$DEPLOY_PATH/releases" "$DEPLOY_PATH/incoming"
install -d -o taxigr -g taxigr -m 0750 /var/log/taxigr
install -d -m 0700 /etc/taxigr

release_path="$DEPLOY_PATH/releases/$RELEASE_ID"
if [[ -e "$release_path" ]]; then
  echo "Release already exists: $RELEASE_ID" >&2
  exit 1
fi

mkdir -m 0755 "$release_path"
tar -xzf "$ARCHIVE" -C "$release_path"

test -f "$release_path/package.json"
test -f "$release_path/server/index.ts"
test -f "$release_path/dist/index.html"
test -f "$release_path/deploy/taxigr-api.service"
test -f "$release_path/deploy/nginx.taxigr.conf"

install -m 0600 "$ENV_UPLOAD" /etc/taxigr/taxigr.env

set -a
# shellcheck disable=SC1091
source /etc/taxigr/taxigr.env
set +a

: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"
if [[ ! "$MYSQL_PASSWORD" =~ ^[A-Za-z0-9_-]{24,128}$ ]]; then
  echo "MYSQL_PASSWORD must be a 24-128 character URL-safe value" >&2
  exit 1
fi

mysql --protocol=socket <<SQL
CREATE DATABASE IF NOT EXISTS taxi_grahovo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'taxigr'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';
ALTER USER 'taxigr'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';
GRANT ALL PRIVILEGES ON taxi_grahovo.* TO 'taxigr'@'localhost';
FLUSH PRIVILEGES;
SQL

cd "$release_path"
npm ci --omit=dev --prefix server --no-audit --no-fund
./server/node_modules/.bin/tsx server/scripts/migrate.ts

install -m 0644 deploy/taxigr-api.service /etc/systemd/system/taxigr-api.service
systemctl daemon-reload
systemctl enable taxigr-api.service >/dev/null

previous_release=""
if [[ -L "$DEPLOY_PATH/current" ]]; then
  previous_release="$(readlink -f "$DEPLOY_PATH/current")"
fi
ln -sfn "$release_path" "$DEPLOY_PATH/current.next"
mv -Tf "$DEPLOY_PATH/current.next" "$DEPLOY_PATH/current"

if ! systemctl restart taxigr-api.service; then
  if [[ -n "$previous_release" && -d "$previous_release" ]]; then
    ln -sfn "$previous_release" "$DEPLOY_PATH/current.next"
    mv -Tf "$DEPLOY_PATH/current.next" "$DEPLOY_PATH/current"
    systemctl restart taxigr-api.service || true
  fi
  exit 1
fi

ready=0
for _ in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1:4100/health/ready >/dev/null; then
    ready=1
    break
  fi
  sleep 2
done

if [[ "$ready" != "1" ]]; then
  journalctl -u taxigr-api.service -n 80 --no-pager || true
  if [[ -n "$previous_release" && -d "$previous_release" ]]; then
    ln -sfn "$previous_release" "$DEPLOY_PATH/current.next"
    mv -Tf "$DEPLOY_PATH/current.next" "$DEPLOY_PATH/current"
    systemctl restart taxigr-api.service || true
  fi
  exit 1
fi

if [[ -f /etc/letsencrypt/live/taxigr.ru/fullchain.pem ]]; then
  previous_nginx=""
  if [[ -f /etc/nginx/sites-available/taxigr ]]; then
    previous_nginx="$(mktemp /tmp/taxigr-nginx.XXXXXX)"
    cp /etc/nginx/sites-available/taxigr "$previous_nginx"
  fi
  install -m 0644 deploy/nginx.taxigr.conf /etc/nginx/sites-available/taxigr
  ln -sfn /etc/nginx/sites-available/taxigr /etc/nginx/sites-enabled/taxigr
  if nginx -t; then
    systemctl reload nginx
  else
    if [[ -n "$previous_nginx" ]]; then
      cp "$previous_nginx" /etc/nginx/sites-available/taxigr
    else
      rm -f /etc/nginx/sites-enabled/taxigr /etc/nginx/sites-available/taxigr
    fi
    nginx -t || true
    exit 1
  fi
  [[ -z "$previous_nginx" ]] || rm -f "$previous_nginx"
fi

rm -f "$ARCHIVE" "$ENV_UPLOAD"

mapfile -t old_releases < <(
  find "$DEPLOY_PATH/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' |
    sort -nr | tail -n +6 | cut -d' ' -f2-
)
for old_release in "${old_releases[@]}"; do
  [[ "$old_release" == "$DEPLOY_PATH/releases/"* ]] || continue
  rm -rf -- "$old_release"
done

echo "Deployed release $RELEASE_ID"
