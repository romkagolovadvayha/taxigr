"""Build street anchors from an OpenStreetMap PBF (requires pyosmium)."""

import argparse
import json
import math
import re
from collections import defaultdict
from pathlib import Path

import osmium


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src/data"


def street_key(name):
    name = name.casefold().replace("ё", "е")
    name = re.sub(r"^(?:ул(?:ица)?\.?|пер(?:еулок)?\.?|проезд|шоссе)\s+", "", name)
    name = re.sub(r"\s+(?:улица|переулок|проезд|шоссе)$", "", name)
    return re.sub(r"[^а-я0-9a-z]+", "", name)


def distance(left, right):
    return math.hypot((left[0] - right[0]) * 111_200, (left[1] - right[1]) * 62_200)


def middle(line):
    lengths = [distance(a, b) for a, b in zip(line, line[1:])]
    remaining = sum(lengths) / 2
    for start, end, length in zip(line, line[1:], lengths):
        if 0 < length and remaining <= length:
            ratio = remaining / length
            return tuple(a + (b - a) * ratio for a, b in zip(start, end))
        remaining -= length
    return line[0]


class NamedRoads(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.lines = defaultdict(list)

    def way(self, way):
        name = way.tags.get("name")
        if not name or not way.tags.get("highway") or way.tags.get("area") == "yes":
            return
        line = [(node.lat, node.lon) for node in way.nodes if node.location.valid()]
        if len(line) >= 2 and any(55.88 <= lat <= 56.26 and 51.53 <= lon <= 52.27 for lat, lon in line):
            self.lines[street_key(name)].append(line)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pbf")
    parser.add_argument("--date", required=True, help="date of the OSM extract")
    args = parser.parse_args()
    roads = NamedRoads()
    roads.apply_file(args.pbf, locations=True, idx="flex_mem")
    mapped = defaultdict(list)
    for point in json.loads((DATA / "grahovo-house-points.json").read_text(encoding="utf-8"))["points"]:
        coordinates = point["coordinates"]
        mapped[point["label"].rsplit(", ", 1)[0]].append((coordinates["latitude"], coordinates["longitude"]))
    settlements = {}
    streets = {}
    for line in (DATA / "grahovo-address-directory.ts").read_text(encoding="utf-8").splitlines():
        if not line.startswith('  ["'):
            continue
        label, level, lat, lon, _ = json.loads(line.strip().removesuffix(","))
        if level == 6:
            settlements[label] = (lat, lon)
        if level == 8:
            streets[label] = (lat, lon)
    anchors = {}
    for label, origin in sorted(streets.items()):
        locality, _, street = label.rpartition(", ")
        candidates = roads.lines.get(street_key(street), [])
        reference = mapped.get(label)
        # Use the known house positions when available. Otherwise bind a
        # uniquely nearby road name to the locality, avoiding namesakes.
        ranked = sorted(
            (min(distance(point, node) for point in (reference or [origin]) for node in line), middle(line))
            for line in candidates
            if min(distance(origin, node) for node in line) <= 1_600
        )
        if not ranked or ranked[0][0] > (140 if reference else 1_600):
            continue
        score, anchor = ranked[0]
        if distance(anchor, settlements.get(locality, origin)) > 2_200:
            continue
        if any(other_score - score < 300 and distance(anchor, other) > 600 for other_score, other in ranked[1:]):
            continue
        anchors[label] = tuple(round(value, 6) for value in anchor)
    lines = [
        "{",
        f'  "dataDate": {json.dumps(args.date)},',
        '  "source": "OpenStreetMap contributors",',
        '  "license": "ODbL-1.0",',
        '  "sourceUrl": "https://www.openstreetmap.org/copyright",',
        '  "points": {',
        ",\n".join(f"    {json.dumps(label, ensure_ascii=False)}: {json.dumps(point)}" for label, point in anchors.items()),
        "  }",
        "}",
    ]
    (DATA / "grahovo-street-points.json").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Matched {len(anchors)} of {len(streets)} GAR streets to OSM roads.")


if __name__ == "__main__":
    main()
