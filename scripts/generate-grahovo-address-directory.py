"""Generate the local Grahovo address fallback from the official GAR XML archive.

The script reads only the compressed Udmurt Republic entries through HTTP range
requests, so it does not download the complete multi-gigabyte Russian archive.
"""

from __future__ import annotations

import io
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path


ARCHIVE_DATE = "2026.08.04"
ARCHIVE_URL = f"https://fias-file.nalog.ru/downloads/{ARCHIVE_DATE}/gar_xml.zip"
REGION_CODE = "18"
OUTPUT = Path(__file__).resolve().parents[1] / "src/data/grahovo-address-directory.ts"
READ_AHEAD_BYTES = 8 * 1024 * 1024
DISTRICT_FALLBACK = (56.026, 51.95)


class RemoteZipReader(io.RawIOBase):
    """Seekable, read-ahead HTTP range reader used by ``zipfile``."""

    def __init__(self, url: str) -> None:
        self.url = url
        self.position = 0
        self.cache_start = 0
        self.cache = b""
        request = urllib.request.Request(
            url,
            method="HEAD",
            headers={"User-Agent": "taxi-grahovo-address-generator/1.0"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            self.size = int(response.headers["Content-Length"])

    def seekable(self) -> bool:
        return True

    def readable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.position

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        if whence == io.SEEK_SET:
            self.position = offset
        elif whence == io.SEEK_CUR:
            self.position += offset
        elif whence == io.SEEK_END:
            self.position = self.size + offset
        else:
            raise ValueError(f"Unsupported seek mode: {whence}")
        return self.position

    def read(self, size: int = -1) -> bytes:
        if self.position >= self.size:
            return b""
        if size < 0:
            size = self.size - self.position
        cache_end = self.cache_start + len(self.cache)
        if not (self.cache_start <= self.position and self.position + size <= cache_end):
            self.cache_start = self.position
            end = min(self.size - 1, self.position + max(size, READ_AHEAD_BYTES) - 1)
            request = urllib.request.Request(
                self.url,
                headers={
                    "Range": f"bytes={self.position}-{end}",
                    "User-Agent": "taxi-grahovo-address-generator/1.0",
                },
            )
            with urllib.request.urlopen(request, timeout=180) as response:
                self.cache = response.read()
        start = self.position - self.cache_start
        data = self.cache[start : start + size]
        self.position += len(data)
        return data


def normalized(value: str) -> str:
    return re.sub(r"[^0-9a-zа-я]+", "", value.casefold().replace("ё", "е"))


def existing_coordinates() -> tuple[
    dict[str, tuple[float, float]],
    dict[tuple[str, str], tuple[float, float]],
    list[str],
    dict[str, list[str]],
]:
    """Keep the existing OSM centres and the familiar suggestion ordering."""

    settlements: dict[str, tuple[float, float]] = {}
    streets: dict[tuple[str, str], tuple[float, float]] = {}
    settlement_order: list[str] = []
    street_order: dict[str, list[str]] = defaultdict(list)
    current_settlement: str | None = None
    if not OUTPUT.exists():
        return settlements, streets, settlement_order, street_order
    for line in OUTPUT.read_text(encoding="utf-8").splitlines():
        generated = re.match(
            r'\s*\[("(?:[^"\\]|\\.)*"), ([678]), ([^,]+), ([^,]+), ',
            line,
        )
        if generated:
            label = json.loads(generated.group(1))
            level = int(generated.group(2))
            coordinates = (float(generated.group(3)), float(generated.group(4)))
            parts = label.split(", ")
            if level == 6:
                current_settlement = label.split(" ", 1)[-1]
                settlement_key = normalized(current_settlement)
                settlements[settlement_key] = coordinates
                settlement_order.append(settlement_key)
            elif level == 8 and parts:
                settlement_name = parts[0].split(" ", 1)[-1]
                street_name = parts[-1].split(" ", 1)[-1]
                settlement_key = normalized(settlement_name)
                street_key = normalized(street_name)
                street_order[settlement_key].append(street_key)
                streets[(settlement_key, street_key)] = coordinates
            continue
        settlement = re.match(
            r"\s*\{ name: '([^']+)', kind: '[^']+', latitude: ([^,]+), longitude: ([^,]+), streets: \[",
            line,
        )
        if settlement:
            current_settlement = settlement.group(1)
            key = normalized(current_settlement)
            settlements[key] = (float(settlement.group(2)), float(settlement.group(3)))
            settlement_order.append(key)
            continue
        street = re.match(
            r"\s*\{ name: '([^']+)', kind: '[^']+', houses: '[^']*'(?:, latitude: ([^,]+), longitude: ([^ }]+))?",
            line,
        )
        if street and current_settlement:
            settlement_key = normalized(current_settlement)
            street_key = normalized(street.group(1))
            street_order[settlement_key].append(street_key)
            if street.group(2) and street.group(3):
                streets[(settlement_key, street_key)] = (
                    float(street.group(2)),
                    float(street.group(3)),
                )
    return settlements, streets, settlement_order, street_order


def element_rows(archive: zipfile.ZipFile, prefix: str, tag: str):
    file_name = next(name for name in archive.namelist() if name.startswith(prefix))
    with archive.open(file_name) as source:
        for _, element in ET.iterparse(source, events=("end",)):
            if element.tag.endswith(tag):
                yield dict(element.attrib)
            element.clear()


def ts_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def sort_number(value: str) -> tuple:
    chunks = re.split(r"(\d+)", value.casefold().replace("ё", "е"))
    return tuple(int(chunk) if chunk.isdigit() else chunk for chunk in chunks)


def main() -> None:
    settlement_coordinates, street_coordinates, settlement_order, street_order = existing_coordinates()
    settlement_rank = {key: index for index, key in enumerate(settlement_order)}
    street_rank = {
        settlement: {key: index for index, key in enumerate(keys)}
        for settlement, keys in street_order.items()
    }

    with zipfile.ZipFile(RemoteZipReader(ARCHIVE_URL)) as archive:
        prefix = f"{REGION_CODE}/"
        address_objects: dict[str, dict[str, str]] = {}
        for row in element_rows(archive, prefix + "AS_ADDR_OBJ_", "OBJECT"):
            if row.get("ISACTIVE") == "1" and row.get("ISACTUAL") == "1":
                address_objects[row["OBJECTID"]] = row

        districts = [
            object_id
            for object_id, row in address_objects.items()
            if row.get("LEVEL") == "2" and normalized(row.get("NAME", "")) == "граховский"
        ]
        if len(districts) != 1:
            raise RuntimeError(f"Expected one active Grahovo district, found {districts}")
        district_id = districts[0]

        parents: dict[str, str] = {}
        district_objects = {district_id}
        for row in element_rows(archive, prefix + "AS_ADM_HIERARCHY_", "ITEM"):
            if row.get("ISACTIVE") != "1":
                continue
            if district_id not in row.get("PATH", "").split("."):
                continue
            object_id = row["OBJECTID"]
            district_objects.add(object_id)
            parents[object_id] = row.get("PARENTOBJID", "")

        house_types = {
            row["ID"]: row.get("SHORTNAME", "")
            for row in element_rows(archive, "AS_HOUSE_TYPES_", "HOUSETYPE")
        }
        additional_types = {
            row["ID"]: row.get("SHORTNAME", "")
            for row in element_rows(archive, "AS_ADDHOUSE_TYPES_", "HOUSETYPE")
        }

        def ancestors(object_id: str):
            seen: set[str] = set()
            while object_id and object_id not in seen:
                seen.add(object_id)
                yield object_id
                object_id = parents.get(object_id, "")

        nodes = {
            object_id: row
            for object_id, row in address_objects.items()
            if object_id in district_objects and row.get("LEVEL") in {"6", "7", "8"}
        }
        houses_by_node: dict[str, list[tuple[str, str]]] = defaultdict(list)
        house_count = 0
        unattached_houses: list[str] = []
        for row in element_rows(archive, prefix + "AS_HOUSES_", "HOUSE"):
            if row.get("ISACTIVE") != "1" or row.get("ISACTUAL") != "1":
                continue
            object_id = row.get("OBJECTID", "")
            if object_id not in district_objects:
                continue
            number_parts = [row.get("HOUSENUM", "")]
            if row.get("ADDNUM1"):
                number_parts.extend(
                    [additional_types.get(row.get("ADDTYPE1", ""), ""), row["ADDNUM1"]]
                )
            if row.get("ADDNUM2"):
                number_parts.extend(
                    [additional_types.get(row.get("ADDTYPE2", ""), ""), row["ADDNUM2"]]
                )
            number = " ".join(part for part in number_parts if part).strip()
            parent_node = next((item for item in ancestors(object_id) if item in nodes), None)
            if not parent_node:
                unattached_houses.append(object_id)
                continue
            houses_by_node[parent_node].append(
                (house_types.get(row.get("HOUSETYPE", ""), "объект"), number)
            )
            house_count += 1

        if unattached_houses:
            raise RuntimeError(f"GAR houses without a supported address parent: {unattached_houses}")

        def selected_path(object_id: str) -> list[dict[str, str]]:
            path = [address_objects[item] for item in ancestors(object_id) if item in nodes]
            path.reverse()
            return path

        def nearest_settlement(object_id: str) -> dict[str, str] | None:
            settlement_id = next(
                (
                    item
                    for item in ancestors(object_id)
                    if item in address_objects and address_objects[item].get("LEVEL") == "6"
                ),
                None,
            )
            return address_objects.get(settlement_id) if settlement_id else None

        records = []
        for object_id, row in nodes.items():
            path = selected_path(object_id)
            label = ", ".join(f"{item['TYPENAME']} {item['NAME']}" for item in path)
            settlement = nearest_settlement(object_id)
            settlement_key = normalized(settlement["NAME"]) if settlement else ""
            coordinates = settlement_coordinates.get(settlement_key, DISTRICT_FALLBACK)
            if row.get("LEVEL") == "8" and settlement:
                coordinates = street_coordinates.get(
                    (settlement_key, normalized(row["NAME"])),
                    coordinates,
                )
            encoded_houses = "|".join(
                f"{house_type} {number}".strip()
                for house_type, number in sorted(
                    set(houses_by_node.get(object_id, [])),
                    key=lambda item: (sort_number(item[1]), item[0]),
                )
            )
            records.append(
                {
                    "object_id": object_id,
                    "label": label,
                    "level": int(row["LEVEL"]),
                    "latitude": coordinates[0],
                    "longitude": coordinates[1],
                    "houses": encoded_houses,
                    "settlement_key": settlement_key,
                    "name_key": normalized(row["NAME"]),
                }
            )

        def record_sort(record: dict) -> tuple:
            settlement_key = record["settlement_key"]
            settlement_position = settlement_rank.get(settlement_key, len(settlement_rank))
            if record["level"] == 6:
                child_position = -1
            elif record["level"] == 8:
                child_position = street_rank.get(settlement_key, {}).get(
                    record["name_key"],
                    len(street_rank.get(settlement_key, {})),
                )
            else:
                child_position = 10_000
            return (
                settlement_position,
                settlement_key,
                child_position,
                record["level"],
                record["name_key"],
            )

        records.sort(key=record_sort)

    counts = defaultdict(int)
    for record in records:
        counts[record["level"]] += 1
    if counts != {6: 41, 7: 37, 8: 194} or house_count != 4266:
        raise RuntimeError(
            f"Unexpected GAR snapshot counts: levels={dict(counts)}, houses={house_count}"
        )

    lines = [
        "import type { Address } from '@/domain/models';",
        "",
        "// Generated from the official GAR/FIAS XML full snapshot published 2026-08-04.",
        "// The snapshot data date is 2026-08-03. Coordinates are approximate OSM centres.",
        "type DirectoryNode = readonly [",
        "  label: string,",
        "  level: 6 | 7 | 8,",
        "  latitude: number,",
        "  longitude: number,",
        "  houses: string,",
        "];",
        "",
        "const directory: DirectoryNode[] = [",
    ]
    for record in records:
        lines.append(
            "  ["
            + ", ".join(
                [
                    ts_string(record["label"]),
                    str(record["level"]),
                    repr(record["latitude"]),
                    repr(record["longitude"]),
                    ts_string(record["houses"]),
                ]
            )
            + "],"
        )
    lines.extend(
        [
            "];",
            "",
            "function slug(value: string): string {",
            "  return value.toLocaleLowerCase('ru').replace(/[^\\p{L}\\p{N}]+/gu, '-').replace(/^-|-$/g, '');",
            "}",
            "",
            "function nodeDetails(level: 6 | 7 | 8): string {",
            "  if (level === 6) return 'Граховский район, Удмуртская Республика · населённый пункт из ГАР';",
            "  if (level === 7) return 'Граховский район, Удмуртская Республика · территория из ГАР';",
            "  return 'Граховский район, Удмуртская Республика · улица из ГАР';",
            "}",
            "",
            "export const grahovoDirectoryAddresses: Address[] = directory.flatMap(",
            "  ([label, level, latitude, longitude, encodedHouses]) => {",
            "    const coordinates = { latitude, longitude };",
            "    const parent: Address = {",
            "      id: 'gar:' + slug(label),",
            "      label,",
            "      details: nodeDetails(level),",
            "      coordinates,",
            "    };",
            "    const houses = (encodedHouses ? encodedHouses.split('|') : []).map((encodedHouse) => {",
            "      const separator = encodedHouse.indexOf(' ');",
            "      return {",
            "        encodedHouse,",
            "        objectType: separator >= 0 ? encodedHouse.slice(0, separator) : 'д.',",
            "        houseNumber: separator >= 0 ? encodedHouse.slice(separator + 1) : encodedHouse,",
            "      };",
            "    });",
            "    const numberCounts = new Map<string, number>();",
            "    for (const house of houses) {",
            "      numberCounts.set(house.houseNumber, (numberCounts.get(house.houseNumber) ?? 0) + 1);",
            "    }",
            "    return [",
            "      parent,",
            "      ...houses.map<Address>(({ encodedHouse, objectType, houseNumber }) => {",
            "        const displayedHouse =",
            "          numberCounts.get(houseNumber) === 1 ? houseNumber : `${objectType} ${houseNumber}`;",
            "        return {",
            "          id: 'gar:' + slug(label) + ':' + slug(encodedHouse),",
            "          label: `${label}, ${displayedHouse}`,",
            "          houseNumber,",
            "          details: `Граховский район, Удмуртская Республика · активный адрес из ГАР (${objectType}), точка приблизительная`,",
            "          coordinates,",
            "        };",
            "      }),",
            "    ];",
            "  },",
            ");",
            "",
        ]
    )
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(
        f"Generated {OUTPUT}: {counts[6]} settlements, {counts[7]} planning objects, "
        f"{counts[8]} streets, {house_count} active addressable objects."
    )


if __name__ == "__main__":
    main()
