import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startBotApiRelay } from '../server/bot-api-relay';
import { createRelayKeyPair, encodeBytes, encryptRelay, splitRelay, type RelayRequest } from '../src/api/max-relay-protocol';
import { RelayTransportUnavailable, type RelayMessageTransport } from '../src/api/relay-message-transport';

afterEach(() => vi.useRealTimers());
function fixture(old = false, override:Partial<RelayRequest>={}) {
  const server=createRelayKeyPair(randomBytes), client=createRelayKeyPair(randomBytes);
  const request={id:'worker-test-operation',method:'GET',path:'/v1/transport-health',expiresAt:Date.now()+60_000,...override};
  const data=encryptRelay(request,encodeBytes(server.publicKey),client.secretKey,randomBytes);
  const packet=splitRelay('worker-test','q',request.id,encodeBytes(client.publicKey),data)[0]!;
  const api:RelayMessageTransport={verifyRecipient:vi.fn().mockResolvedValue(undefined),send:vi.fn(),edit:vi.fn(),read:vi.fn(),
    history:vi.fn().mockResolvedValue([{timestamp:Date.now()-(old?131_000:0),recipient:{chat_id:'123'},body:{mid:'42',text:packet}}])};
  const inject=vi.fn().mockResolvedValue({statusCode:200,body:'{"data":{"ok":true}}'});
  const app={inject,log:{warn:vi.fn()}} as unknown as FastifyInstance;
  return {api,app,inject,secretKey:encodeBytes(server.secretKey)};
}
describe('relay worker delivery failures',()=>{
  it('backs off empty service-chat polling instead of requesting history every second forever',async()=>{
    vi.useFakeTimers();const value=fixture();vi.mocked(value.api.history).mockResolvedValue([]);
    const stop=await startBotApiRelay(value.app,{api:value.api,label:'MAX',recipientId:'123',channel:'worker-test',secretKey:value.secretKey});
    await vi.advanceTimersByTimeAsync(20_000);
    expect(vi.mocked(value.api.history).mock.calls.length).toBeLessThanOrEqual(6);
    expect(value.api.send).not.toHaveBeenCalled();await stop();
  });
  it('pauses the worker after VK flood control and preserves the primary API',async()=>{
    vi.useFakeTimers();const value=fixture();vi.mocked(value.api.edit).mockRejectedValue(new RelayTransportUnavailable('VK_RELAY_FLOOD_CONTROL',300_000));
    const stop=await startBotApiRelay(value.app,{api:value.api,label:'VK',recipientId:'123',channel:'worker-test',secretKey:value.secretKey});
    await vi.advanceTimersByTimeAsync(1);expect(value.inject).toHaveBeenCalledOnce();expect(value.api.edit).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(20_000);expect(value.api.history).toHaveBeenCalledOnce();expect(value.api.edit).toHaveBeenCalledOnce();
    await stop();
  });
  it('does not resurrect old request fragments on worker restart',async()=>{
    vi.useFakeTimers();const value=fixture(true);
    const stop=await startBotApiRelay(value.app,{api:value.api,label:'MAX',recipientId:'123',channel:'worker-test',secretKey:value.secretKey});
    await vi.advanceTimersByTimeAsync(1);expect(value.inject).not.toHaveBeenCalled();expect(value.api.edit).not.toHaveBeenCalled();await stop();
  });
  it('retries a reply without repeating an older client mutation',async()=>{
    vi.useFakeTimers();const value=fixture(false,{method:'POST',path:'/v1/orders/test/cancel',token:'session',body:'{}'});
    vi.mocked(value.api.edit).mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
    const options={api:value.api,label:'MAX' as const,recipientId:'123',channel:'worker-test',secretKey:value.secretKey};
    let stop=await startBotApiRelay(value.app,options);await vi.advanceTimersByTimeAsync(1001);
    expect(value.inject).toHaveBeenCalledOnce();expect(value.api.edit).toHaveBeenCalledTimes(2);
    const replayId=value.inject.mock.calls[0]![0].headers['x-taxi-request-id'];expect(replayId).toMatch(/^relay-[a-f0-9]{48}$/);
    await stop();stop=await startBotApiRelay(value.app,options);await vi.advanceTimersByTimeAsync(1);
    expect(value.inject.mock.calls[1]![0].headers['x-taxi-request-id']).toBe(replayId);await stop();
  });
  it('keeps successfully uploaded reply fragments when the manifest edit fails',async()=>{
    vi.useFakeTimers();const value=fixture();value.inject.mockResolvedValue({statusCode:200,body:randomBytes(15_000).toString('base64')});
    vi.mocked(value.api.send).mockImplementation(async()=>String(100+vi.mocked(value.api.send).mock.calls.length));
    vi.mocked(value.api.edit).mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
    const stop=await startBotApiRelay(value.app,{api:value.api,label:'MAX',recipientId:'123',channel:'worker-test',secretKey:value.secretKey});
    await vi.advanceTimersByTimeAsync(1);const chunks=vi.mocked(value.api.send).mock.calls.length;expect(chunks).toBeGreaterThan(1);
    await vi.advanceTimersByTimeAsync(1000);expect(value.api.send).toHaveBeenCalledTimes(chunks);expect(value.inject).toHaveBeenCalledOnce();expect(value.api.edit).toHaveBeenCalledTimes(2);await stop();
  });
  it('blocks encoded internal paths before injecting an API request',async()=>{
    vi.useFakeTimers();const value=fixture(false,{path:'/v1/%69nternal/test'});
    const stop=await startBotApiRelay(value.app,{api:value.api,label:'MAX',recipientId:'123',channel:'worker-test',secretKey:value.secretKey});
    await vi.advanceTimersByTimeAsync(1);expect(value.inject).not.toHaveBeenCalled();expect(value.api.edit).toHaveBeenCalledOnce();await stop();
  });
});
