import { randomBytes } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { BotRelayClient } from '../src/api/bot-relay-client';
import { createRelayKeyPair, encodeBytes } from '../src/api/max-relay-protocol';
import type { RelayMessageTransport } from '../src/api/relay-message-transport';

afterEach(()=>vi.useRealTimers());
it('does not consider the channel healthy just because messenger metadata is accessible',async()=>{
  vi.useFakeTimers();const pair=createRelayKeyPair(randomBytes);
  const api:RelayMessageTransport={verifyRecipient:vi.fn().mockResolvedValue(undefined),send:vi.fn().mockResolvedValue('42'),edit:vi.fn(),history:vi.fn(),read:vi.fn().mockResolvedValue([])};
  const client=new BotRelayClient({channel:'probe-test',publicKey:encodeBytes(pair.publicKey)},api);
  const pending=expect(client.probe()).rejects.toMatchObject({name:'AbortError'});
  await vi.advanceTimersByTimeAsync(8001);await pending;
  expect(api.verifyRecipient).toHaveBeenCalledOnce();expect(api.send).toHaveBeenCalledOnce();expect(api.read).toHaveBeenCalled();
});
