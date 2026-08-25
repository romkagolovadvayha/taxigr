import type { Address } from './models';

const IGNORED_TOKENS = new Set([
  'д',
  'дом',
  'деревня',
  'с',
  'село',
  'ул',
  'улица',
  'пер',
  'переулок',
  'район',
]);

function tokens(value: string): string[] {
  return value
    .toLocaleLowerCase('ru')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 1 && !IGNORED_TOKENS.has(token));
}

export function addressSearchScore(address: Pick<Address, 'label' | 'details'>, query: string): number {
  const queryTokens = tokens(query);
  if (!queryTokens.length) return 0;
  const labelTokens = tokens(address.label);
  const haystackTokens = tokens(`${address.label} ${address.details ?? ''}`);
  let score = 0;

  for (const queryToken of queryTokens) {
    if (haystackTokens.includes(queryToken)) score += 20;
    else if (haystackTokens.some((token) => token.startsWith(queryToken))) score += 5;
    else return 0;
  }

  if (queryTokens.every((token) => labelTokens.includes(token))) score += 30;
  return score;
}
