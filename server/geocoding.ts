import type { RowDataPacket } from 'mysql2/promise';

import { buildStreetSuggestions } from '../src/domain/address-suggestions';
import { config } from './config';
import { db } from './db';

export type GeocodedAddress = {
  id: string;
  label: string;
  details?: string;
  houseNumber?: string;
  coordinates: { latitude: number; longitude: number };
};

type MemoryEntry = {
  expiresAt: number;
  value: GeocodedAddress[];
};

const localAddresses: GeocodedAddress[] = [
  {
    id: 'grahovo-center',
    label: 'с. Грахово, ул. Ачинцева, 5',
    houseNumber: '5',
    details: 'МФЦ Граховского района',
    coordinates: { latitude: 56.0477, longitude: 51.9586 },
  },
  {
    id: 'grahovo-church',
    label: 'с. Грахово, ул. Колпакова, 1Б',
    houseNumber: '1Б',
    details: 'Христорождественская церковь',
    coordinates: { latitude: 56.04576, longitude: 51.96165 },
  },
  {
    id: 'grahovo-50-let-pobedy-19',
    label: 'ул. 50 лет Победы, 19',
    houseNumber: '19',
    details: 'с. Грахово, Граховский район, Удмуртская Республика · точка дома',
    coordinates: { latitude: 56.055332, longitude: 51.960263 },
  },
  {
    id: 'blagodatnoe',
    label: 'д. Благодатное, ул. Благодатновская, 53А',
    details: 'Граховский район, Удмуртская Республика · точка дома',
    houseNumber: '53А',
    coordinates: { latitude: 55.9995786, longitude: 51.8684492 },
  },
  {
    id: 'mozhga-station',
    label: 'г. Можга, Привокзальная ул., 6',
    details: 'Железнодорожный вокзал, Удмуртская Республика · точка дома',
    houseNumber: '6',
    coordinates: { latitude: 56.445658, longitude: 52.1972249 },
  },
];

const memoryCache = new Map<string, MemoryEntry>();
let geocoderQueue: Promise<void> = Promise.resolve();
let lastExternalRequestAt = 0;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('ru').replace(/\s+/g, ' ');
}

function normalizeForSearch(value: string): string {
  return normalize(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function grahovoPriority(address: GeocodedAddress): number {
  const haystack = normalizeForSearch(`${address.label} ${address.details ?? ''}`);
  if (haystack.includes('граховский район') || haystack.includes('граховский муниципальный округ')) {
    return 3;
  }
  if (haystack.includes('граховск')) return 2;
  if (haystack.includes('грахово')) return 1;
  return 0;
}

export function prioritizeGrahovoDistrict(addresses: GeocodedAddress[]): GeocodedAddress[] {
  return addresses
    .map((address, index) => ({ address, index, priority: grahovoPriority(address) }))
    .sort((left, right) => right.priority - left.priority || left.index - right.index)
    .map(({ address }) => address);
}

function trailingHouseNumber(value: string): { houseNumber: string; streetPart: string } | null {
  const normalized = value.trim().replace(/\s+/g, ' ');
  const match = normalized.match(
    /(?:^|[,\s])(?:д(?:ом)?\.?\s*)?(\d+[а-яa-z]?(?:[/-]\d+[а-яa-z]?)?)\s*$/iu,
  );
  if (!match?.[1] || match.index == null) return null;
  return {
    houseNumber: match[1],
    streetPart: normalized.slice(0, match.index).replace(/[,\s]+$/g, ''),
  };
}

function containsHouseNumber(address: GeocodedAddress, houseNumber: string): boolean {
  const tokens = `${address.label} ${address.details ?? ''}`.match(
    /\d+[а-яa-z]?(?:[/-]\d+[а-яa-z]?)?/giu,
  );
  return tokens?.some((token) => normalize(token) === normalize(houseNumber)) ?? false;
}

export function filterExactHouseResults(
  query: string,
  addresses: GeocodedAddress[],
): GeocodedAddress[] {
  const parsed = trailingHouseNumber(query);
  if (!parsed) return addresses;

  const ignoredStreetTokens = new Set([
    'с',
    'село',
    'д',
    'деревня',
    'ул',
    'улица',
    'грахово',
    'граховский',
    'район',
    'удмуртия',
    'удмуртская',
    'республика',
    'россия',
  ]);
  const streetTokens = normalizeForSearch(parsed.streetPart)
    .split(' ')
    .filter((token) => token.length > 1 && !ignoredStreetTokens.has(token));

  return addresses.filter((address) => {
    if (!containsHouseNumber(address, parsed.houseNumber)) return false;
    const haystack = normalizeForSearch(`${address.label} ${address.details ?? ''}`);
    return streetTokens.every((token) => haystack.includes(token));
  });
}

function localMatches(query: string): GeocodedAddress[] {
  const normalized = normalizeForSearch(query);
  const houses = localAddresses.filter((address) =>
    normalizeForSearch(`${address.label} ${address.details ?? ''}`).includes(normalized),
  );
  const parsed = trailingHouseNumber(query);
  const exactHouses = parsed?.streetPart ? filterExactHouseResults(query, houses) : houses;
  if (parsed?.streetPart) return exactHouses;

  const streets = buildStreetSuggestions(localAddresses).filter((address) =>
    normalizeForSearch(`${address.label} ${address.details ?? ''}`).includes(normalized),
  );
  return deduplicateAddresses([...streets, ...exactHouses]);
}

function coordinateQuery(value: string): { latitude: number; longitude: number } | null {
  const match = value.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

export function buildNominatimQueries(query: string): string[] {
  const normalized = normalize(query);
  if (
    coordinateQuery(query) ||
    normalized.includes('грахово') ||
    normalized.includes('граховский район')
  ) {
    return [query];
  }
  const parsed = trailingHouseNumber(query);
  if (parsed?.streetPart) {
    return [
      `${parsed.houseNumber}, ${parsed.streetPart}, Грахово, Удмуртская Республика`,
      query,
    ];
  }
  return [`${query}, Грахово, Удмуртская Республика`, query];
}

async function readPersistentCache(key: string): Promise<GeocodedAddress[] | null> {
  try {
    const [rows] = await db.query<(RowDataPacket & { response_json: string })[]>(
      `SELECT response_json FROM geocoding_cache
       WHERE cache_key = ? AND expires_at > UTC_TIMESTAMP(3) LIMIT 1`,
      [key],
    );
    if (!rows[0]) return null;
    return JSON.parse(rows[0].response_json) as GeocodedAddress[];
  } catch {
    return null;
  }
}

async function writePersistentCache(key: string, value: GeocodedAddress[]): Promise<void> {
  try {
    await db.execute(
      `INSERT INTO geocoding_cache (cache_key, response_json, expires_at)
       VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? DAY))
       ON DUPLICATE KEY UPDATE response_json = VALUES(response_json),
         expires_at = VALUES(expires_at), updated_at = UTC_TIMESTAMP(3)`,
      [key, JSON.stringify(value), config.GEOCODER_CACHE_TTL_DAYS],
    );
  } catch {
    // The in-memory cache still protects the upstream service during database maintenance.
  }
}

async function limitedFetch(url: string): Promise<Response> {
  const task = geocoderQueue.then(async () => {
    const waitMs = Math.max(0, 1_050 - (Date.now() - lastExternalRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastExternalRequestAt = Date.now();
    return fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'ru',
        Referer: config.PUBLIC_URL,
        'User-Agent': 'TaxiGrahovo/1.0',
      },
      signal: AbortSignal.timeout(8_000),
    });
  });
  geocoderQueue = task.then(() => undefined, () => undefined);
  return task;
}

function fromNominatim(item: {
  place_id?: number | string;
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    village?: string;
    town?: string;
    city?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}): GeocodedAddress | null {
  const latitude = Number(item.lat);
  const longitude = Number(item.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const display = item.display_name?.trim() || item.name?.trim();
  if (!display) return null;
  const [displayLabel, ...displayDetails] = display.split(',').map((part) => part.trim());
  const road = item.address?.road ?? item.address?.pedestrian;
  const houseNumber = item.address?.house_number;
  const label = road && houseNumber ? `${road}, ${houseNumber}` : item.name?.trim() || displayLabel;
  const structuredDetails = [
    item.address?.village ?? item.address?.town ?? item.address?.city,
    item.address?.municipality,
    item.address?.county,
    item.address?.state,
    item.address?.country,
  ].filter((part, index, items): part is string => !!part && items.indexOf(part) === index);
  return {
    id: `osm-${item.place_id ?? `${longitude}-${latitude}`}`,
    label: label || display,
    details: structuredDetails.join(', ') || displayDetails.join(', ') || item.type,
    houseNumber,
    coordinates: { latitude, longitude },
  };
}

async function requestNominatimOnce(query: string): Promise<GeocodedAddress[]> {
  const baseUrl = config.NOMINATIM_BASE_URL.replace(/\/$/, '');
  const coordinates = coordinateQuery(query);
  const params = new URLSearchParams({
    format: 'jsonv2',
    'accept-language': 'ru',
  });
  let endpoint: string;
  if (coordinates) {
    endpoint = 'reverse';
    params.set('lat', String(coordinates.latitude));
    params.set('lon', String(coordinates.longitude));
    params.set('zoom', '18');
  } else {
    endpoint = 'search';
    params.set('q', query);
    params.set('countrycodes', 'ru');
    params.set('limit', '8');
    params.set('addressdetails', '1');
    params.set('viewbox', '50.3,57.1,53.8,55.2');
    params.set('bounded', '0');
  }
  const response = await limitedFetch(`${baseUrl}/${endpoint}?${params}`);
  if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
  const payload = (await response.json()) as unknown;
  const items = Array.isArray(payload) ? payload : [payload];
  return items
    .map((item) => fromNominatim(item as Parameters<typeof fromNominatim>[0]))
    .filter((item): item is GeocodedAddress => item != null);
}

function deduplicateAddresses(addresses: GeocodedAddress[]): GeocodedAddress[] {
  const seen = new Set<string>();
  return addresses.filter((address) => {
    const key = normalize(`${address.label} ${address.details ?? ''}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function requestNominatim(query: string): Promise<GeocodedAddress[]> {
  const combined: GeocodedAddress[] = [];
  let successfulRequests = 0;
  for (const candidate of buildNominatimQueries(query)) {
    try {
      combined.push(...(await requestNominatimOnce(candidate)));
      successfulRequests += 1;
    } catch {
      // A fallback query can still provide useful results when one upstream request fails.
    }
  }
  if (!successfulRequests) throw new Error('Nominatim search failed');
  const preciseResults = filterExactHouseResults(query, deduplicateAddresses(combined));
  return prioritizeGrahovoDistrict(preciseResults);
}

export async function searchAddresses(query: string): Promise<GeocodedAddress[]> {
  const local = localMatches(query);
  if (local.length) return prioritizeGrahovoDistrict(local);

  const key = `v7:${normalize(query)}`;
  const memory = memoryCache.get(key);
  if (memory && memory.expiresAt > Date.now()) return prioritizeGrahovoDistrict(memory.value);
  if (memory) memoryCache.delete(key);

  const persisted = await readPersistentCache(key);
  if (persisted) {
    memoryCache.set(key, {
      value: persisted,
      expiresAt: Date.now() + config.GEOCODER_CACHE_TTL_DAYS * 86_400_000,
    });
    return prioritizeGrahovoDistrict(persisted);
  }

  const results = await requestNominatim(query);
  memoryCache.set(key, {
    value: results,
    expiresAt: Date.now() + config.GEOCODER_CACHE_TTL_DAYS * 86_400_000,
  });
  await writePersistentCache(key, results);
  return prioritizeGrahovoDistrict(results);
}
