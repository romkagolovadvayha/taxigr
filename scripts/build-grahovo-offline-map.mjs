import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const source = JSON.parse(await readFile('tmp/offline-district/osm-source.json', 'utf8'));
if (source.remark || !source.osm3s?.timestamp_osm_base) throw new Error('Incomplete OSM source');
const features = [], nodes = [], edges = [], indices = new Map();
const round = n => Math.round(n * 1e6) / 1e6;
const traversable = new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link',
  'tertiary','tertiary_link','unclassified','residential','living_street','service']);
const speeds = { motorway:90, trunk:80, primary:70, secondary:60, tertiary:50, unclassified:40, residential:30, living_street:15, service:15 };
function nodeIndex(id, point) {
  if (!indices.has(id)) { indices.set(id,nodes.length); nodes.push([round(point.lon),round(point.lat)]); }
  return indices.get(id);
}
for (const element of source.elements) {
  const t = element.tags ?? {};
  const name = t['name:ru'] ?? t.name;
  if (element.type === 'node' && t.place) {
    features.push({ type:'Feature', properties:{kind:'place',name}, geometry:{type:'Point',coordinates:[round(element.lon),round(element.lat)]} });
    continue;
  }
  const points = element.geometry;
  if (!points || points.length < 2 || points.some(p => !Number.isFinite(p.lon) || !Number.isFinite(p.lat))) continue;
  const coordinates = points.map(p => [round(p.lon),round(p.lat)]);
  const closed = coordinates.length >= 4 && element.nodes?.[0] === element.nodes?.at(-1);
  const kind = t.highway ? 'road' : t.building ? 'building' : t.waterway ? 'waterway' : t.natural === 'water' ? 'water' : 'land';
  const properties = { kind, ...(name ? {name} : {}), ...(t.highway ? {class:t.highway} : {}),
    ...(t['addr:housenumber'] ? {housenumber:t['addr:housenumber']} : {}), ...(t.landuse ? {class:t.landuse} : {}) };
  if (['building','water','land'].includes(kind) && !closed) continue;
  features.push({type:'Feature',id:`osm-${element.id}`,properties,geometry:closed && kind !== 'road' && kind !== 'waterway'
    ? {type:'Polygon',coordinates:[coordinates]} : {type:'LineString',coordinates} });
  if (!traversable.has(t.highway) || ['no','private'].includes(t.motor_vehicle ?? t.vehicle ?? t.access) || !element.nodes) continue;
  let direction = t.oneway === '-1' ? -1 : ['yes','1','true'].includes(t.oneway) || (t.junction === 'roundabout' && t.oneway !== 'no') ? 1 : 0;
  const speed = Math.min(90, Math.max(10, Number.parseFloat(t.maxspeed) || speeds[t.highway] || 30));
  for (let i=1;i<points.length;i++) {
    const a = nodeIndex(element.nodes[i-1],points[i-1]), b = nodeIndex(element.nodes[i],points[i]);
    if (a !== b) edges.push([a,b,direction,speed]);
  }
}
const map = {type:'FeatureCollection',features};
const content = JSON.stringify({map, graph:{nodes,edges}});
const hash = createHash('sha256').update(content).digest('hex').slice(0,16);
const metadata = { version:1, revision:hash, dataDate:source.osm3s.timestamp_osm_base, districtOsmRelation:956094,
  source:'OpenStreetMap contributors', sourceUrl:'https://www.openstreetmap.org/copyright', license:'ODbL-1.0',
  features:features.length, nodes:nodes.length, edges:edges.length, uncompressedBytes:Buffer.byteLength(content),
  // The district snapshot is finite; never claim coverage of all Russia.
  bounds:[51.4,55.7,52.5,56.4] };
await writeFile('src/data/grahovo-offline-district.json', JSON.stringify({...metadata,gzipBase64:gzipSync(content,{level:9}).toString('base64')})+'\n');
const ranges = new Set([0,1024]);
for (const feature of features) for (const c of feature.properties.name ?? '') ranges.add(Math.floor(c.codePointAt(0)/256)*256);
const fonts = {};
for (const start of [...ranges].sort((a,b)=>a-b)) {
  const range = `${start}-${start+255}`;
  const response = await fetch(`https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/${range}.pbf`, {signal:AbortSignal.timeout(20_000)});
  if (!response.ok) throw new Error(`Font ${range}: HTTP ${response.status}`);
  fonts[range] = Buffer.from(await response.arrayBuffer()).toString('base64');
}
await writeFile('src/data/grahovo-offline-glyphs.json', JSON.stringify({revision:hash,font:'Noto Sans Regular',ranges:fonts})+'\n');
await mkdir('assets/offline-map',{recursive:true});
await writeFile('assets/offline-map/manifest.json',JSON.stringify({...metadata,glyphRanges:Object.keys(fonts)},null,2)+'\n');
console.log(JSON.stringify({...metadata,packedBytes:(await readFile('src/data/grahovo-offline-district.json')).length,glyphRanges:Object.keys(fonts)}));
