import type { Address } from './models';

type RouteAddressLabels = {
  pickup: string;
  destination: string;
  sameLocality: boolean;
};

type MultiStopRouteAddressLabels = {
  pickup: string;
  destinations: string[];
  sameLocality: boolean;
};

const LOCALITY_SEGMENT = /^(село|с\.?|деревня|д\.?|город|г\.?|пос(?:е|ё)лок|пос\.?|пгт\.?|п\.?)\s+(.+)$/iu;

function localityKey(segment: string): string | null {
  const match = segment.trim().match(LOCALITY_SEGMENT);
  if (!match) return null;

  const rawPrefix = match[1]?.toLocaleLowerCase('ru').replaceAll('.', '') ?? '';
  const name = match[2]?.trim().toLocaleLowerCase('ru').replace(/\s+/g, ' ');
  if (!name || !/[а-яё]/iu.test(name) || /^\d/u.test(name)) return null;

  const prefix =
    rawPrefix === 'с' || rawPrefix === 'село'
      ? 'с'
      : rawPrefix === 'д' || rawPrefix === 'деревня'
        ? 'д'
        : rawPrefix === 'г' || rawPrefix === 'город'
          ? 'г'
          : 'п';
  return `${prefix}:${name}`;
}

function addressParts(address: Pick<Address, 'label' | 'details'>) {
  const labelSegments = address.label.split(',').map((part) => part.trim()).filter(Boolean);
  const labelLocality = labelSegments[0] ? localityKey(labelSegments[0]) : null;
  if (labelLocality) {
    return {
      locality: labelLocality,
      localLabel: labelSegments.slice(1).join(', ') || address.label,
    };
  }

  const detailLocality = (address.details ?? '')
    .split(/[·,]/u)
    .map((part) => localityKey(part))
    .find((part): part is string => part != null);
  return { locality: detailLocality ?? null, localLabel: address.label };
}

export function formatRouteAddresses(
  pickup: Pick<Address, 'label' | 'details'>,
  destination: Pick<Address, 'label' | 'details'>,
): RouteAddressLabels {
  const pickupParts = addressParts(pickup);
  const destinationParts = addressParts(destination);
  const sameLocality =
    pickupParts.locality != null && pickupParts.locality === destinationParts.locality;

  return {
    pickup: sameLocality ? pickupParts.localLabel : pickup.label,
    destination: sameLocality ? destinationParts.localLabel : destination.label,
    sameLocality,
  };
}

export function formatRouteLabel(
  pickup: Pick<Address, 'label' | 'details'>,
  destination: Pick<Address, 'label' | 'details'>,
): string {
  const labels = formatRouteAddresses(pickup, destination);
  return `${labels.pickup} → ${labels.destination}`;
}

export function formatMultiStopRouteLabel(
  pickup: Pick<Address, 'label' | 'details'>,
  destinations: readonly Pick<Address, 'label' | 'details'>[],
): string {
  const labels = formatMultiStopRouteAddresses(pickup, destinations);
  return [labels.pickup, ...labels.destinations].join(' → ');
}

export function formatMultiStopRouteAddresses(
  pickup: Pick<Address, 'label' | 'details'>,
  destinations: readonly Pick<Address, 'label' | 'details'>[],
): MultiStopRouteAddressLabels {
  if (!destinations.length) {
    return { pickup: pickup.label, destinations: [], sameLocality: false };
  }
  const parts = [pickup, ...destinations].map(addressParts);
  const commonLocality = parts[0]?.locality;
  const sameLocality =
    commonLocality != null && parts.every((part) => part.locality === commonLocality);
  const labels = [pickup, ...destinations].map((address, index) =>
    sameLocality ? parts[index]!.localLabel : address.label,
  );
  return {
    pickup: labels[0]!,
    destinations: labels.slice(1),
    sameLocality,
  };
}
