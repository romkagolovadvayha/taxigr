#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
archive="${1:?Usage: package-release.sh archive.tar.gz}"

# dist contains the exported website, including its images, fonts and audio.
# Keep shared TypeScript sources used by the API, but not native/design projects.
files=(dist server src deploy package.json package-lock.json tsconfig.json app.json)
for required in dist/index.html server/index.ts server/package-lock.json src/domain/models.ts; do
  test -f "$required" || { echo "Missing release input: $required" >&2; exit 1; }
done

tar \
  --exclude='node_modules' \
  --exclude='.env*' \
  --exclude='*.test.*' \
  --exclude='__tests__' \
  --exclude='*.tsbuildinfo' \
  --exclude='deploy/osrm/data' \
  -czf "$archive" "${files[@]}"

bytes="$(wc -c < "$archive")"
echo "Release archive: $bytes bytes (website, API and deployment files)"
