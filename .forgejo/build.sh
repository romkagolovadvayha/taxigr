#!/usr/bin/env bash
set -euo pipefail
# Gitflic can reset HTTP/2 streams during npm's git dependency resolution.
# Apply HTTP/1.1 to npm's child git processes without changing host settings.
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0=http.version
export GIT_CONFIG_VALUE_0=HTTP/1.1
npm ci --no-audit --no-fund
python3 deploy/test-release-tools.py
npm run check
bash deploy/package-release.sh "$PWD/release.tar.gz"
