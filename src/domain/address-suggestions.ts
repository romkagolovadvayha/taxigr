import { extractHouseNumber } from './address-precision';
import type { Address } from './models';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function suggestionId(label: string): string {
  return `street:${label
    .toLocaleLowerCase('ru')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')}`;
}

export function toStreetSuggestion(address: Address): Address | null {
  const houseNumber = extractHouseNumber(address);
  if (!houseNumber) return null;

  const label = address.label
    .replace(new RegExp(String.raw`(?:,\s*|\s+)${escapeRegExp(houseNumber)}\s*$`, 'iu'), '')
    .trim();
  if (!label || label === address.label.trim()) return null;

  const location = address.details?.replace(/\s*·\s*точка дома\s*$/iu, '').trim();
  return {
    id: suggestionId(label),
    label,
    details: location ? `${location} · улица` : 'Улица',
    coordinates: address.coordinates,
  };
}

export function buildStreetSuggestions(addresses: Address[]): Address[] {
  const seen = new Set<string>();
  return addresses.flatMap((address) => {
    const suggestion = toStreetSuggestion(address);
    if (!suggestion) return [];
    const key = suggestion.label.toLocaleLowerCase('ru');
    if (seen.has(key)) return [];
    seen.add(key);
    return [suggestion];
  });
}
