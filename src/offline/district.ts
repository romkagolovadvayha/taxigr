import { gunzipSync, strFromU8 } from 'fflate';
import { toByteArray } from 'base64-js';
import snapshot from '../data/grahovo-offline-district.json';
import type { Coordinates } from '../domain/models';

export type DistrictGraph = { nodes: [number, number][]; edges: [number, number, number, number][] };
type District = { map: GeoJSON.FeatureCollection; graph: DistrictGraph };
let decoded: District | undefined;
export const districtManifest = { revision: snapshot.revision, dataDate: snapshot.dataDate, bounds: snapshot.bounds };
export function getOfflineDistrict(): District {
  decoded ??= JSON.parse(strFromU8(gunzipSync(toByteArray(snapshot.gzipBase64)))) as District;
  return decoded;
}
export function insideOfflineDistrict(point: Coordinates): boolean {
  const [west, south, east, north] = snapshot.bounds;
  return point.longitude >= west! && point.longitude <= east! && point.latitude >= south! && point.latitude <= north!;
}
