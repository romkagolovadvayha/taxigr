import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { grahovoDirectoryAddresses } from '../src/data/grahovo-address-directory';
import { importOsmHouses, type OsmElement } from './lib/osm-house-import';

async function main() {
const input = process.argv[2];
const query = '[out:json][timeout:120];area(3600956094)->.district;(nwr(area.district)["addr:housenumber"];nwr(area.district)["place"~"^(village|hamlet|town|city|isolated_dwelling)$"];);out body geom;';
const payload = input ? JSON.parse(await readFile(resolve(input), 'utf8')) : await (async () => {
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: new URLSearchParams({ data: query }),
    headers: { 'User-Agent': 'TaxiGrahovo-address-import/1.0' }, signal: AbortSignal.timeout(150_000),
  });
  if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
  return response.json();
})();
if (payload.remark || !Array.isArray(payload.elements) || !payload.osm3s?.timestamp_osm_base) {
  throw new Error('Incomplete Overpass response; the existing snapshot was not changed.');
}
const { points, rejected } = importOsmHouses(payload.elements as OsmElement[], grahovoDirectoryAddresses);
if (!points.length) throw new Error('No verified house points; refusing to replace the snapshot.');
const snapshot = { version: 1, districtOsmRelation: 956094, dataDate: payload.osm3s.timestamp_osm_base,
  source: 'OpenStreetMap contributors', license: 'ODbL-1.0', sourceUrl: 'https://www.openstreetmap.org/copyright', points };
await writeFile('src/data/grahovo-house-points.json', JSON.stringify(snapshot, null, 2) + '\n');
await mkdir('tmp', { recursive: true });
const linked = new Set(points.flatMap(p => p.garId ? [p.garId] : []));
const missing = grahovoDirectoryAddresses.filter(a => a.houseNumber && !linked.has(a.id));
const bySettlement = Object.fromEntries([...new Set(points.map(p => p.label.split(',')[0]!))].map(name =>
  [name, points.filter(p => p.label.startsWith(name + ',')).length]));
const report = { dataDate: snapshot.dataDate, sourceObjects: payload.elements.filter((e: OsmElement) => e.tags?.['addr:housenumber']).length,
  imported: points.length, linkedToGar: linked.size, extraAddresses: points.length - linked.size, bySettlement,
  rejected, missing: missing.map(a => ({ id: a.id, label: a.label })) };
await writeFile('tmp/grahovo-house-import-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, rejected: rejected.length, missing: missing.length }, null, 2));
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
