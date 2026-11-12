import { getRandomBytes } from 'expo-crypto';
export function relayRandomBytes(size: number): Uint8Array { return getRandomBytes(size); }
