import { isBatchableReadPath, readBatchMaxRequests, readBatchPath, type BatchedReadResult } from './read-batch-contract';
import type { RelayRequest, RelayResponse } from './max-relay-protocol';

type Request = Omit<RelayRequest,'id'|'expiresAt'>;
type Send = (request:Request,signal?:AbortSignal,timeoutMs?:number)=>Promise<RelayResponse>;
type Entry = {request:Request;deadline:number;done:boolean;resolve:(value:RelayResponse)=>void;reject:(error:unknown)=>void;
  timer:ReturnType<typeof setTimeout>;signal?:AbortSignal;abort:()=>void;group?:{controller:AbortController;entries:Entry[]}};
const aborted = () => new DOMException('Aborted','AbortError');

/** Only negotiated, authenticated reads. Mutations never enter this queue. */
export class RelayReadBatcher {
  private queue:Entry[]=[];
  private timer?:ReturnType<typeof setTimeout>;
  constructor(private readonly send:Send,private readonly unsupported:()=>void) {}
  canBatch(request:Request) { return request.method === 'GET' && !!request.token && request.body == null && isBatchableReadPath(request.path); }
  enqueue(request:Request,signal:AbortSignal|undefined,timeoutMs:number):Promise<RelayResponse> {
    if (signal?.aborted) return Promise.reject(aborted());
    if (!this.canBatch(request)) return this.send(request,signal,timeoutMs);
    return new Promise((resolve,reject)=>{
      const entry:Entry={request,deadline:Date.now()+timeoutMs,done:false,resolve,reject,signal,abort:()=>{},timer:undefined!};
      entry.abort=()=>{
        this.finish(entry,aborted());
        if (entry.group?.entries.every(item=>item.done)) entry.group.controller.abort();
      };
      entry.timer=setTimeout(entry.abort,timeoutMs);
      signal?.addEventListener('abort',entry.abort,{once:true});
      this.queue.push(entry);
      this.timer ??= setTimeout(()=>{this.timer=undefined;this.flush();},25);
    });
  }
  private finish(entry:Entry,error?:unknown,response?:RelayResponse) {
    if (entry.done) return;
    entry.done=true;clearTimeout(entry.timer);entry.signal?.removeEventListener('abort',entry.abort);
    if (error) entry.reject(error); else entry.resolve(response!);
  }
  private flush() {
    const waiting=this.queue;this.queue=[];
    const groups=new Map<string,Entry[]>();
    for (const entry of waiting) if (!entry.done) {
      const list=groups.get(entry.request.token!) ?? [];list.push(entry);groups.set(entry.request.token!,list);
    }
    for (const entries of groups.values()) for (let i=0;i<entries.length;i+=readBatchMaxRequests) void this.dispatch(entries.slice(i,i+readBatchMaxRequests));
  }
  private async single(entry:Entry) {
    if (entry.done) return;
    const controller=new AbortController();entry.group={controller,entries:[entry]};
    try {this.finish(entry,undefined,await this.send(entry.request,controller.signal,Math.max(1,entry.deadline-Date.now())));}
    catch(error){this.finish(entry,error);}
  }
  private async dispatch(entries:Entry[]) {
    if (entries.length === 1) {await this.single(entries[0]!);return;}
    const controller=new AbortController(),group={controller,entries};
    for (const entry of entries) entry.group=group;
    try {
      const response=await this.send({method:'POST',path:readBatchPath,token:entries[0]!.request.token,
        body:JSON.stringify({requests:entries.map((entry,index)=>({id:String(index),path:entry.request.path}))})},
      controller.signal,Math.max(1,...entries.map(entry=>entry.deadline-Date.now())));
      if ([404,405].includes(response.status)) {
        this.unsupported();await Promise.all(entries.map(entry=>this.single(entry)));return;
      }
      if (response.status !== 200) {for(const entry of entries)this.finish(entry,undefined,response);return;}
      const data=JSON.parse(response.body) as {data?:{results?:BatchedReadResult[]}};
      const results=data.data?.results;
      if (!Array.isArray(results) || results.length !== entries.length || new Set(results.map(item=>item.id)).size !== entries.length ||
          results.some(item=>typeof item.id !== 'string' || !/^(?:0|[1-9]\d*)$/.test(item.id) || Number(item.id)>=entries.length || !Number.isInteger(item.status) || item.status<100 || item.status>599 || typeof item.body !== 'string')) throw new Error('READ_BATCH_INVALID_RESPONSE');
      await Promise.all(entries.map(async(entry,index)=>{
        const result=results.find(item=>item.id === String(index));
        if (!result) throw new Error('READ_BATCH_INVALID_RESPONSE');
        let tooLarge=false;
        if (result.status === 413) {try {tooLarge=JSON.parse(result.body)?.error?.code === 'READ_BATCH_RESPONSE_TOO_LARGE';} catch { /* Preserve the original response. */ }}
        if (tooLarge) {await this.single(entry);return;}
        this.finish(entry,undefined,{id:response.id,status:result.status,body:result.body});
      }));
    } catch(error) {for(const entry of entries)this.finish(entry,error);}
  }
}
