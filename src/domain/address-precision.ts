type AddressLike = {
  label: string;
  details?: string;
  houseNumber?: string;
};

const HOUSE_NUMBER = String.raw`\d+[а-яa-z]?(?:[/-]\d+[а-яa-z]?)?`;
const ROAD_CODE = /^\d{1,3}[рк]-\d+$/iu;

export function extractHouseNumber(address: AddressLike): string | null {
  const structured = address.houseNumber?.trim();
  if (structured) return structured;

  const label = address.label.trim().replace(/\s+/g, ' ');
  const trailing = label.match(new RegExp(String.raw`(?:,\s*|\s+)(${HOUSE_NUMBER})\s*$`, 'iu'));
  const candidate = trailing?.[1];
  if (candidate && !ROAD_CODE.test(candidate)) return candidate;

  const details = address.details?.trim() ?? '';
  const explicit = details.match(
    new RegExp(String.raw`\b(?:дом|д\.)\s*(${HOUSE_NUMBER})(?:\b|$)`, 'iu'),
  );
  return explicit?.[1] ?? null;
}

export function hasHouseNumber(address: AddressLike | null | undefined): boolean {
  return !!address && extractHouseNumber(address) !== null;
}

export function queryHasHouseNumber(query: string): boolean {
  const normalized = query.trim().replace(/\s+/g, ' ');
  const match = normalized.match(new RegExp(String.raw`(?:,\s*|\s+)(${HOUSE_NUMBER})\s*$`, 'iu'));
  if (!match?.[1] || match.index == null || ROAD_CODE.test(match[1])) return false;

  const streetPart = normalized
    .slice(0, match.index)
    .replace(
      /(?:^|[\s,])(?:ул(?:ица)?|пер(?:еулок)?|пр(?:оспект)?|ш(?:оссе)?|наб(?:ережная)?|проезд)\.?/giu,
      ' ',
    )
    .replace(/[^\p{L}]+/gu, '');
  return streetPart.length >= 2;
}
