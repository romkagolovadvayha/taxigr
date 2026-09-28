#!/usr/bin/env bash
set -euo pipefail
npm ci --no-audit --no-fund
python3 deploy/test-release-tools.py
npm run check
bash deploy/package-release.sh "$PWD/release.tar.gz"
