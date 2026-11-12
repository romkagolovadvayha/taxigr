import { mkdir, writeFile } from 'node:fs/promises';

// Public OSM data only. No user locations, accounts or credentials are sent.
const query = `[out:json][timeout:180];area(3600956094)->.district;(
way(area.district)["highway"];
way(area.district)["building"];
way(area.district)["waterway"];
way(area.district)["natural"="water"];
way(area.district)["landuse"~"^(forest|grass|meadow|residential)$"];
node(area.district)["place"~"^(village|hamlet|town|city|isolated_dwelling)$"];
);out body geom;`;
const response = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST', body: new URLSearchParams({ data: query }),
  headers: { 'User-Agent': 'TaxiGrahovo-offline-district/1.0' }, signal: AbortSignal.timeout(210_000),
});
if (!response.ok) throw new Error(`OSM download failed: HTTP ${response.status}`);
const data = await response.json();
if (data.remark || !data.osm3s?.timestamp_osm_base || !data.elements?.length) throw new Error('Incomplete OSM snapshot');
await mkdir('tmp/offline-district', { recursive: true });
await writeFile('tmp/offline-district/osm-source.json', JSON.stringify(data));
console.log(JSON.stringify({ date: data.osm3s.timestamp_osm_base, objects: data.elements.length,
  bytes: Buffer.byteLength(JSON.stringify(data)), query }));
