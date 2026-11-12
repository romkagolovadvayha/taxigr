import type { Coordinates, RouteSummary } from '../domain/models';
import { distanceBetweenCoordinates } from '../domain/navigation';
import { getOfflineDistrict, type DistrictGraph } from './district';

type Edge = { to: number; meters: number; seconds: number };
type Snap = { a: number; b: number; direction: number; speed: number; ratio: number; point: Coordinates; distance: number };
const point = ([longitude, latitude]: readonly number[]): Coordinates => ({ longitude: longitude!, latitude: latitude! });

class MinHeap {
  private values: [number, number][] = [];
  push(item: [number, number]) {
    const a = this.values; let i = a.length; a.push(item);
    while (i > 0) { const p = (i - 1) >> 1; if (a[p]![0] <= item[0]) break; a[i] = a[p]!; i = p; }
    a[i] = item;
  }
  pop(): [number, number] | undefined {
    const a = this.values, first = a[0], tail = a.pop();
    if (!a.length || !tail) return first;
    let i = 0;
    while (i * 2 + 1 < a.length) {
      let child = i * 2 + 1;
      if (child + 1 < a.length && a[child + 1]![0] < a[child]![0]) child++;
      if (a[child]![0] >= tail[0]) break;
      a[i] = a[child]!; i = child;
    }
    a[i] = tail; return first;
  }
}

/** Road vertices are joined by OSM node ID at build time, never by crossing lines on a map. */
export function createOfflineRouter(graph: DistrictGraph) {
  const adjacency = graph.nodes.map(() => [] as Edge[]);
  for (const [a, b, direction, speed] of graph.edges) {
    const meters = distanceBetweenCoordinates(point(graph.nodes[a]!), point(graph.nodes[b]!));
    const seconds = meters / (speed / 3.6);
    if (direction >= 0) adjacency[a]!.push({ to:b, meters, seconds });
    if (direction <= 0) adjacency[b]!.push({ to:a, meters, seconds });
  }
  function snap(coordinates: Coordinates): Snap | null {
    if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) return null;
    let best: Snap | null = null;
    const cos = Math.cos(coordinates.latitude * Math.PI / 180);
    for (const [a,b,direction,speed] of graph.edges) {
      const start = point(graph.nodes[a]!), end = point(graph.nodes[b]!);
      const dx = (end.longitude-start.longitude)*cos, dy = end.latitude-start.latitude;
      const ratio = Math.max(0,Math.min(1,((coordinates.longitude-start.longitude)*cos*dx+(coordinates.latitude-start.latitude)*dy)/(dx*dx+dy*dy || 1)));
      const projected = {longitude:start.longitude+(end.longitude-start.longitude)*ratio, latitude:start.latitude+(end.latitude-start.latitude)*ratio};
      const distance = distanceBetweenCoordinates(coordinates, projected);
      if (distance <= 250 && (!best || distance < best.distance)) best = {a,b,direction,speed,ratio,point:projected,distance};
    }
    return best;
  }
  function leg(origin: Coordinates, destination: Coordinates) {
    const start = snap(origin), end = snap(destination);
    if (!start || !end) throw new Error('Для этой точки нет дороги во встроенной карте района');
    const seconds = new Float64Array(graph.nodes.length).fill(Infinity);
    const previous = new Int32Array(graph.nodes.length).fill(-1);
    const queue = new MinHeap();
    const seed = (id: number) => {
      const value = distanceBetweenCoordinates(start.point,point(graph.nodes[id]!))/(start.speed/3.6);
      if (value < seconds[id]!) { seconds[id] = value; queue.push([value,id]); }
    };
    if (start.direction <= 0 || start.ratio === 0) seed(start.a);
    if (start.direction >= 0 || start.ratio === 1) seed(start.b);
    const finishes = new Map<number, number>();
    if (end.direction >= 0 || end.ratio === 0) finishes.set(end.a,distanceBetweenCoordinates(end.point,point(graph.nodes[end.a]!))/(end.speed/3.6));
    if (end.direction <= 0 || end.ratio === 1) finishes.set(end.b,distanceBetweenCoordinates(end.point,point(graph.nodes[end.b]!))/(end.speed/3.6));
    let best = Infinity, finish = -1;
    const sameEdge = start.a === end.a && start.b === end.b &&
      (start.direction === 0 || start.direction > 0 && end.ratio >= start.ratio || start.direction < 0 && end.ratio <= start.ratio);
    if (sameEdge) best = distanceBetweenCoordinates(start.point,end.point)/(start.speed/3.6);
    for (let item = queue.pop(); item; item = queue.pop()) {
      const [cost,id] = item;
      if (cost > seconds[id]! || cost > best) continue;
      const final = finishes.get(id);
      if (final != null && cost+final < best) { best = cost+final; finish = id; }
      for (const edge of adjacency[id]!) if (cost+edge.seconds < seconds[edge.to]!) {
        seconds[edge.to] = cost+edge.seconds; previous[edge.to] = id; queue.push([seconds[edge.to]!,edge.to]);
      }
    }
    if (!Number.isFinite(best)) throw new Error('Между точками нет связного маршрута во встроенной карте');
    const ids: number[] = [];
    for (let id=finish;id>=0;id=previous[id]!) ids.push(id);
    const coordinates = [start.point,...ids.reverse().map(id => point(graph.nodes[id]!)),end.point]
      .filter((p,i,a) => i === 0 || distanceBetweenCoordinates(p,a[i-1]!) > .1);
    if (coordinates.length === 1) coordinates.push({...coordinates[0]!});
    const distanceMeters = coordinates.slice(1).reduce((sum,p,i) => sum+distanceBetweenCoordinates(coordinates[i]!,p),0);
    return {coordinates,distanceMeters,durationSeconds:best};
  }
  return (origin: Coordinates, destinations: readonly Coordinates[]): RouteSummary => {
    if (!destinations.length || destinations.length > 10) throw new Error('Укажите точки маршрута');
    let current = origin, distanceMeters = 0, durationSeconds = 0;
    const coordinates: Coordinates[] = [];
    for (const target of destinations) {
      const route = leg(current,target);
      coordinates.push(...(coordinates.length ? route.coordinates.slice(1) : route.coordinates));
      distanceMeters += route.distanceMeters; durationSeconds += route.durationSeconds; current = target;
    }
    return {source:'offline',coordinates,distanceMeters:Math.round(distanceMeters),durationSeconds:Math.round(durationSeconds)};
  };
}
let router: ReturnType<typeof createOfflineRouter> | undefined;
export function getOfflineRoadRoute(origin: Coordinates, destinations: readonly Coordinates[]): RouteSummary {
  router ??= createOfflineRouter(getOfflineDistrict().graph);
  return router(origin,destinations);
}
