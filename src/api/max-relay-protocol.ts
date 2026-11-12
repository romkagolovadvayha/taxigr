import { fromByteArray, toByteArray } from 'base64-js';
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import nacl from 'tweetnacl';

export const relayPrefix = 'TGR2';
export const relayChunkSize = 3400;
export const relayMaxChunks = 128;
export const relayMaxPlainBytes = 2 * 1024 * 1024;
export type RelayKind = 'q' | 's' | 'm';
export type RelayChunk = { channel: string; kind: RelayKind; id: string; key: string; index: number; total: number; data: string };
export type RelayRequest = { id: string; expiresAt: number; method: string; path: string; token?: string; body?: string; requestId?: string };
export type RelayResponse = { id: string; status: number; body: string; features?:{readBatch?:1} };

export const encodeBytes = fromByteArray;
export const decodeBytes = toByteArray;
export function decodeRelayJson<T>(compressed: Uint8Array, maxBytes: number): T {
  if (compressed.length < 18) throw new Error('MAX_RELAY_INVALID_PACKET');
  const size = new DataView(compressed.buffer, compressed.byteOffset, compressed.byteLength).getUint32(compressed.length - 4, true);
  if (size > maxBytes) throw new Error('MAX_RELAY_PAYLOAD_TOO_LARGE');
  // fflate allocates from the gzip size. Check it before decoding, including
  // for the unencrypted chunk manifest, which is not trusted until box.open.
  const plain = gunzipSync(compressed);
  if (plain.length > maxBytes) throw new Error('MAX_RELAY_PAYLOAD_TOO_LARGE');
  return JSON.parse(strFromU8(plain)) as T;
}
export function createRelayKeyPair(random: (size: number) => Uint8Array) {
  return nacl.box.keyPair.fromSecretKey(random(32));
}
export function encryptRelay(value: unknown, recipientKey: string, secretKey: Uint8Array, random: (size: number) => Uint8Array): string {
  const bytes = strToU8(JSON.stringify(value));
  if (bytes.length > relayMaxPlainBytes) throw new Error('MAX_RELAY_PAYLOAD_TOO_LARGE');
  const nonce = random(24);
  const encrypted = nacl.box(gzipSync(bytes), nonce, decodeBytes(recipientKey), secretKey);
  const result = new Uint8Array(24 + encrypted.length);
  result.set(nonce); result.set(encrypted, 24);
  return encodeBytes(result);
}
export function decryptRelay<T>(encoded: string, senderKey: string, secretKey: Uint8Array): T {
  if (encoded.length > relayMaxChunks * relayChunkSize) throw new Error('MAX_RELAY_PAYLOAD_TOO_LARGE');
  const bytes = decodeBytes(encoded);
  if (bytes.length < 40) throw new Error('MAX_RELAY_INVALID_PACKET');
  const decrypted = nacl.box.open(bytes.subarray(24), bytes.subarray(0, 24), decodeBytes(senderKey), secretKey);
  if (!decrypted) throw new Error('MAX_RELAY_INVALID_PACKET');
  return decodeRelayJson<T>(decrypted, relayMaxPlainBytes);
}
export function formatRelayChunk(chunk: RelayChunk): string {
  return [relayPrefix, chunk.channel, chunk.kind, chunk.id, chunk.key, chunk.index, chunk.total, chunk.data].join('|');
}
export function splitRelay(channel: string, kind: RelayKind, id: string, key: string, data: string): string[] {
  const total = Math.ceil(data.length / relayChunkSize) || 1;
  if (total > relayMaxChunks) throw new Error('MAX_RELAY_PAYLOAD_TOO_LARGE');
  return Array.from({ length: total }, (_, index) => formatRelayChunk({ channel, kind, id, key, index, total, data: data.slice(index * relayChunkSize, (index + 1) * relayChunkSize) }));
}
export function parseRelayChunk(text: unknown): RelayChunk | null {
  if (typeof text !== 'string' || text.length > 4000) return null;
  const [prefix, channel, kind, id, key, indexText, totalText, data, ...extra] = text.split('|');
  if (prefix !== relayPrefix || extra.length || !channel || !/^[a-zA-Z0-9_-]{1,40}$/.test(channel) || !['q', 's', 'm'].includes(kind ?? '') || !id || !/^[a-zA-Z0-9_-]{8,80}$/.test(id) || !key || key.length !== 44 || data === undefined) return null;
  const index = Number(indexText), total = Number(totalText);
  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || total > relayMaxChunks || index < 0 || index >= total) return null;
  return { channel, kind: kind as RelayKind, id, key, index, total, data };
}
