import type { Address, Coordinates } from '../domain/models';

type GeocoderResponse = {
  response?: {
    GeoObjectCollection?: {
      featureMember?: {
        GeoObject?: {
          name?: string;
          metaDataProperty?: {
            GeocoderMetaData?: {
              kind?: string;
              text?: string;
              Address?: { Components?: { kind: string; name: string }[] };
            };
          };
        };
      }[];
    };
  };
};

/** A geocoder supplies the label; pickup stays at the passenger's GPS position. */
export function pickupAddressAtCoordinates(
  address: Pick<Address, 'label' | 'details' | 'houseNumber'>,
  coordinates: Coordinates,
): Address | null {
  const label = address.label?.trim();
  if (!label || /^мо[её] местоположение$/iu.test(label)) return null;
  return {
    id: `location:${coordinates.latitude.toFixed(7)},${coordinates.longitude.toFixed(7)}`,
    label,
    houseNumber: address.houseNumber,
    details: [address.details, 'Точка определена по геопозиции устройства'].filter(Boolean).join(' · '),
    kind: 'place',
    coordinatePrecision: 'precise',
    coordinates,
  };
}

export async function resolvePickupAddress(
  coordinates: Coordinates,
  options: { apiKey?: string; signal?: AbortSignal; referer?: string },
): Promise<Address | null> {
  if (!options.apiKey || options.signal?.aborted) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 5_000);
  try {
    const params = new URLSearchParams({
      apikey: options.apiKey,
      geocode: `${coordinates.longitude},${coordinates.latitude}`,
      lang: 'ru_RU',
      format: 'json',
      results: '10',
    });
    const response = await fetch(`https://geocode-maps.yandex.ru/v1?${params}`, {
      signal: controller.signal,
      ...(options.referer ? { headers: { Referer: options.referer } } : {}),
    });
    if (!response.ok) return null;
    const body = await response.json() as GeocoderResponse | null;
    if (controller.signal.aborted) return null;
    for (const member of body?.response?.GeoObjectCollection?.featureMember ?? []) {
      const object = member.GeoObject;
      const metadata = object?.metaDataProperty?.GeocoderMetaData;
      // Reverse results are ordered house → street → locality. A street is still
      // useful when the map has no house number for this point.
      if (!metadata?.kind || !['house', 'street', 'locality'].includes(metadata.kind)) continue;
      const components = metadata.Address?.Components ?? [];
      const parts = components.filter((item) => ['locality', 'street', 'house'].includes(item.kind));
      const label = parts.some((item) => item.kind === metadata.kind)
        ? parts.map((item) => item.name).join(', ')
        : object?.name ?? metadata.text;
      if (!label) continue;
      const address = pickupAddressAtCoordinates({
        label,
        details: metadata.text,
        houseNumber: metadata.kind === 'house'
          ? components.find((item) => item.kind === 'house')?.name
          : undefined,
      }, coordinates);
      if (address) return address;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
