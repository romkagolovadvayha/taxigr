"""Build the offline Russia locality index from GeoNames (CC BY 4.0).

Usage: python scripts/import-intercity-settlements.py <download-directory>
Download cities500.zip, admin1CodesASCII.txt and alternatenames/RU.zip from
https://download.geonames.org/export/dump/ (save the latter as RU-alternates.zip).
"""
import hashlib
import json
import sys
import zipfile
from datetime import date
from pathlib import Path

source = Path(sys.argv[1])
names = {}
with zipfile.ZipFile(source / 'RU-alternates.zip') as archive:
    for line in archive.read('RU.txt').decode('utf-8').splitlines():
        row = line.split('\t')
        if row[2] == 'ru' and row[7] != '1' and row[6] != '1':
            if row[1] not in names or row[4] == '1':
                names[row[1]] = row[3]

regions = {}
for line in (source / 'admin1CodesASCII.txt').read_text(encoding='utf-8').splitlines():
    code, name, _, identifier = line.split('\t')
    if code.startswith('RU.'):
        regions[code[3:]] = names.get(identifier, name)

places = []
with zipfile.ZipFile(source / 'cities500.zip') as archive:
    for line in archive.read('cities500.txt').decode('utf-8').splitlines():
        row = line.split('\t')
        if row[8] != 'RU' or row[7] not in {'PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLC'}:
            continue
        name = names.get(row[0])
        if not name:
            name = next((value for value in row[3].split(',') if value and all(
                'А' <= c <= 'я' or c in 'Ёё -0123456789' for c in value)), None)
        if not name:
            name = row[1]  # Preserve the source spelling when no Russian name is supplied.
        places.append([int(row[0]), name, regions[row[10]], float(row[4]), float(row[5]), int(row[14])])
places.sort(key=lambda row: (-row[5], row[0]))
assert len({row[0] for row in places}) == len(places) > 5000
assert any(row[0] == 499099 and row[1] == 'Самара' for row in places)
snapshot = {
    'source': 'https://download.geonames.org/export/dump/',
    'license': 'CC BY 4.0 — GeoNames',
    'retrievedOn': str(date.today()),
    'coverage': 'RU populated places in cities500: population > 500 or administrative seats; excludes city districts, abandoned and historical places',
    'sha256': {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in ['cities500.zip', 'RU-alternates.zip', 'admin1CodesASCII.txt']},
    'fields': ['geonameId', 'name', 'region', 'latitude', 'longitude', 'population'],
    'places': places,
}
target = Path(__file__).resolve().parents[1] / 'src/data/russia-settlements.json'
target.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'{len(places)} localities, {target.stat().st_size} bytes')
