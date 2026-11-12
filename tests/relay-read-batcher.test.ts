import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {RelayReadBatcher} from '../src/api/relay-read-batcher';
import {readBatchPath,isBatchableReadPath} from '../src/api/read-batch-contract';
import type {RelayRequest,RelayResponse} from '../src/api/max-relay-protocol';
type Request=Omit<RelayRequest,'id'|'expiresAt'>;
const read=(path:string,token='passenger'):Request=>({method:'GET',path,token});
const single=(request:Request):RelayResponse=>({id:'r',status:200,body:JSON.stringify({data:{path:request.path,token:request.token}})});
const response=(request:Request):RelayResponse=>request.path !== readBatchPath ? single(request) : ({id:'batch',status:200,body:JSON.stringify({data:{results:JSON.parse(request.body!).requests.map((item:{id:string;path:string})=>({id:item.id,status:200,body:single({...request,path:item.path}).body})).reverse()}})});
beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
describe('relay read coalescing',()=>{
  it('sends ten simultaneous reads as one encrypted-operation payload and matches reversed results',async()=>{
    const send=vi.fn(async(request:Request)=>response(request));const queue=new RelayReadBatcher(send,vi.fn());
    const pending=Array.from({length:10},(_,i)=>queue.enqueue(read(`/v1/item/${i}`),undefined,1000));
    await vi.advanceTimersByTimeAsync(25);const values=await Promise.all(pending);
    expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0]![0].path).toBe(readBatchPath);
    expect(values.map(v=>JSON.parse(v.body).data.path)).toEqual(Array.from({length:10},(_,i)=>`/v1/item/${i}`));
  });
  it('never mixes different accounts, exceeds ten reads, or batches a mutation',async()=>{
    const send=vi.fn(async(request:Request)=>response(request));const queue=new RelayReadBatcher(send,vi.fn());
    const pending=[...Array.from({length:11},(_,i)=>queue.enqueue(read(`/v1/item/${i}`),undefined,1000)),queue.enqueue(read('/v1/me','driver'),undefined,1000),queue.enqueue({method:'POST',path:'/v1/orders',token:'passenger',body:'{}'},undefined,1000)];
    await vi.advanceTimersByTimeAsync(25);await Promise.all(pending);
    expect(send).toHaveBeenCalledTimes(4);
    expect(send.mock.calls.filter(([r])=>r.method==='POST' && r.path==='/v1/orders')).toHaveLength(1);
  });
  it('cancels one reader without cancelling its remaining group',async()=>{
    let finish!:(value:RelayResponse)=>void;
    const send=vi.fn((request:Request,signal?:AbortSignal)=>new Promise<RelayResponse>(resolve=>{finish=()=>resolve(response(request));expect(signal?.aborted).toBe(false);}));
    const queue=new RelayReadBatcher(send,vi.fn()),abort=new AbortController();
    const first=expect(queue.enqueue(read('/v1/a'),abort.signal,1000)).rejects.toMatchObject({name:'AbortError'});
    const second=queue.enqueue(read('/v1/b'),undefined,1000);
    await vi.advanceTimersByTimeAsync(25);abort.abort();finish({id:'unused',status:0,body:''});await first;
    expect(JSON.parse((await second).body).data.path).toBe('/v1/b');expect(send).toHaveBeenCalledOnce();
  });
  it('aborts the transport when all readers cancel, and sends nothing for a cancelled queue',async()=>{
    const send=vi.fn((_request:Request,_signal?:AbortSignal)=>new Promise<RelayResponse>(()=>{}));const queue=new RelayReadBatcher(send,vi.fn());
    const a=new AbortController(),b=new AbortController();
    const first=expect(queue.enqueue(read('/v1/a'),a.signal,1000)).rejects.toMatchObject({name:'AbortError'});
    const second=expect(queue.enqueue(read('/v1/b'),b.signal,1000)).rejects.toMatchObject({name:'AbortError'});
    await vi.advanceTimersByTimeAsync(25);a.abort();b.abort();await Promise.all([first,second]);expect(send.mock.calls[0]?.[1]?.aborted).toBe(true);
    const c=new AbortController(),third=expect(queue.enqueue(read('/v1/c'),c.signal,1000)).rejects.toMatchObject({name:'AbortError'});c.abort();await third;await vi.advanceTimersByTimeAsync(25);expect(send).toHaveBeenCalledOnce();
  });
  it('falls back to individual GETs after rollback to an older server',async()=>{
    const unsupported=vi.fn(),send=vi.fn(async(request:Request)=>request.path===readBatchPath ? {id:'old',status:404,body:'{}'} : single(request));
    const queue=new RelayReadBatcher(send,unsupported),pending=[queue.enqueue(read('/v1/a'),undefined,1000),queue.enqueue(read('/v1/b'),undefined,1000)];
    await vi.advanceTimersByTimeAsync(25);expect((await Promise.all(pending)).every(r=>r.status===200)).toBe(true);expect(send).toHaveBeenCalledTimes(3);expect(unsupported).toHaveBeenCalledOnce();
  });
  it.each([401,403,429,500])('does not bypass an authenticated batch rejection (%s)',async status=>{
    const send=vi.fn(async()=>({id:'rejected',status,body:'{"error":{"code":"DENIED"}}'}));const queue=new RelayReadBatcher(send,vi.fn());
    const pending=[queue.enqueue(read('/v1/a'),undefined,1000),queue.enqueue(read('/v1/b'),undefined,1000)];await vi.advanceTimersByTimeAsync(25);
    expect((await Promise.all(pending)).map(r=>r.status)).toEqual([status,status]);expect(send).toHaveBeenCalledOnce();
  });
  it('rejects missing, duplicated and non-canonical result IDs without assigning another reader data',async()=>{
    for(const ids of [['0','0'],['00','1'],['0'],['0','2']]){
      const send=vi.fn(async()=>({id:'bad',status:200,body:JSON.stringify({data:{results:ids.map(id=>({id,status:200,body:'{}'}))}})}));
      const queue=new RelayReadBatcher(send,vi.fn());const pending=[queue.enqueue(read('/v1/a'),undefined,1000),queue.enqueue(read('/v1/b'),undefined,1000)].map(p=>expect(p).rejects.toThrow('READ_BATCH_INVALID_RESPONSE'));
      await vi.advanceTimersByTimeAsync(25);await Promise.all(pending);
    }
  });
  it('rejects expired reads without sending them later',async()=>{
    const send=vi.fn(async(request:Request)=>response(request));const queue=new RelayReadBatcher(send,vi.fn());
    const pending=expect(queue.enqueue(read('/v1/a'),undefined,10)).rejects.toMatchObject({name:'AbortError'});await vi.advanceTimersByTimeAsync(30);await pending;expect(send).not.toHaveBeenCalled();
  });
  it('keeps internal, auth and recursive endpoints out of the batch',()=>{
    for(const path of ['/v1/internal/test','/v1/%69nternal/test','/v1/auth/refresh','/v1/transport/read-batch','https://elsewhere/v1/me','/v1/me#fragment'])expect(isBatchableReadPath(path)).toBe(false);
    expect(isBatchableReadPath('/v1/addresses/search?query=%D0%93%D1%80')).toBe(true);
  });
});
