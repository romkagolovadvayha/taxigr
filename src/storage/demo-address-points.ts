import * as SecureStore from 'expo-secure-store';
import type { Address, Coordinates } from '../domain/models';
import { houseAddressKey, rememberedHouse } from '../domain/remembered-address';

const STORAGE_KEY = 'taxi_grahovo_demo_address_points_v1';
let saving: Promise<unknown> = Promise.resolve();

export async function readDemoAddressPoints(): Promise<Address[]> {
  const raw = process.env.EXPO_OS === 'web'
    ? (typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY))
    : await SecureStore.getItemAsync(STORAGE_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Не удалось прочитать сохранённые адреса');
  return parsed.filter((address): address is Address => address && typeof address.label === 'string' &&
    typeof address.id === 'string' && address.id.startsWith('saved-demo:') && address.coordinatePrecision === 'precise' &&
    Number.isFinite(address.coordinates?.latitude) && Number.isFinite(address.coordinates?.longitude));
}

export async function rememberDemoAddress(address: Address, coordinates: Coordinates): Promise<Address> {
  const operation = saving.catch(() => {}).then(async () => {
    const key = houseAddressKey(address);
    if (!key) throw new Error('Укажите номер дома');
    const points = await readDemoAddressPoints();
    const existing = points.find(point => houseAddressKey(point) === key);
    if (existing) return existing;
    const point = rememberedHouse(address, coordinates, `saved-demo:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
    const value = JSON.stringify([...points, point]);
    if (process.env.EXPO_OS === 'web') {
      if (typeof window === 'undefined') throw new Error('Хранилище недоступно');
      window.localStorage.setItem(STORAGE_KEY, value);
    } else await SecureStore.setItemAsync(STORAGE_KEY, value);
    return point;
  });
  saving = operation;
  return operation;
}
