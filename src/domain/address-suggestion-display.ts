import type { Address } from './models';

export type AddressSuggestionLines = {
  primary: string;
  secondary?: string;
};

const LOCALITY_SEGMENT =
  /^(?:село|с\.?|деревня|д\.?|город|г\.?|пос(?:е|ё)лок|пос\.?|пгт\.?|п\.?)\s+.+$/iu;
const DISTRICT_SEGMENT =
  /^(?:[\p{L}.-]+\s+){0,5}(?:район|муниципальный\s+округ|городской\s+округ)$/iu;
const REGION_SEGMENT =
  /(?:республика|область|край|автономный\s+округ|федеральный\s+округ|россия|российская\s+федерация)$/iu;
const STREET_SEGMENT =
  /(?:^(?:ул(?:ица)?\.?|пер(?:еулок)?\.?|просп(?:ект)?\.?|пр-т|проезд|шоссе|наб(?:ережная)?\.?|б-р|бульвар|аллея|тер\.?)\s+|\s(?:ул(?:ица)?\.?|пер(?:еулок)?\.?|просп(?:ект)?\.?|пр-т|проезд|шоссе|наб(?:ережная)?\.?|б-р|бульвар|аллея)$)/iu;

function segments(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[·,]/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function districtFrom(values: readonly (string | undefined)[]): string | undefined {
  const parts = values.flatMap(segments);
  const explicit = parts.find((part) => DISTRICT_SEGMENT.test(part));
  if (explicit) return explicit;

  const combined = values.filter(Boolean).join(', ');
  if (/граховск(?:ий|ого|ом).{0,30}(?:район|района|районе)/iu.test(combined)) {
    return 'Граховский район';
  }
  if (/граховск(?:ий|ого|ом).{0,30}муниципальн\p{L}*\s+округ/iu.test(combined)) {
    return 'Граховский муниципальный округ';
  }
  return undefined;
}

function bareLocalityFromDetails(details: string | undefined): string | undefined {
  return segments(details).find(
    (part) =>
      !DISTRICT_SEGMENT.test(part) &&
      !REGION_SEGMENT.test(part) &&
      !/(?:точка|адрес\s+из\s+гар|улица\s+из\s+гар|территория\s+из\s+гар|населённый\s+пункт\s+из\s+гар)/iu.test(
        part,
      ),
  );
}

function localityFrom(address: Pick<Address, 'label' | 'details'>): string | undefined {
  const labelLocality = segments(address.label).find((part) => LOCALITY_SEGMENT.test(part));
  if (labelLocality) return labelLocality;

  const detailParts = segments(address.details);
  return (
    detailParts.find((part) => LOCALITY_SEGMENT.test(part)) ??
    bareLocalityFromDetails(address.details)
  );
}

function uniqueParts(parts: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  return parts.flatMap((part) => {
    const value = part?.trim();
    if (!value) return [];
    const key = value.toLocaleLowerCase('ru');
    if (seen.has(key)) return [];
    seen.add(key);
    return [value];
  });
}

function streetAndHouse(value: string, houseNumber: string | undefined): string {
  const parts = segments(value);
  const addressParts = parts.filter(
    (part) =>
      !LOCALITY_SEGMENT.test(part) &&
      !DISTRICT_SEGMENT.test(part) &&
      !REGION_SEGMENT.test(part),
  );
  const normalizedHouse = houseNumber?.trim().toLocaleLowerCase('ru');
  const includesHouse =
    !!normalizedHouse &&
    addressParts.some((part) => part.toLocaleLowerCase('ru').includes(normalizedHouse));
  const canRemoveLocality =
    addressParts.some((part) => STREET_SEGMENT.test(part)) ||
    (addressParts.length >= 2 && includesHouse);
  return canRemoveLocality && addressParts.length ? addressParts.join(', ') : value.trim();
}

function isGrahovoLocality(value: string | undefined): boolean {
  return /(?:^|[\s,.])грахово(?:$|[\s,.])/iu.test(value ?? '');
}

export function formatAddressSuggestionLines(
  address: Pick<Address, 'label' | 'details' | 'houseNumber' | 'place'>,
): AddressSuggestionLines {
  const district = districtFrom([address.label, address.details]);

  if (address.place) {
    const placeDistrict =
      district ??
      (isGrahovoLocality(`${address.label}, ${address.details ?? ''}`)
        ? 'Граховский район'
        : undefined);
    const secondary = uniqueParts([
      streetAndHouse(address.place.addressLabel, address.houseNumber),
      placeDistrict,
    ]).join(', ');
    return {
      primary: address.place.name,
      secondary: secondary || undefined,
    };
  }

  const primary = streetAndHouse(address.label, address.houseNumber);
  const locality = localityFrom(address);
  const repeatedLocality =
    locality?.toLocaleLowerCase('ru') === primary.toLocaleLowerCase('ru');
  const secondary = uniqueParts([repeatedLocality ? undefined : locality, district]).join(', ');
  return {
    primary,
    secondary: secondary || undefined,
  };
}
