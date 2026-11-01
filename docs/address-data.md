# Address data

The Grahovo street/house catalogue uses GAR/FIAS and mapped OpenStreetMap house
points. Existing verified locality centres and saved house points take priority.

The offline nationwide locality catalogue (`src/data/russia-settlements.json`)
is derived from [GeoNames](https://www.geonames.org/), licensed under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
Source files are published at <https://download.geonames.org/export/dump/>.

The import keeps Russia (`RU`) populated places from `cities500.zip`: places
with a population above 500 or administrative seats down to PPLA4. City
districts, abandoned and historical places are excluded. Preferred current
Russian names and region names come from `alternatenames/RU.zip`; source
spellings are retained when no Russian name is available. This is a locality
index, not a complete street/house database or an administrative register of
city status. Submitted searches outside this index retain the geocoder fallback.

Regenerate with `python scripts/import-intercity-settlements.py <directory>`.
The directory must contain `cities500.zip`, `admin1CodesASCII.txt` and
`RU-alternates.zip` (the downloaded `alternatenames/RU.zip`). The snapshot records
input SHA-256 hashes and retrieval date. Names, coordinates and population are
filtered, reordered and stored as compact tuples. Runtime code preserves
previously verified IDs/centres and omits duplicate district localities.
