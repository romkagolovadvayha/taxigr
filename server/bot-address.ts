import { createHash } from 'node:crypto';
import type { Address } from '../src/domain/models';
import { isDestinationAddressComplete, isPickupAddressComplete, extractHouseNumber } from '../src/domain/address-precision';
import { getAddressDirectory } from './address-directory';
import { searchAddresses } from './geocoding';
import { listPlaces, placeToAddress } from './places';

const keyboard = Object.fromEntries([..."qwertyuiop[]asdfghjkl;'zxcvbnm,."]
  .map((letter, index) => [letter, [...'йцукенгшщзхъфывапролджэячсмитьбю'][index]]));
const ignored = new Set(['ул', 'улица', 'дом', 'д', 'с', 'село', 'г', 'город', 'деревня', 'из', 'от', 'до', 'на', 'в', 'у', 'около', 'возле', 'район']);

export function normalizeBotAddress(value: string): string {
  let text = value.trim().toLocaleLowerCase('ru').replace(/ё/gu, 'е');
  if (!/[а-я]/u.test(text) && /[a-z]/u.test(text)) {
    text = [...text].map(letter => keyboard[letter] ?? letter).join('');
  }
  return text.replace(/^(?:пожалуйста\s+)?(?:(?:вызови(?:те)?|закажи(?:те)?|нужно|нужна|можно)\s+)?(?:такси\s+)?/u, '')
    .replace(/([а-я])(?=\d)/gu, '$1 ')
    .replace(/[^\p{L}\p{N}\s/\-]/gu, ' ')
    .replace(/\s+/gu, ' ').trim();
}

export function splitBotRoute(value: string): [string, string] | null {
  const text = value.trim().replace(/^(?:пожалуйста\s+)?(?:(?:вызови(?:те)?|закажи(?:те)?|нужно|нужна|можно)\s+)?такси\s*/iu, '');
  const parts = text.split(/\s*(?:→|->|\n|;|\s[—–-]\s|\s+до\s+|\s+куда:\s*)\s*/iu).filter(Boolean);
  if (parts.length === 2) {
    return [parts[0]!.replace(/^(?:откуда:\s*|(?:из|от|с)\s+)/iu, '').trim(), parts[1]!.trim()];
  }
  const natural = text.match(/^(?:из|от|с)\s+(.+?)\s+(?:в|на)\s+(.+)$/iu);
  return natural ? [natural[1]!.trim(), natural[2]!.trim()] : null;
}

function tokens(value: string): string[] {
  return normalizeBotAddress(value).split(/\s+/u).filter(token => token && !ignored.has(token));
}

function queryVariants(value: string): string[] {
  if (/[а-яё]/iu.test(value) || !/[a-z]/iu.test(value)) return [value];
  const letters: Record<string, string> = {a:'а',b:'б',v:'в',g:'г',d:'д',e:'е',z:'з',i:'и',j:'й',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',r:'р',s:'с',t:'т',u:'у',f:'ф',h:'х',c:'к',y:'ы',w:'в',q:'к',x:'кс'};
  const pairs: Record<string, string> = {shch:'щ',sch:'щ',zh:'ж',ch:'ч',sh:'ш',kh:'х',ts:'ц',yu:'ю',ya:'я',yo:'е'};
  const transliterated = value.toLowerCase().replace(/shch|sch|zh|ch|sh|kh|ts|yu|ya|yo|[a-z]/gu,
    part => pairs[part] ?? letters[part] ?? part);
  return [value, transliterated];
}

// Small misspellings are accepted only in words, never in house numbers.
function distance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const old = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + Number(left[i - 1] !== right[j - 1]));
      previous = old;
    }
  }
  return row[right.length]!;
}

export function botAddressScore(query: string, address: Address): number {
  return Math.max(...queryVariants(query).map(variant => scoreVariant(variant, address)));
}

function scoreVariant(query: string, address: Address): number {
  const wanted = tokens(query);
  const available = tokens(`${address.label} ${address.details ?? ''}`);
  if (!wanted.length) return 0;
  let score = 0;
  for (const word of wanted) {
    if (available.includes(word)) score += 10;
    else if (/\d/u.test(word)) return 0;
    else if (word.length >= 4 && available.some(candidate =>
      !/\d/u.test(candidate) && distance(word, candidate) <= (word.length >= 8 ? 2 : 1))) score += 6;
    else return 0;
  }
  // A supplied house must match exactly, even when it occurs before the street.
  const lastNumber = wanted.filter(word => /^\d+[а-я]?(?:[/-]\d+[а-я]?)?$/u.test(word)).at(-1);
  if (lastNumber && extractHouseNumber(address)?.toLowerCase() !== lastNumber) return 0;
  return score / wanted.length;
}

export function chooseBotAddress(query: string, candidates: Address[], pickup: boolean): Address | null {
  const complete = pickup ? isPickupAddressComplete : isDestinationAddressComplete;
  const ranked = candidates.map(address => ({ address, score: botAddressScore(query, address) }))
    .filter(item => item.score >= 6 && complete(item.address))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return null;
  const rival = ranked.find(item => item.address.label !== best.address.label &&
    (Math.abs(item.address.coordinates.latitude - best.address.coordinates.latitude) > 0.0002 ||
     Math.abs(item.address.coordinates.longitude - best.address.coordinates.longitude) > 0.0002));
  return rival && best.score - rival.score < 2 ? null : best.address;
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

export async function resolveBotAddress(raw: string, pickup: boolean): Promise<Address | null> {
  const query = normalizeBotAddress(raw);
  const [directory, places] = await Promise.all([getAddressDirectory(), listPlaces().catch(() => [])]);
  const local = [...directory, ...places.map(place => ({ ...placeToAddress(place),
    details: [place.name, ...place.aliases, place.addressLabel].join(' · ') }))];
  const match = chooseBotAddress(raw, local, pickup);
  if (match) return { ...match, details: match.details?.slice(0, 255) };
  const external = await searchAddresses(query, false, true).catch(() => []);
  const resolved = chooseBotAddress(raw, [...local, ...external], pickup);
  return resolved ? { ...resolved, details: resolved.details?.slice(0, 255) } : null;
}
