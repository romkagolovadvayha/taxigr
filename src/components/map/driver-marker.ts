import { isVehicleColorHex, vehicleColorOptions } from '../../domain/vehicle-colors';

export const DRIVER_MARKER_WIDTH = 28;
export const DRIVER_MARKER_HEIGHT = 40;
const defaultMarker = 'taxi-driver-yellow';

function rgb(hex: string): [number, number, number] {
  const color = Number.parseInt(hex.slice(1), 16);
  return [color >> 16, (color >> 8) & 255, color & 255];
}

const markers = vehicleColorOptions.map(({ key, hex }) => ({ name: 'taxi-driver-' + key, channels: rgb(hex) }));

export function driverMarkerKey(colorHex: string | null | undefined): string {
  if (!isVehicleColorHex(colorHex)) return defaultMarker;

  const [red, green, blue] = rgb(colorHex);
  let nearest = defaultMarker;
  let nearestDistance = Infinity;
  for (const { name, channels: [r, g, b] } of markers) {
    const distance = 3 * (red - r) ** 2 + 6 * (green - g) ** 2 + (blue - b) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = name;
    }
  }
  return nearest;
}
