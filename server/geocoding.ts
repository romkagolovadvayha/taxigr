import type { RowDataPacket } from 'mysql2/promise';

import { getAddressDirectory } from './address-directory';
import { getRememberedAddresses } from './remembered-addresses';
import { overlayRememberedAddresses } from '../src/domain/remembered-address';
import { hasApproximateCoordinates, normalizeHouseNumber, parseQueryHouse } from '../src/domain/address-precision';
import { addressSearchScore, createAddressSearchScorer } from '../src/domain/address-search';
import { buildStreetSuggestions } from '../src/domain/address-suggestions';
import { normalizeBotAddress, addressQueryVariants, hasZarechnyAlias } from '../src/domain/free-text-address';
import { intercitySettlements } from '../src/data/intercity-settlements';
import { searchIntercitySettlements } from '../src/domain/intercity-search';
import { isGrahovoDistrictAddress } from '../src/domain/pricing';
import type { AddressKind } from '../src/domain/models';
import { config } from './config';
import { db } from './db';
import { createGeocoderQueue, withGeocoderDeadline } from './geocoder-queue';

export type GeocodedAddress = {
  id: string;
  label: string;
  details?: string;
  houseNumber?: string;
  kind?: AddressKind;
  coordinatePrecision?: 'approximate' | 'precise';
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
];

const memoryCache = new Map<string, MemoryEntry>();
const queuedGeocoderRequest = createGeocoderQueue();
const externalSearches = new Map<string, Promise<GeocodedAddress[]>>();

// Address routes prepend up to 12 local places and return 30 items. Nine district
// addresses leave room for one full scoped Nominatim page plus an outside locality.
const LOCAL_RESULTS_BEFORE_EXTERNAL = 9;
const LOCAL_ENTITY_PREFIXES = new Set([
  'г',
  'город',
  'д',
  'деревня',
  'п',
  'поселок',
  'посёлок',
  'с',
  'село',
  'тер',
  'территория',
  'ул',
  'улица',
  'пер',
  'переулок',
]);
const NOMINATIM_SETTLEMENT_TYPES = new Set([
  'city',
  'town',
  'village',
  'hamlet',
  'isolated_dwelling',
]);

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function normalizeForSearch(value: string): string {
  return normalize(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizeNamedPlace(value: string): string {
  return normalizeForSearch(value).replace(
    /^(?:г|город|д|деревня|п|поселок|посёлок|пгт|с|село)\s+/u,
    '',
  );
}

function entityTokens(value: string): string[] {
  return normalizeForSearch(value)
    .split(' ')
    .filter((token) => token.length > 1 && !LOCAL_ENTITY_PREFIXES.has(token));
}

function tokensStartWith(candidate: string[], query: string[]): boolean {
  return (
    query.length > 0 &&
    candidate.length >= query.length &&
    query.every((token, index) => candidate[index]?.startsWith(token))
  );
}

function hasStrongLocalMatch(query: string, addresses: GeocodedAddress[]): boolean {
  if (queryHouse(query)) return addresses.length > 0;

  const queryTokens = entityTokens(query);
  return addresses.some((address) => {
    if (address.houseNumber) return false;
    const lastLabelPart = address.label.split(',').at(-1) ?? address.label;
    if (tokensStartWith(entityTokens(lastLabelPart), queryTokens)) return true;
    return queryTokens.length > 1 && tokensStartWith(entityTokens(address.label), queryTokens);
  });
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

function queryHouse(value: string): { houseNumber: string; streetPart: string } | null {
  const normalized = value.trim().replace(/\s+/g, ' ');
  const house = parseQueryHouse(normalized);
  if (house) return house;
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
  if (address.houseNumber) {
    return normalizeHouseNumber(address.houseNumber) === normalizeHouseNumber(houseNumber);
  }
  const tokens = `${address.label} ${address.details ?? ''}`.match(
    /\d+[а-яa-z]?(?:[/-]\d+[а-яa-z]?)?/giu,
  );
  return tokens?.some((token) => normalize(token) === normalize(houseNumber)) ?? false;
}

export function filterExactHouseResults(
  query: string,
  addresses: GeocodedAddress[],
): GeocodedAddress[] {
  const parsed = queryHouse(query);
  if (!parsed) return addresses;


  return addresses.filter((address) => {
    if (address.kind === 'settlement' && !isGrahovoDistrictAddress(address)) return true;
    if (!containsHouseNumber(address, parsed.houseNumber)) return false;
    return addressSearchScore(address, query) > 0;
  });
}

function localMatches(query: string, directory: GeocodedAddress[]): GeocodedAddress[] {
  const score = createAddressSearchScorer(query);
  const normalized = normalizeForSearch(query);
  const queryTokens = normalized
    .split(' ')
    .filter(
      (token) =>
        token.length > 1 &&
        !['ул', 'улица', 'пер', 'переулок', 'дом', 'деревня', 'село', 'район'].includes(token),
    );
  const numericOnly = /^\d+$/u.test(normalized);
  const matches = (address: GeocodedAddress) => {
    if (!queryTokens.length) return normalizeForSearch(`${address.label} ${address.details ?? ''}`).includes(normalized) ? 1 : 0;
    if (numericOnly && address.houseNumber) {
      const streetLabel = normalizeForSearch(
        address.label.replace(new RegExp(`(?:,\\s*|\\s+)${address.houseNumber}\\s*$`, 'iu'), ''),
      );
      return streetLabel.includes(normalized) ? score(address) : 0;
    }
    return score(address);
  };
  const ranked = directory.map(address => ({ address, score: matches(address) }))
    .filter(item => item.score > 0).sort((left, right) => right.score - left.score);
  const houses = ranked.filter(item => item.address.houseNumber).map(item => item.address);
  const parsed = queryHouse(query);
  const exactHouses = parsed?.streetPart ? filterExactHouseResults(query, houses) : houses;
  if (parsed?.streetPart) {
    const seenLabels = new Set<string>();
    return exactHouses.filter((address) => {
      const key = normalizeForSearch(address.label);
      if (seenLabels.has(key)) return false;
      seenLabels.add(key);
      return true;
    });
  }

  const directSuggestions = ranked.filter(item => !item.address.houseNumber).map(item => item.address);
  const streets = buildStreetSuggestions(directory).map(address => ({ address, score: matches(address) }))
    .filter(item => item.score > 0).sort((left, right) => right.score - left.score).map(item => item.address);
  const seenLabels = new Set<string>();
  return [...directSuggestions, ...streets, ...exactHouses]
    .filter((address) => {
      const key = normalizeForSearch(address.label);
      if (seenLabels.has(key)) return false;
      seenLabels.add(key);
      return true;
    })
    .slice(0, 120);
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
  const parsed = queryHouse(query);
  if (parsed?.streetPart) {
    return [
      `${parsed.houseNumber}, ${parsed.streetPart}, Граховский район, Удмуртская Республика`,
      query,
    ];
  }
  return [`${query}, Граховский район, Удмуртская Республика`, query];
}

export function streetGeocoderQuery(query: string): string {
  return query
    .replace(/(^|[\s,])(?:с|д|п|г)\.\s*/giu, '$1')
    .replace(/(^|[\s,])ул\.\s*/giu, '$1улица ')
    .replace(/(^|[\s,])пер\.\s*/giu, '$1переулок ')
    .trim();
}

async function readPersistentCache(key: string, expiredDays = 0): Promise<GeocodedAddress[] | null> {
  try {
    const [rows] = await db.query<(RowDataPacket & { response_json: string })[]>(
      `SELECT response_json FROM geocoding_cache
       WHERE cache_key = ? AND expires_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? DAY) LIMIT 1`,
      [key, expiredDays],
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

function fromNominatim(item: {
  place_id?: number | string;
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  addresstype?: string;
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
  const nominatimType = item.addresstype ?? item.type;
  const kind: AddressKind | undefined = houseNumber
    ? 'house'
    : nominatimType && NOMINATIM_SETTLEMENT_TYPES.has(nominatimType)
      ? 'settlement'
      : road
        ? 'street'
        : undefined;
  const name = item.name?.trim() || displayLabel;
  const label = kind === 'settlement' && nominatimType === 'city' && !/^(?:г\.|город)\s/iu.test(name ?? '')
    ? `г. ${name}` : road && houseNumber ? `${road}, ${houseNumber}` : name;
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
    kind,
    coordinates: { latitude, longitude },
  };
}

async function requestNominatimOnce(query: string, signal: AbortSignal, settlementsOnly = false): Promise<GeocodedAddress[]> {
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
    if (settlementsOnly) params.set('featureType', 'settlement');
  }
  const payload = await queuedGeocoderRequest(`${baseUrl}/${endpoint}?${params}`, {
    Accept: 'application/json', 'Accept-Language': 'ru', Referer: config.PUBLIC_URL, 'User-Agent': 'TaxiGrahovo/1.0',
  }, signal);
  const items = Array.isArray(payload) ? payload : [payload];
  const mapped = items
    .map((item) => fromNominatim(item as Parameters<typeof fromNominatim>[0]))
    .filter((item): item is GeocodedAddress => item != null);
  if (settlementsOnly) return mapped.filter(item => item.kind === 'settlement');
  const withinDistrict = (item: GeocodedAddress) => isGrahovoDistrictAddress({ ...item, label: '' });
  // Outside the service district, return the actual locality centre. Never
  // rename a road/building point to a city: that would produce a wrong route.
  const result = mapped.filter(item => item.kind === 'settlement' || withinDistrict(item));
  const names = new Set<string>();
  for (const item of items as Parameters<typeof fromNominatim>[0][]) {
    const address = fromNominatim(item);
    if (!address || withinDistrict(address) || address.kind === 'settlement') continue;
    const locality = item.address?.city ?? item.address?.town ?? item.address?.village;
    if (locality && !result.some(entry => entry.kind === 'settlement' && normalizeNamedPlace(entry.label) === normalizeNamedPlace(locality))) names.add(locality);
  }
  for (const name of [...names].slice(0, 3)) {
    const known = intercitySettlements.filter(item => normalizeNamedPlace(item.label) === normalizeNamedPlace(name));
    const found = known.length ? known : await requestNominatimOnce(name, signal, true).catch(() => []);
    result.push(...found.filter(item => normalizeNamedPlace(item.label) === normalizeNamedPlace(name)));
  }
  return result;
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

function mergeLocalAndExternalResults(
  query: string,
  local: GeocodedAddress[],
  external: GeocodedAddress[],
): GeocodedAddress[] {
  if (!external.length) return prioritizeGrahovoDistrict(local);
  const merged = prioritizeGrahovoDistrict(
    deduplicateAddresses([
      ...local.slice(0, LOCAL_RESULTS_BEFORE_EXTERNAL),
      ...external,
    ]),
  );
  const normalizedQuery = normalizeNamedPlace(query);
  const exactNamedPlaces = merged.filter(
    (address) => normalizeNamedPlace(address.label) === normalizedQuery,
  );
  return exactNamedPlaces.length ? exactNamedPlaces : merged;
}

async function requestNominatim(query: string, signal: AbortSignal): Promise<GeocodedAddress[]> {
  const combined: GeocodedAddress[] = [];
  let successfulRequests = 0;
  for (const candidate of buildNominatimQueries(query)) {
    if (signal.aborted) break;
    try {
      combined.push(...(await requestNominatimOnce(candidate, signal)));
      successfulRequests += 1;
      // An exact district house needs no second nationwide lookup.
      if (queryHouse(query) && filterExactHouseResults(query, combined).some(
        address => address.houseNumber && !hasApproximateCoordinates(address) && isGrahovoDistrictAddress(address),
      )) break;
    } catch {
      // A fallback query can still provide useful results when one upstream request fails.
    }
  }
  if (!successfulRequests) throw new Error('Nominatim search failed');
  const preciseResults = filterExactHouseResults(query, deduplicateAddresses(combined));
  return prioritizeGrahovoDistrict(preciseResults);
}

export async function searchAddresses(query: string, streetOnly = false, resolveHouse = false, localOnly = false): Promise<GeocodedAddress[]> {
  const districtAlias = hasZarechnyAlias(query);
  const variants = addressQueryVariants(query).map(normalizeBotAddress);
  const knownCity = searchIntercitySettlements(query);
  query = coordinateQuery(query) ? query : normalizeBotAddress(query);
  // Street anchors in GAR are approximate. Point selection needs an actual
  // street from OSM when available, bypassing the local-address shortcut.
  const [catalog, remembered] = streetOnly ? [[], []] : await Promise.all([getAddressDirectory(), getRememberedAddresses()]);
  const directory = streetOnly ? [] : overlayRememberedAddresses([...localAddresses, ...catalog], remembered);
  const local = deduplicateAddresses(variants.flatMap(variant => localMatches(variant, directory)));
  const exactCities = knownCity.filter(address => normalizeNamedPlace(address.label) === normalizeNamedPlace(query));
  const exactDistrictSettlement = local.some(address => address.kind === 'settlement' &&
    normalizeNamedPlace(address.label) === normalizeNamedPlace(query));
  // An exact city (Советск) must not be hidden by a district street prefix
  // (Советская). An exact district locality still keeps its local priority.
  if (!streetOnly && !resolveHouse && exactCities.length && !exactDistrictSettlement) return exactCities;
  if (local.length && variants.some(variant => hasStrongLocalMatch(variant, local)) &&
      (!resolveHouse || local.some(address => address.houseNumber && !hasApproximateCoordinates(address)))) {
    return prioritizeGrahovoDistrict(local);
  }

  if (knownCity.length && !streetOnly && !resolveHouse) return [...local, ...knownCity];

  const externalQuery = districtAlias && !normalize(query).includes('граховский район')
    ? `${query}, Граховский район, Удмуртская Республика`
    : query;
  const key = `${streetOnly ? 'street-v3' : resolveHouse ? 'house-v2' : 'v14'}:${districtAlias ? 'district-alias:' : ''}${normalize(externalQuery)}`;
  const memory = memoryCache.get(key);
  if (memory && memory.expiresAt > Date.now()) {
    return mergeLocalAndExternalResults(query, resolveHouse && memory.value.length ? [] : local, memory.value);
  }
  if (memory) memoryCache.delete(key);

  // Keystrokes use the directory and existing cache only. They must never queue
  // upstream requests or wait for a full search another passenger started.
  if (localOnly) {
    const persisted = await readPersistentCache(key);
    return mergeLocalAndExternalResults(query, local, persisted ?? []);
  }
  let pending = externalSearches.get(key);
  if (!pending) {
    pending = (async () => {
      const persisted = await readPersistentCache(key);
      const results: GeocodedAddress[] = persisted ?? await withGeocoderDeadline<GeocodedAddress[]>(signal => streetOnly
        ? requestNominatimOnce(streetGeocoderQuery(externalQuery), signal).then(items => items.filter(item => item.kind === 'street'))
        : requestNominatim(resolveHouse ? streetGeocoderQuery(externalQuery) : externalQuery, signal));
      const scopedResults = districtAlias ? filterExactHouseResults(query, results.filter(isGrahovoDistrictAddress)) : results;
      memoryCache.set(key, {
        value: scopedResults,
        expiresAt: Date.now() + config.GEOCODER_CACHE_TTL_DAYS * 86_400_000,
      });
      if (!persisted) void writePersistentCache(key, scopedResults);
      return scopedResults;
    })();
    externalSearches.set(key, pending);
    const cleanup = () => { externalSearches.delete(key); };
    void pending.then(cleanup, cleanup);
  }
  try {
    const results = await pending;
    return mergeLocalAndExternalResults(query, resolveHouse && results.length ? [] : local, results);
  } catch (error) {
    if (local.length) return prioritizeGrahovoDistrict(local);
    const lastKnown = await readPersistentCache(key, 30);
    if (lastKnown?.length) return prioritizeGrahovoDistrict(lastKnown);
    throw error;
  }
}
