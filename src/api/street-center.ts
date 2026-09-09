import { addressSearchScore } from '../domain/address-search';
import type { Address, Coordinates } from '../domain/models';

type GeocoderResponse = {
  response?: {
    GeoObjectCollection?: {
      featureMember?: {
        GeoObject?: {
          Point?: { pos?: string };
          metaDataProperty?: { GeocoderMetaData?: { kind?: string; text?: string } };
        };
      }[];
    };
  };
};

export async function resolveStreetCenter(
  street: Address,
  options: { apiKey?: string; signal?: AbortSignal; referer?: string },
): Promise<Coordinates | null> {
  if (!options.apiKey || options.signal?.aborted) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 5_000);
  try {
    const params = new URLSearchParams({
      apikey: options.apiKey,
      geocode: street.label,
      lang: 'ru_RU',
      format: 'json',
      results: '5',
      // Scope common names to the selected settlement, not another town's street.
      ll: `${street.coordinates.longitude},${street.coordinates.latitude}`,
      spn: '0.2,0.2',
      rspn: '1',
    });
    const response = await fetch(`https://geocode-maps.yandex.ru/v1?${params}`, {
      signal: controller.signal,
      ...(options.referer ? { headers: { Referer: options.referer } } : {}),
    });
    if (!response.ok) return null;
    const data = await response.json() as GeocoderResponse;
    for (const member of data.response?.GeoObjectCollection?.featureMember ?? []) {
      const metadata = member.GeoObject?.metaDataProperty?.GeocoderMetaData;
      if (metadata?.kind !== 'street' ||
          addressSearchScore({ label: metadata.text ?? '' }, street.label) === 0) continue;
      const position = member.GeoObject?.Point?.pos?.trim().split(/\s+/).map(Number);
      if (position?.length !== 2) continue;
      const [longitude, latitude] = position;
      if (longitude == null || latitude == null ||
          !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
          Math.abs(longitude) > 180 || Math.abs(latitude) > 90) continue;
      return { latitude, longitude };
    }
    return null;
  } catch {
    // The existing street/house anchor remains usable if geocoding is unavailable.
    return null;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
