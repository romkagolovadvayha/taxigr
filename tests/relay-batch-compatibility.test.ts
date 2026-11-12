import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BotRelayClient } from '../src/api/bot-relay-client';
import { createRelayKeyPair, decryptRelay, encodeBytes, encryptRelay, parseRelayChunk, splitRelay, type RelayRequest, type RelayResponse } from '../src/api/max-relay-protocol';
import { readBatchPath } from '../src/api/read-batch-contract';
import type { RelayMessageTransport } from '../src/api/relay-message-transport';

beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
function fixture(modern:boolean) {
  const pair=createRelayKeyPair(randomBytes),requests:RelayRequest[]=[],replies=new Map<string,string>();
  let rolledBack=false;
  const api:RelayMessageTransport={verifyRecipient:vi.fn().mockResolvedValue(undefined),history:vi.fn(),edit:vi.fn(),
    send:vi.fn(async text=>{
      const chunk=parseRelayChunk(text)!;expect(chunk.total).toBe(1);
      const request=decryptRelay<RelayRequest>(chunk.data,chunk.key,pair.secretKey);requests.push(request);
      let body=JSON.stringify({data:{path:request.path,owner:request.token}}),status=200;
      if(request.path==='/v1/transport-health')body=JSON.stringify({data:{ok:true,...(modern&&!rolledBack?{capabilities:{readBatch:1}}:{})}});
      if(request.path===readBatchPath){
        if(rolledBack){status=404;body='{}';}
        else body=JSON.stringify({data:{results:JSON.parse(request.body!).requests.map((item:{id:string;path:string})=>({id:item.id,status:200,body:JSON.stringify({data:{path:item.path,owner:request.token}})}))}});
      }
      const response:RelayResponse={id:request.id,status,body,...(modern&&!rolledBack?{features:{readBatch:1 as const}}:{})};
      const textReply=splitRelay('compat-test','s',request.id,chunk.key,encryptRelay(response,chunk.key,pair.secretKey,randomBytes))[0]!;
      const mid=String(requests.length);replies.set(mid,textReply);return mid;
    }),read:vi.fn(async (mids:string[])=>mids.map(mid=>({body:{mid,text:replies.get(mid)}})))};
  return {requests,client:new BotRelayClient({channel:'compat-test',publicKey:encodeBytes(pair.publicKey)},api),rollback:()=>{rolledBack=true;}};
}
const read=(path:string,token='passenger')=>({method:'GET',path,token});
async function finish<T>(pending:Promise<T>) {await vi.advanceTimersByTimeAsync(1000);return pending;}
describe('encrypted relay compatibility',()=>{
  it('keeps the original one-operation packets with an older worker',async()=>{
    const {client,requests}=fixture(false);await finish(client.probe());
    const responses=await finish(Promise.all([client.request(read('/v1/me')),client.request(read('/v1/bootstrap'))]));
    expect(responses.map(r=>JSON.parse(r.body).data.path)).toEqual(['/v1/me','/v1/bootstrap']);expect(requests.map(r=>r.path)).toEqual(['/v1/transport-health','/v1/me','/v1/bootstrap']);
  });
  it('negotiates one packet for concurrent reads with the new worker',async()=>{
    const {client,requests}=fixture(true);await finish(client.probe());
    const result=await finish(Promise.all(Array.from({length:10},(_,i)=>client.request(read(`/v1/item/${i}`)))));
    expect(result).toHaveLength(10);expect(requests.map(r=>r.path)).toEqual(['/v1/transport-health',readBatchPath]);
  });
  it('continues to work after the server is rolled back without retrying unsupported batches forever',async()=>{
    const {client,requests,rollback}=fixture(true);await finish(client.probe());rollback();
    const pending=Promise.all([client.request(read('/v1/me')),client.request(read('/v1/bootstrap'))]);
    await vi.advanceTimersByTimeAsync(2000);expect((await pending).every(r=>r.status===200)).toBe(true);
    await finish(Promise.all([client.request(read('/v1/me')),client.request(read('/v1/bootstrap'))]));
    expect(requests.filter(r=>r.path===readBatchPath)).toHaveLength(1);
  });
  it('keeps mutations separate and preserves their operation ID',async()=>{
    const {client,requests}=fixture(true);await finish(client.probe());
    const requestId='operation-1234567890';
    await finish(Promise.all([client.request(read('/v1/me')),client.request(read('/v1/bootstrap')),client.request({method:'POST',path:'/v1/orders',token:'passenger',body:'{}',requestId})]));
    expect(requests.filter(r=>r.path==='/v1/orders')).toMatchObject([{method:'POST',requestId,body:'{}'}]);
    expect(requests.filter(r=>r.path===readBatchPath)).toHaveLength(1);
  });
});
