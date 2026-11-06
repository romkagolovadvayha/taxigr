import { createHash } from 'node:crypto';
import type { Address } from '../src/domain/models';
import { hasApproximateCoordinates } from '../src/domain/address-precision';
import { getRememberedAddresses } from './remembered-addresses';
import { houseAddressKey, overlayRememberedAddresses } from '../src/domain/remembered-address';
import { distanceBetweenCoordinates } from '../src/domain/navigation';
import { getAddressDirectory } from './address-directory';
import { searchAddresses } from './geocoding';
import { listPlaces, placeToAddress } from './places';
import { intercitySettlements } from '../src/data/intercity-settlements';
import { addressSearchScore } from '../src/domain/address-search';
import { interpretBotAddress } from './bot-address-ai';

import { normalizeBotAddress, chooseBotAddress, rankBotAddresses } from '../src/domain/free-text-address';
export { normalizeBotAddress, splitBotRoute, botAddressScore, chooseBotAddress } from '../src/domain/free-text-address';

const timingPattern = /(?<![\p{L}\d])(?:через\s+(?:полчаса|\d{1,3}\s*(?:минут[ыу]?|мин\.?|час(?:а|ов)?|ч\.?))|(?:к|на|в)\s+\d{1,2}[:.]\d{2}|(?:завтра|послезавтра)(?:\s+(?:к|на|в)\s+\d{1,2}[:.]\d{2})?)(?![\p{L}\d])/iu;

export function botPickupTiming(text: string): string | undefined {
  return text.match(timingPattern)?.[0];
}

function bookingAddressText(raw: string): string {
  return raw.replace(timingPattern, ' ')
    .replace(/^[\s,.]+|[\s,.!?]+$/gu, '')
    .replace(/(?:,?\s+граховского\s+(?:района|р\s*-\s*на))\s*$/iu, '')
    .replace(/^деревн[ию]\s+/iu, 'д. ')
    .replace(/^санатория\s+/iu, 'санаторий ')
    .replace(/^(?:дом|д\.)\s*(\d+[а-яa-z]?(?:[/-]\d+[а-яa-z]?)?)\s+(?:на|по)\s+(?:улице|ул\.)\s+(.+)$/iu, '$2, $1')
    .trim();
}

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
  let input = bookingAddressText(raw);
  let query = normalizeBotAddress(input);
  if (!query && !selected) return { address: null, candidates: [] };
  const [directory, places, remembered] = await Promise.all([
    getAddressDirectory(), listPlaces().catch(() => []), getRememberedAddresses().catch(() => []),
  ]);
  const preciseHouses = directory.filter(address => address.houseNumber && !hasApproximateCoordinates(address));
  const local = overlayRememberedAddresses([...directory, ...intercitySettlements, ...places.map(place => ({ ...placeToAddress(place),
    details: [place.name, ...place.aliases, place.addressLabel].join(' · ') }))], [...remembered, ...preciseHouses]);
  const clean = (address: Address): Address => ({ ...address, details: address.details?.slice(0, 255) });
  const cities = !pickup ? intercitySettlements.filter(address => addressSearchScore(address, query) > 0) : [];
  if (!selected && cities.length === 1) return { address: cities[0]!, candidates: [] };
  let ranked = selected ? [{ address: selected, score: 10 }] : rankBotAddresses(input, local, pickup, true);
  if (!ranked.length) {
    const field = pickup ? 'pickup' : 'destination';
    const corrected = (await interpretBotAddress(input, field))?.[field];
    if (corrected) {
      input = bookingAddressText(corrected);
      query = normalizeBotAddress(input);
      ranked = rankBotAddresses(input, local, pickup, true);
    }
  }
  if (!ranked.length) {
    const external = await searchAddresses(query, false, true).catch(() => []);
    ranked = rankBotAddresses(input, external, pickup, true);
    // An explicitly supplied intercity street is intentionally reduced to the city.
    if (!pickup && !ranked.length) ranked = external.filter(address => address.kind === 'settlement' &&
      addressSearchScore(address, input) > 0).map(address => ({ address, score: 10 }));
  }
  ranked.sort((left, right) => right.score - left.score ||
    Number(hasApproximateCoordinates(left.address)) - Number(hasApproximateCoordinates(right.address)));
  const best = ranked[0];
  if (!best) return { address: null, candidates: [] };
  const placeHouses = new Map(places.map(place => [place.id, houseAddressKey({
    label: /грахово/iu.test(place.addressLabel) ? place.addressLabel : `с. Грахово, ${place.addressLabel}`,
    houseNumber: place.houseNumber,
  })]));
  const building = (address: Address) => (address.placeId ? placeHouses.get(address.placeId) : null) ?? houseAddressKey(address);
  const similar = ranked.filter((item, index) => best.score - item.score < 2 && !ranked.slice(0, index).some(other => {
    const key = building(item.address);
    return key !== null && key === building(other.address) &&
      (item.address.placeId || other.address.placeId) &&
      (hasApproximateCoordinates(item.address) || hasApproximateCoordinates(other.address) ||
        distanceBetweenCoordinates(item.address.coordinates, other.address.coordinates) <= 80);
  }));
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
