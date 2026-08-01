#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
PBF="$DATA_DIR/volga-fed-district-latest.osm.pbf"
PBF_DOWNLOAD="$PBF.download"
PBF_COMPLETE="$PBF.complete"
GRAPH_READY="$DATA_DIR/volga-fed-district-latest.osrm.mldgr"
IMAGE="ghcr.io/project-osrm/osrm-backend@sha256:a7091038e39a73659767f34ef2d389909b42ea80b09bd2bdca482dce2991cbad"
REFRESH="${1:-}"

mkdir -p "$DATA_DIR"
if [ "$REFRESH" != "--refresh" ] && [ -f "$PBF_COMPLETE" ] && [ -f "$GRAPH_READY" ]; then
  echo "OSRM data is already prepared. Use --refresh to download a newer extract."
  exit 0
fi

if [ "$REFRESH" = "--refresh" ] || [ ! -f "$PBF_COMPLETE" ]; then
  echo "Downloading the Volga Federal District OSM extract (~750 MB)..."
  if [ "$REFRESH" = "--refresh" ]; then
    rm -f -- "$PBF_DOWNLOAD"
  fi
  curl --fail --location --retry 4 --retry-delay 3 --continue-at - \
    --output "$PBF_DOWNLOAD" \
    https://download.geofabrik.de/russia/volga-fed-district-latest.osm.pbf
  mv -f -- "$PBF_DOWNLOAD" "$PBF"
  : > "$PBF_COMPLETE"
fi

echo "Preparing the OSRM driving graph. The first run can take tens of minutes."
docker run --rm -t -v "$DATA_DIR:/data" "$IMAGE" \
  osrm-extract -p /opt/car.lua /data/volga-fed-district-latest.osm.pbf
docker run --rm -t -v "$DATA_DIR:/data" "$IMAGE" \
  osrm-partition /data/volga-fed-district-latest.osrm
docker run --rm -t -v "$DATA_DIR:/data" "$IMAGE" \
  osrm-customize /data/volga-fed-district-latest.osrm

echo "OSRM is ready. Run: docker compose up -d"
