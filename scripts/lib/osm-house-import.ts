import type { Address, Coordinates } from '../../src/domain/models';

export type OsmElement = {
  type: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number;
  tags?: Record<string, string>; geometry?: { lat: number; lon: number }[];
  members?: { role?: string; geometry?: { lat: number; lon: number }[] }[];
};
export type HousePoint = {
  id: string; garId?: string; label: string; houseNumber: string;
  coordinates: Coordinates; sourceUrl: string;
};

export function normalizedName(value: string): string {
  return value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function normalizedStreet(value: string): string {
  const tokens = normalizedName(value).split(' ');
  const lane = tokens.some(token => ['пер', 'переулок'].includes(token));
  return (lane ? 'пер ' : 'ул ') + tokens.filter(token => !['ул', 'улица', 'пер', 'переулок'].includes(token)).join(' ');
}

function localityName(value: string): string {
  return normalizedName(value).replace(/^(?:с|село|д|деревня|п|поселок) /u, '');
}

export function insideRing(point: Coordinates, ring: { lat: number; lon: number }[]): boolean {
  if (ring.length < 4 || ring[0]!.lat !== ring[ring.length - 1]!.lat || ring[0]!.lon !== ring[ring.length - 1]!.lon) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a.lat > point.latitude) !== (b.lat > point.latitude) &&
        point.longitude < (b.lon - a.lon) * (point.latitude - a.lat) / (b.lat - a.lat) + a.lon) inside = !inside;
  }
  return inside;
}

function pointOf(element: OsmElement): Coordinates | null {
  if (element.type === 'node' && Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
    return { latitude: element.lat!, longitude: element.lon! };
  }
  const ring = element.geometry;
  if (!ring || ring.length < 4 || ring[0]!.lat !== ring[ring.length - 1]!.lat || ring[0]!.lon !== ring[ring.length - 1]!.lon) return null;
  const vertices = ring.slice(0, -1);
  const center = { latitude: vertices.reduce((sum, p) => sum + p.lat, 0) / vertices.length,
    longitude: vertices.reduce((sum, p) => sum + p.lon, 0) / vertices.length };
  // An average can lie outside a concave building. A boundary vertex remains an
  // observed point of that building; never substitute a settlement centre.
  return insideRing(center, ring) ? center : { latitude: ring[0]!.lat, longitude: ring[0]!.lon };
}

export function importOsmHouses(elements: OsmElement[], directory: Address[]) {
  const settlements = directory.filter(a => a.kind === 'settlement');
  const settlementByName = new Map(settlements.map(a => [localityName(a.label), a]));
  const polygons = elements.filter(e => e.tags?.place && e.tags.name && e.type !== 'node');
  const houseIndex = new Map<string, Address[]>();
  for (const a of directory.filter(a => a.houseNumber)) {
    const parts = a.label.split(',');
    if (parts.length !== 3) continue;
    const key = `${localityName(parts[0]!)}|${normalizedStreet(parts[1]!)}|${normalizedName(a.houseNumber!)}`;
    houseIndex.set(key, [...(houseIndex.get(key) ?? []), a]);
  }
  const rejected: { id: string; reason: string }[] = [];
  const candidates = new Map<string, HousePoint[]>();
  for (const e of elements.filter(e => e.tags?.['addr:housenumber'])) {
    const id = `osm-house:${e.type}:${e.id}`;
    const point = pointOf(e);
    const street = e.tags!['addr:street'];
    const number = e.tags!['addr:housenumber']!.trim();
    if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || !street ||
        e.tags!['demolished:building'] || e.tags!['razed:building'] || e.tags!.building === 'ruins' ||
        !/^\d+[\p{L}]?(?:[/-]\d+[\p{L}]?)?$/u.test(number) ||
        point.latitude < 55.88 || point.latitude > 56.26 || point.longitude < 51.53 || point.longitude > 52.27) {
      rejected.push({ id, reason: 'Missing or ambiguous house number, street or geometry' }); continue;
    }
    const containing = new Set(polygons.filter(p => {
      if (p.geometry) return insideRing(point, p.geometry);
      const outer = p.members?.filter(m => m.role === 'outer' && m.geometry) ?? [];
      const inner = p.members?.filter(m => m.role === 'inner' && m.geometry) ?? [];
      return outer.some(m => insideRing(point, m.geometry!)) && !inner.some(m => insideRing(point, m.geometry!));
    }).map(p => localityName(p.tags!.name!)));
    const explicit = e.tags!['addr:city'] ?? e.tags!['addr:place'];
    const settlementKey = explicit ? localityName(explicit) : containing.size === 1 ? [...containing][0]! : '';
    const settlement = settlementByName.get(settlementKey);
    if (!settlement || (explicit && containing.size && !containing.has(settlementKey))) {
      rejected.push({ id, reason: 'No unambiguous settlement match' }); continue;
    }
    const key = `${settlementKey}|${normalizedStreet(street)}|${normalizedName(number)}`;
    const matches = houseIndex.get(key) ?? [];
    if (matches.length > 1) { rejected.push({ id, reason: 'Multiple GAR objects at the same address' }); continue; }
    const gar = matches[0];
    const result: HousePoint = { id, ...(gar ? { garId: gar.id } : {}),
      label: gar?.label ?? `${settlement.label}, ${street}, ${number}`, houseNumber: gar?.houseNumber ?? number,
      coordinates: { latitude: Number(point.latitude.toFixed(7)), longitude: Number(point.longitude.toFixed(7)) },
      sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}` };
    candidates.set(key, [...(candidates.get(key) ?? []), result]);
  }
  const points: HousePoint[] = [];
  for (const group of candidates.values()) {
    const first = group[0]!;
    // Nearby shop/entrance/building duplicates are one address; distant conflicting
    // points need review, not a guessed winner.
    if (group.some(p => Math.hypot((p.coordinates.latitude - first.coordinates.latitude) * 111_000,
      (p.coordinates.longitude - first.coordinates.longitude) * 62_000) > 80)) {
      group.forEach(p => rejected.push({ id: p.id, reason: 'Conflicting points for the same address' })); continue;
    }
    points.push(group.find(p => p.id.startsWith('osm-house:way:')) ?? first);
  }
  return { points: points.sort((a, b) => a.label.localeCompare(b.label, 'ru', { numeric: true })), rejected };
}
