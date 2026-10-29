import type { Address } from './models';
import { isDestinationAddressComplete, isPickupAddressComplete, extractHouseNumber, extractQueryHouseNumber, normalizeHouseNumber } from './address-precision';

const keyboard = Object.fromEntries([..."qwertyuiop[]asdfghjkl;'zxcvbnm,."]
  .map((letter, index) => [letter, [...'йцукенгшщзхъфывапролджэячсмитьбю'][index]]));
const ignored = new Set(['ул', 'улица', 'дом', 'д', 'с', 'село', 'г', 'город', 'деревня', 'из', 'от', 'до', 'на', 'в', 'у', 'около', 'возле', 'район', 'хочу', 'поехать', 'ехать', 'поедем', 'нужно', 'надо', 'мне', 'меня', 'заберите', 'забрать', 'пожалуйста', 'такси', 'зд', 'здание', 'стр', 'строение']);

export function normalizeBotAddress(value: string): string {
  let text = value.trim().toLocaleLowerCase('ru').replace(/ё/gu, 'е');
  const houseLetters: Record<string, string> = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };
  text = text.replace(/(\d)([abcehkmoptxy])(?=$|[\s,./-])/gu, (_, digit: string, letter: string) => digit + houseLetters[letter]);
  if (!/[а-яё]/iu.test(value) && /[a-z]/u.test(text)) {
    text = [...text].map(letter => keyboard[letter] ?? letter).join('');
  }
  text = text.replace(/^(?:пожалуйста\s+)?(?:(?:вызови(?:те)?|закажи(?:те)?|нужно|нужна|можно)\s+)?(?:такси\s+)?/u, '')
    .replace(/([а-я])(?=\d)/gu, '$1 ')
    .replace(/(\d+[а-я]?(?:[/-]\d+[а-я]?)?)\s*(?:корпус|корп\.?|к\.?)\s*(\d+[а-я]?)/gu, '$1 к $2')
    .replace(/(\d+)[-\s]+(?:я|й|ая|ый|ое|е)(?=[\s,]|$)/gu, '$1-я')
    .replace(/[^\p{L}\p{N}\s/\-]/gu, ' ')
    .replace(/\s+/gu, ' ').trim()
    .replace(/(^|\s)(?:улца|улеца|улиса|улиц)(?=\s|$)/gu, '$1улица');
  // These are conversational words, not part of a street/settlement name.
  text = text.replace(/^(?:(?:я|хочу|поехать|ехать|поедем|нужно|надо|мне|меня|заберите|забрать|пожалуйста|в|на|до|от|из)\s+)+/u, '');
  return text.replace(/^(\d+[а-я]?(?:[/-]\d+[а-я]?)?)\s+(?!лет(?:\s|$))([а-я][а-я\s-]+)$/u, '$2 $1');
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
  return normalizeBotAddress(value).replace(/(?<=[а-я])-(?=[а-я])/gu, ' ').split(/\s+/u).filter(token => token && !ignored.has(token));
}

const wordMatches = new Map<string, boolean>();
export function addressWordsMatch(left: string, right: string): boolean {
  if (left === right) return true;
  if (/\d/u.test(left + right) || left.length < 4) return false;
  const stem = (word: string) => word.length >= 6 ? word.replace(/(?:ская|ской|скую|ское|скому|ском)$/u, 'ск') : word;
  const key = `${left}:${right}`;
  const cached = wordMatches.get(key);
  if (cached !== undefined) return cached;
  const max = left.length >= 8 ? 2 : 1;
  const result = stem(left) === stem(right) || (Math.abs(left.length - right.length) <= max && addressWordDistance(left, right) <= max);
  if (wordMatches.size >= 10_000) wordMatches.clear();
  wordMatches.set(key, result);
  return result;
}

export function addressQueryVariants(value: string): string[] {
  if (/[а-яё]/iu.test(value) || !/[a-z]/iu.test(value)) return [value];
  const letters: Record<string, string> = {a:'а',b:'б',v:'в',g:'г',d:'д',e:'е',z:'з',i:'и',j:'й',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',r:'р',s:'с',t:'т',u:'у',f:'ф',h:'х',c:'к',y:'ы',w:'в',q:'к',x:'кс'};
  const pairs: Record<string, string> = {shch:'щ',sch:'щ',zh:'ж',ch:'ч',sh:'ш',kh:'х',ts:'ц',yu:'ю',ya:'я',yo:'е'};
  const transliterated = value.toLowerCase().replace(/shch|sch|zh|ch|sh|kh|ts|yu|ya|yo|[a-z]/gu,
    part => pairs[part] ?? letters[part] ?? part);
  return [value, transliterated];
}

// Small misspellings are accepted only in words, never in house numbers.
export function addressWordDistance(left: string, right: string): number {
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
  const edits = row[right.length]!;
  if (edits === 2 && left.length === right.length) {
    for (let i = 0; i < left.length - 1; i++) {
      if (left.slice(0, i) + left[i + 1] + left[i] + left.slice(i + 2) === right) return 1;
    }
  }
  return edits;
}

export function botAddressScore(query: string, address: Address): number {
  return Math.max(...addressQueryVariants(query).map(variant => scoreVariant(variant, address)));
}

const tokenCache = new WeakMap<Address, string[]>();
function scoreVariant(query: string, address: Address): number {
  const wanted = tokens(query);
  let available = tokenCache.get(address);
  if (!available) { available = tokens(`${address.label} ${address.details ?? ''}`); tokenCache.set(address, available); }
  if (!wanted.length) return 0;
  let score = 0;
  for (const word of wanted) {
    if (available.includes(word)) score += 10;
    else if (/\d/u.test(word)) return 0;
    else if (available.some(candidate => addressWordsMatch(word, candidate))) score += 6;
    else return 0;
  }
  // A supplied house must match exactly, even when it occurs before the street.
  const lastNumber = extractQueryHouseNumber(normalizeBotAddress(query));
  if (lastNumber && normalizeHouseNumber(extractHouseNumber(address)) !== normalizeHouseNumber(lastNumber)) return 0;
  return score / wanted.length;
}

export function rankBotAddresses(query: string, candidates: Address[], pickup: boolean, includeApproximate = false): { address: Address; score: number }[] {
  const complete = pickup ? isPickupAddressComplete : isDestinationAddressComplete;
  const house = extractQueryHouseNumber(normalizeBotAddress(query));
  const ranked = candidates
    .filter(address => !house || normalizeHouseNumber(extractHouseNumber(address)) === normalizeHouseNumber(house))
    .map(address => ({ address, score: botAddressScore(query, address) }))
    .filter(item => house || !extractHouseNumber(item.address) || !!item.address.placeId)
    .filter(item => item.score >= 6 && (complete(item.address) || (includeApproximate && !!extractHouseNumber(item.address))))
    .sort((a, b) => b.score - a.score);
  // The directory and POI catalogue can describe the same physical house.
  return ranked.filter((item, i) => !ranked.slice(0, i).some(other =>
    Math.abs(other.address.coordinates.latitude - item.address.coordinates.latitude) < 0.0002 &&
    Math.abs(other.address.coordinates.longitude - item.address.coordinates.longitude) < 0.0002 &&
    (other.address.label === item.address.label || (extractHouseNumber(other.address) === extractHouseNumber(item.address) &&
      (!!other.address.placeId || !!item.address.placeId)))));
}

export function chooseBotAddress(query: string, candidates: Address[], pickup: boolean): Address | null {
  const ranked = rankBotAddresses(query, candidates, pickup);
  const best = ranked[0];
  if (!best) return null;
  const rival = ranked.find(item => Math.abs(item.address.coordinates.latitude - best.address.coordinates.latitude) > 0.0002 ||
     Math.abs(item.address.coordinates.longitude - best.address.coordinates.longitude) > 0.0002);
  return rival && best.score - rival.score < 2 ? null : best.address;
}
