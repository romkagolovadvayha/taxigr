import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRelayKeyPair, decodeRelayJson, decryptRelay, encodeBytes, encryptRelay, parseRelayChunk, splitRelay } from '../src/api/max-relay-protocol';
import { gzipSync, strToU8 } from 'fflate';
import { RealtimeEvents } from '../server/realtime-events';

describe('MAX reserve protocol', () => {
  const random=(size:number)=>randomBytes(size);
  it('bounds decompression before allocating an untrusted response manifest', () => {
    const compressed = gzipSync(strToU8('["message-id"]'));
    expect(decodeRelayJson(compressed, 20_000)).toEqual(['message-id']);
    new DataView(compressed.buffer).setUint32(compressed.length - 4, 0xffffffff, true);
    expect(() => decodeRelayJson(compressed, 20_000)).toThrow('MAX_RELAY_PAYLOAD_TOO_LARGE');
  });
  it('keeps content private for different clients and detects modified ciphertext', () => {
    const server=createRelayKeyPair(random),client=createRelayKeyPair(random),outsider=createRelayKeyPair(random);
    const value={token:'test-taxi-session',path:'/v1/orders',body:'тест'};
    const encoded=encryptRelay(value,encodeBytes(server.publicKey),client.secretKey,random);
    expect(decryptRelay(encoded,encodeBytes(client.publicKey),server.secretKey)).toEqual(value);
    expect(()=>decryptRelay(encoded,encodeBytes(outsider.publicKey),server.secretKey)).toThrow();
    expect(()=>decryptRelay(encoded.slice(0,80)+'AAAA'+encoded.slice(84),encodeBytes(client.publicKey),server.secretKey)).toThrow();
  });
  it('fragments and reconstructs a large incompressible admin or image body within MAX text limits',()=>{
    const server=createRelayKeyPair(random),client=createRelayKeyPair(random),value={data:encodeBytes(randomBytes(20000))};
    const data=encryptRelay(value,encodeBytes(server.publicKey),client.secretKey,random);
    const chunks=splitRelay('test-channel','q','test-request-id',encodeBytes(client.publicKey),data);
    expect(chunks.length).toBeGreaterThan(1);expect(chunks.every(x=>x.length<4000)).toBe(true);
    const parsed=chunks.map(x=>parseRelayChunk(x)!);expect(parsed.every(x=>x.total===chunks.length)).toBe(true);
    expect(decryptRelay(parsed.map(x=>x.data).join(''),encodeBytes(client.publicKey),server.secretKey)).toEqual(value);
  });
  it('rejects malformed metadata and excessive chunk counts',()=>{
    expect(parseRelayChunk('TGR2|x|q|short|invalid|0|1|data')).toBeNull();
    expect(()=>splitRelay('x','q','test-request-id',encodeBytes(randomBytes(32)),'x'.repeat(500000))).toThrow();
  });
});
describe('reserve event audiences',()=>{
  it('does not expose passenger or admin events to another passenger',()=>{
    const events=new RealtimeEvents(),start=events.read(undefined,new Set(['user:a'])).cursor;
    events.publish('user:a','order:updated',{id:'own'});events.publish('user:b','order:updated',{id:'other'});events.publish('admins','private:admin',{});
    expect(events.read(start,new Set(['user:a'])).events).toEqual([{event:'order:updated',payload:{id:'own'}}]);
  });
  it('retains events after a bounded page instead of skipping a busy admin burst',()=>{
    const events=new RealtimeEvents(),start=events.read(undefined,new Set(['admins'])).cursor;
    for(let i=0;i<130;i++)events.publish('admins','order:updated',{i});
    const first=events.read(start,new Set(['admins']));expect(first.events).toHaveLength(100);
    expect(events.read(first.cursor,new Set(['admins'])).events).toHaveLength(30);
    expect(events.read('previous-server:5',new Set(['admins'])).reset).toBe(true);
  });
});
