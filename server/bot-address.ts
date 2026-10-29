import { createHash } from 'node:crypto';
import type { Address } from '../src/domain/models';
import { hasApproximateCoordinates } from '../src/domain/address-precision';
import { getRememberedAddresses } from './remembered-addresses';
import { overlayRememberedAddresses } from '../src/domain/remembered-address';
import { getAddressDirectory } from './address-directory';
import { searchAddresses } from './geocoding';
import { listPlaces, placeToAddress } from './places';
import { intercitySettlements } from '../src/data/intercity-settlements';
import { addressSearchScore } from '../src/domain/address-search';

import { normalizeBotAddress, chooseBotAddress, rankBotAddresses } from '../src/domain/free-text-address';
export { normalizeBotAddress, splitBotRoute, botAddressScore, chooseBotAddress } from '../src/domain/free-text-address';

export function unresolvedBotAddress(raw: string): Address {
  return {
    id: `manual:${createHash('sha256').update(raw).digest('hex').slice(0, 24)}`,
    label: raw.trim(),
    details: 'Адрес со слов пассажира. Точка не определена — уточните по телефону.',
    coordinatePrecision: 'approximate',
    // Storage compatibility only; manual orders never expose these as navigation targets.
    coordinates: { latitude: 0, longitude: 0 },
  };
}

export type BotAddressResolution = { address: Address | null; candidates: Address[]; recognized?: Address };

export async function resolveBotAddressOptions(raw: string, pickup: boolean, selected?: Address): Promise<BotAddressResolution> {
  const query = normalizeBotAddress(raw);
  const [directory, places, remembered] = await Promise.all([
    getAddressDirectory(), listPlaces().catch(() => []), getRememberedAddresses().catch(() => []),
  ]);
  const preciseHouses = directory.filter(address => address.houseNumber && !hasApproximateCoordinates(address));
  const local = overlayRememberedAddresses([...directory, ...intercitySettlements, ...places.map(place => ({ ...placeToAddress(place),
    details: [place.name, ...place.aliases, place.addressLabel].join(' · ') }))], [...remembered, ...preciseHouses]);
  const clean = (address: Address): Address => ({ ...address, details: address.details?.slice(0, 255) });
  const cities = !pickup ? intercitySettlements.filter(address => addressSearchScore(address, query) > 0) : [];
  if (!selected && cities.length === 1) return { address: cities[0]!, candidates: [] };
  let ranked = selected ? [{ address: selected, score: 10 }] : rankBotAddresses(raw, local, pickup, true);
  if (!ranked.length) {
    const external = await searchAddresses(query, false, true).catch(() => []);
    ranked = rankBotAddresses(raw, external, pickup, true);
    // An explicitly supplied intercity street is intentionally reduced to the city.
    if (!pickup && !ranked.length) ranked = external.filter(address => address.kind === 'settlement' &&
      addressSearchScore(address, raw) > 0).map(address => ({ address, score: 10 }));
  }
  const best = ranked[0];
  if (!best) return { address: null, candidates: [] };
  const similar = ranked.filter(item => best.score - item.score < 2);
  if (similar.length > 1) return { address: null, candidates: similar.slice(0, 5).map(item => clean(item.address)) };
  let resolved: Address | null = best.address;
  if (hasApproximateCoordinates(resolved) && resolved.kind !== 'settlement') {
    // Correct spelling and the settlement come from GAR before asking the geocoder.
    const external = await searchAddresses(resolved.label, false, true).catch(() => []);
    resolved = chooseBotAddress(resolved.label, external, pickup);
  }
  return { address: resolved ? clean(resolved) : null, candidates: [], ...(!resolved ? {recognized: clean(best.address)} : {}) };
}

export async function resolveBotAddress(raw: string, pickup: boolean): Promise<Address | null> {
  return (await resolveBotAddressOptions(raw, pickup)).address;
}
