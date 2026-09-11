import type { GeoJSONSource, Map as LibreMap } from 'maplibre-gl';
import type { FeatureCollection, LineString } from 'geojson';

type Route = FeatureCollection<LineString>;
type RouteMap = Pick<LibreMap, 'getSource' | 'addSource' | 'addLayer' | 'setPaintProperty'>;

function sameGeometry(left: Route, right?: Route): boolean {
  if (left === right) return true;
  if (!right || left.features.length !== right.features.length) return false;
  return left.features.every((feature, index) => {
    const points = feature.geometry.coordinates, previous = right.features[index]!.geometry.coordinates;
    return points.length === previous.length && points.every((point, i) => point[0] === previous[i]![0] && point[1] === previous[i]![1]);
  });
}

export function createRouteLayerSync() {
  let source: GeoJSONSource | undefined;
  let previous: Route | undefined;
  let outline: string | undefined;
  let line: string | undefined;
  return (map: RouteMap, route: Route, nextOutline: string, nextLine: string) => {
    const current = map.getSource('taxi-route') as GeoJSONSource | undefined;
    if (!current) {
      map.addSource('taxi-route', { type: 'geojson', data: route, tolerance: 0 });
      map.addLayer({ id: 'taxi-route-outline', type: 'line', source: 'taxi-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': nextOutline, 'line-width': 10 } });
      map.addLayer({ id: 'taxi-route-line', type: 'line', source: 'taxi-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': nextLine, 'line-width': 7 } });
      source = map.getSource('taxi-route') as GeoJSONSource;
    } else {
      if (current !== source || !sameGeometry(route, previous)) current.setData(route);
      if (current !== source || nextOutline !== outline) map.setPaintProperty('taxi-route-outline', 'line-color', nextOutline);
      if (current !== source || nextLine !== line) map.setPaintProperty('taxi-route-line', 'line-color', nextLine);
      source = current;
    }
    previous = route; outline = nextOutline; line = nextLine;
  };
}
